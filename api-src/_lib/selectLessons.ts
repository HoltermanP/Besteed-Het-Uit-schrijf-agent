import { completeChat, resolveAiFromRequest } from './aiClient'
import type {
  SelectLessonsRequest,
  SelectLessonsResponse,
  SelectedLesson,
} from '../../src/types/lessonLearned'
import type { TenderAnalysis } from '../../src/types/tenderAnalysis'

const MAX_CANDIDATES = 60
const MAX_SELECTED = 8
const CANDIDATE_CHAR_LIMIT = 600
const SUMMARY_CHAR_LIMIT = 6_000

const SYSTEM_PROMPT = `Je bent een bid-strateeg voor Nederlandse aanbestedingen.
Je krijgt een nieuwe aanbesteding en een lijst eerder vastgelegde leerpunten ("lessons learned") uit afgeronde projecten.
Kies de leerpunten die aantoonbaar relevant zijn voor déze nieuwe aanbesteding en die de winkans kunnen vergroten.

REGELS
- Kies alleen leerpunten die echt van toepassing zijn op de inhoud, opdrachtgever, branche of beoordelingscriteria van deze aanbesteding. Liever streng dan ruim.
- Negeer leerpunten die niet passen; het is prima om er weinig of geen te kiezen.
- Maximaal ${MAX_SELECTED} leerpunten, belangrijkste eerst.
- Geef per gekozen leerpunt een korte reden waarom het hier relevant is.
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
      analysis.evaluationCriteria.slice(0, 12).forEach((c) => lines.push(`  • ${c}`))
    }
    return lines.join('\n')
  }
  if (fallback?.trim()) {
    return `- Aanbestedingssamenvatting:\n${fallback.trim().slice(0, SUMMARY_CHAR_LIMIT)}`
  }
  return 'Geen analyse of samenvatting beschikbaar.'
}

function formatCandidates(request: SelectLessonsRequest): string {
  return request.candidates
    .slice(0, MAX_CANDIDATES)
    .map((c) => {
      const meta = [c.category, c.buyer, c.outcome].filter(Boolean).join(' · ')
      const body = `${c.lesson} — Toepassing: ${c.recommendation}`.slice(0, CANDIDATE_CHAR_LIMIT)
      return `- id: ${c.id}${meta ? ` [${meta}]` : ''}\n  ${body}`
    })
    .join('\n')
}

function parseSelected(content: string, validIds: Set<string>): SelectedLesson[] {
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
    .map((raw): SelectedLesson | null => {
      if (!raw || typeof raw !== 'object') return null
      const item = raw as Record<string, unknown>
      const id = typeof item.id === 'string' ? item.id.trim() : ''
      if (!id || !validIds.has(id) || seen.has(id)) return null
      seen.add(id)
      return { id, reason: typeof item.reason === 'string' ? item.reason.trim() : '' }
    })
    .filter((item): item is SelectedLesson => item !== null)
    .slice(0, MAX_SELECTED)
}

export async function handleSelectLessonsRequest(
  request: SelectLessonsRequest,
): Promise<Response> {
  const candidates = Array.isArray(request.candidates) ? request.candidates : []
  if (!candidates.length) {
    return Response.json({ selected: [], provider: 'geen', model: 'geen' } satisfies SelectLessonsResponse)
  }

  let ai: ReturnType<typeof resolveAiFromRequest>
  try {
    ai = resolveAiFromRequest(request.ai, 'REVIEW_MODEL')
  } catch {
    // Geen AI geconfigureerd → val terug op de meest recente leerpunten (door client al gesorteerd).
    return Response.json({
      selected: candidates.slice(0, MAX_SELECTED).map((c) => ({ id: c.id, reason: '' })),
      provider: 'heuristiek',
      model: 'lokaal',
    } satisfies SelectLessonsResponse)
  }

  try {
    const validIds = new Set(candidates.map((c) => c.id))
    const content = await completeChat(
      ai,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Nieuwe aanbesteding:
- Titel: ${request.project.title}
- Opdrachtgever: ${request.project.buyer}

${formatAnalysis(request.analysis, request.tenderSummary)}

=== BESCHIKBARE LEERPUNTEN ===
${formatCandidates(request)}

Lever je selectie als JSON.`,
        },
      ],
      { jsonMode: ai.provider !== 'anthropic', maxTokens: 2_000, timeoutMs: 90_000, useThinking: false },
    )

    return Response.json({
      selected: parseSelected(content, validIds),
      provider: ai.provider,
      model: ai.model,
    } satisfies SelectLessonsResponse)
  } catch {
    // AI-call mislukt → val terug op de meest recente leerpunten.
    return Response.json({
      selected: candidates.slice(0, MAX_SELECTED).map((c) => ({ id: c.id, reason: '' })),
      provider: 'heuristiek',
      model: 'lokaal',
    } satisfies SelectLessonsResponse)
  }
}
