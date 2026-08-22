import { completeChat, resolveAiFromRequest } from './aiClient'
import type {
  SelectEvidenceRequest,
  SelectEvidenceResponse,
  SelectedEvidence,
} from '../../src/types/evidenceBlock'
import type { TenderAnalysis } from '../../src/types/tenderAnalysis'

/*
 * Kiest uit de bewijsbibliotheek de bouwstenen die bij dít stuk passen. De hele
 * bibliotheek meesturen naar de schrijfagent zou het bronnenblok laten dichtslibben en
 * de agent verleiden tot bewijs dat niets met de vraag te maken heeft; een goedkope
 * voorselectie houdt de citaten scherp.
 */

const MAX_CANDIDATES = 80
const MAX_SELECTED = 12
const CANDIDATE_CHAR_LIMIT = 500
const SUMMARY_CHAR_LIMIT = 6_000

const SYSTEM_PROMPT = `Je bent een bid-strateeg voor Nederlandse aanbestedingen.
Je krijgt een aanbesteding (en meestal het specifieke inschrijfstuk dat geschreven wordt) plus een bibliotheek met vastgelegde bewijsbouwstenen: referenties, cases en cijfers van de inschrijver.
Kies de bouwstenen waarmee dit stuk zijn claims aantoonbaar kan onderbouwen.

REGELS
- Kies alleen bouwstenen die inhoudelijk aansluiten op de vraag, de beoordelingscriteria, de branche of de opdrachtgever. Liever streng dan ruim.
- Kies bij voorkeur bouwstenen die een beoordelingscriterium of een verplicht onderwerp hard maken.
- Maximaal ${MAX_SELECTED} bouwstenen, belangrijkste eerst.
- Geef per gekozen bouwsteen kort aan waarvoor hij in dit stuk bruikbaar is.
- Gebruik uitsluitend de "id"-waarden uit de aangeleverde lijst.

Antwoord uitsluitend met geldig JSON in exact deze vorm:
{
  "selected": [
    { "id": "", "reason": "" }
  ]
}`

function formatAnalysis(analysis: TenderAnalysis | null, fallback: string | undefined): string {
  if (analysis) {
    const lines = [`- Samenvatting: ${analysis.summary}`]
    const mandatory = (analysis.contentRequirements ?? []).filter((req) => req.mandatory)
    if (mandatory.length) {
      lines.push('- Verplichte onderwerpen:')
      mandatory.slice(0, 12).forEach((req) => lines.push(`  • ${req.topic}`))
    }
    if ((analysis.evaluationCriteria ?? []).length) {
      lines.push('- Beoordelingscriteria:')
      analysis.evaluationCriteria.slice(0, 12).forEach((criterion) => lines.push(`  • ${criterion}`))
    }
    return lines.join('\n')
  }
  if (fallback?.trim()) {
    return `- Aanbestedingssamenvatting:\n${fallback.trim().slice(0, SUMMARY_CHAR_LIMIT)}`
  }
  return 'Geen analyse of samenvatting beschikbaar.'
}

function formatCandidates(request: SelectEvidenceRequest): string {
  return request.candidates
    .slice(0, MAX_CANDIDATES)
    .map((candidate) => {
      const meta = [candidate.kind, candidate.client, candidate.category].filter(Boolean).join(' · ')
      return `- id: ${candidate.id} [${meta}] ${candidate.title}\n  ${candidate.summary.slice(0, CANDIDATE_CHAR_LIMIT)}`
    })
    .join('\n')
}

function parseSelected(content: string, validIds: Set<string>): SelectedEvidence[] {
  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim()
  let parsed: { selected?: unknown }
  try {
    parsed = JSON.parse(jsonText) as { selected?: unknown }
  } catch {
    return []
  }
  if (!Array.isArray(parsed.selected)) return []

  const seen = new Set<string>()
  return parsed.selected
    .map((raw): SelectedEvidence | null => {
      if (!raw || typeof raw !== 'object') return null
      const item = raw as Record<string, unknown>
      const id = typeof item.id === 'string' ? item.id.trim() : ''
      if (!id || !validIds.has(id) || seen.has(id)) return null
      seen.add(id)
      return { id, reason: typeof item.reason === 'string' ? item.reason.trim() : '' }
    })
    .filter((item): item is SelectedEvidence => item !== null)
    .slice(0, MAX_SELECTED)
}

export async function handleSelectEvidenceRequest(request: SelectEvidenceRequest): Promise<Response> {
  const candidates = Array.isArray(request.candidates) ? request.candidates : []
  if (!candidates.length) {
    return Response.json({ selected: [], provider: 'geen', model: 'geen' } satisfies SelectEvidenceResponse)
  }

  // Zonder AI (of bij een storing) liever de meest recente bouwstenen dan geen bewijs:
  // de schrijfagent mag alleen citeren wat hij krijgt.
  const fallback: SelectEvidenceResponse = {
    selected: candidates.slice(0, MAX_SELECTED).map((candidate) => ({ id: candidate.id, reason: '' })),
    provider: 'heuristiek',
    model: 'lokaal',
  }

  let ai: ReturnType<typeof resolveAiFromRequest>
  try {
    ai = resolveAiFromRequest(request.ai, 'REVIEW_MODEL', 'light')
  } catch {
    return Response.json(fallback)
  }

  try {
    const validIds = new Set(candidates.map((candidate) => candidate.id))
    const doc = request.document
    const content = await completeChat(
      ai,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Aanbesteding:
- Titel: ${request.project.title}
- Opdrachtgever: ${request.project.buyer}
${doc ? `\nTe schrijven stuk:\n- Titel: ${doc.title}\n- Vraag uit de leidraad: ${doc.question || '(niet letterlijk bekend)'}\n` : ''}
${formatAnalysis(request.analysis, request.tenderSummary)}

=== BEWIJSBIBLIOTHEEK ===
${formatCandidates(request)}

Lever je selectie als JSON.`,
        },
      ],
      { jsonMode: ai.provider !== 'anthropic', maxTokens: 2_000, timeoutMs: 90_000, useThinking: false, label: 'bewijs-selectie' },
    )

    return Response.json({
      selected: parseSelected(content, validIds),
      provider: ai.provider,
      model: ai.model,
    } satisfies SelectEvidenceResponse)
  } catch {
    return Response.json(fallback)
  }
}
