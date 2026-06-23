import { completeChat, resolveAiFromRequest } from './aiClient'
import type {
  ReviewDraftRequest,
  ReviewDraftResponse,
  ReviewFindingItem,
  ReviewPriority,
} from '../../src/types/reviewDraft'
import type { TenderAnalysis } from '../../src/types/tenderAnalysis'

const DOC_CHAR_LIMIT = 14_000
const DRAFT_CHAR_LIMIT = 40_000
const MAX_FINDINGS = 14

const PRIORITY_RANK: Record<ReviewPriority, number> = {
  kritiek: 0,
  hoog: 1,
  normaal: 2,
}

const stageLabels: Record<ReviewDraftRequest['stage'], string> = {
  brons: 'Brons (eerste concept)',
  zilver: 'Zilver (review verwerkt)',
  goud: 'Goud (eindversie)',
}

const SYSTEM_PROMPT = `Je bent een senior kwaliteitsreviewer voor Nederlandse aanbestedingen (Aanbestedingswet, EMVI, BPKV).
Je beoordeelt een concept-inschrijfstuk tegen de leidraad, de beoordelingscriteria en de bedrijfsbronnen.

DOEL
Lever scherpe, toetsbare reviewbevindingen die de winkans vergroten. Geen complimenten, geen samenvatting — alleen wat beter moet en waarom.

WAAR JE OP LET
- Dekking: is elk verplicht onderwerp en beoordelingscriterium uit de leidraad inhoudelijk geraakt?
- Bewijslast: zijn claims onderbouwd met concrete feiten, cases, KPI's of processen uit de bedrijfsbronnen? Signaleer lege superlatieven.
- Vraag achter de vraag: adresseert de tekst de onderliggende behoefte van de opdrachtgever, niet alleen de letterlijke vraag?
- Eisen aan de inschrijving: vorm, anonimiteit, taal, opmaak, indiening — schending is kritiek.
- Volume: te kort laat punten liggen; overschrijding van een hard maximum is diskwalificerend.
- Consistentie en concreetheid: vage passages, herhaling, ontbrekende rollen/planning.

PRIORITEITEN
- "kritiek": diskwalificerend of een hard criterium dat ontbreekt/geschonden is
- "hoog": kost aantoonbaar punten of verzwakt de score
- "normaal": verbetering die de kwaliteit verhoogt

REGELS
- Baseer je uitsluitend op de aangeleverde bronnen, analyse en het concept. Verzin geen eisen.
- Je krijgt een heuristische baseline met al gevonden punten. Herhaal die niet; vul aan met inhoudelijke, kwalitatieve bevindingen die een mens zou maken.
- Elke bevinding is concreet en handelingsgericht: benoem WAT en HOE het beter moet, met verwijzing naar sectie/criterium waar relevant.
- Maximaal ${MAX_FINDINGS} bevindingen, geordend op prioriteit.
- Schrijf in het Nederlands.

Antwoord uitsluitend met geldig JSON in exact deze vorm:
{
  "findings": [
    { "priority": "kritiek|hoog|normaal", "title": "", "detail": "" }
  ]
}`

function trimSource(text: string, max = DOC_CHAR_LIMIT): string {
  const cleaned = text.replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max)}…`
}

function draftToPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DRAFT_CHAR_LIMIT)
}

function formatDocuments(request: ReviewDraftRequest): string {
  if (!request.documents.length) return '- geen bronnen aangeleverd'
  return request.documents
    .map((doc) => `- [${doc.type}] ${doc.name}:\n${trimSource(doc.content)}`)
    .join('\n\n')
}

function formatComments(request: ReviewDraftRequest): string {
  const open = request.comments.filter((comment) => !comment.resolved)
  if (!open.length) return '- geen open opmerkingen'
  return open.map((comment) => `- Fragment: ${comment.fragment}\n  Opmerking: ${comment.note}`).join('\n')
}

function formatBaseline(baseline: ReviewFindingItem[]): string {
  if (!baseline.length) return '- (geen)'
  return baseline.map((item) => `- [${item.priority}] ${item.title}: ${item.detail}`).join('\n')
}

function formatAnalysis(analysis: TenderAnalysis | null): string {
  if (!analysis) return 'Geen leidraadanalyse beschikbaar — beoordeel op basis van bronnen en het concept.'

  const lines = [
    `- Samenvatting: ${analysis.summary}`,
    `- Leidraad gevonden: ${analysis.leidraadFound ? 'ja' : 'nee'}`,
  ]

  if (analysis.targetWordCount) lines.push(`- Max. woorden: ${analysis.targetWordCount}`)
  if (analysis.targetCharCount) lines.push(`- Max. karakters: ${analysis.targetCharCount}`)

  const mandatory = (analysis.contentRequirements ?? []).filter((req) => req.mandatory)
  if (mandatory.length) {
    lines.push('- Verplichte onderwerpen:')
    mandatory.forEach((req) => lines.push(`  • ${req.topic} — ${req.detail}`))
  }

  if ((analysis.evaluationCriteria ?? []).length) {
    lines.push('- Beoordelingscriteria:')
    analysis.evaluationCriteria.forEach((criterion) => lines.push(`  • ${criterion}`))
  }

  const mandatorySubmission = (analysis.submissionRequirements ?? []).filter((req) => req.mandatory)
  if (mandatorySubmission.length) {
    lines.push('- Verplichte eisen aan de inschrijving (hard):')
    mandatorySubmission.forEach((req) => lines.push(`  • [${req.category}] ${req.requirement}`))
  }

  if (analysis.underlyingIntent) {
    lines.push(`- Vraag achter de vraag: ${analysis.underlyingIntent.questionBehindQuestion}`)
    lines.push(`- Onderliggende behoefte: ${analysis.underlyingIntent.underlyingNeed}`)
  }

  if ((analysis.gaps ?? []).length) {
    lines.push('- Bekende gaten:')
    analysis.gaps.forEach((gap) => lines.push(`  • ${gap}`))
  }

  return lines.join('\n')
}

function buildUserPrompt(request: ReviewDraftRequest): string {
  return `Fase: ${stageLabels[request.stage]}

Project:
- Titel: ${request.project.title}
- Opdrachtgever: ${request.project.buyer}
- Deadline: ${request.project.deadline}
- TenderNed: ${request.project.tendernedId}

Leidraadanalyse:
${formatAnalysis(request.analysis)}

Heuristische baseline (al gesignaleerd — NIET herhalen, wel aanvullen):
${formatBaseline(request.baseline)}

Open menselijke reviewopmerkingen (betrek in je oordeel):
${formatComments(request)}

=== BRONNEN ===
${formatDocuments(request)}

=== CONCEPT (platte tekst) ===
${draftToPlainText(request.draft) || '(leeg concept)'}

Lever je reviewbevindingen als JSON.`
}

function normalizePriority(value: unknown): ReviewPriority {
  return value === 'kritiek' || value === 'hoog' ? value : value === 'normaal' ? 'normaal' : 'hoog'
}

function parseFindings(content: string): ReviewFindingItem[] {
  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim()
  let parsed: { findings?: unknown }
  try {
    parsed = JSON.parse(jsonText) as { findings?: unknown }
  } catch {
    return []
  }

  if (!Array.isArray(parsed.findings)) return []

  return parsed.findings
    .map((raw): ReviewFindingItem | null => {
      if (!raw || typeof raw !== 'object') return null
      const item = raw as Record<string, unknown>
      const title = typeof item.title === 'string' ? item.title.trim() : ''
      const detail = typeof item.detail === 'string' ? item.detail.trim() : ''
      if (!title || !detail) return null
      return { priority: normalizePriority(item.priority), title, detail }
    })
    .filter((item): item is ReviewFindingItem => item !== null)
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Baseline (deterministische feiten) + AI-bevindingen, ontdubbeld op titel, geordend op prioriteit. */
function mergeFindings(baseline: ReviewFindingItem[], aiFindings: ReviewFindingItem[]): ReviewFindingItem[] {
  const seen = new Set<string>()
  const merged: ReviewFindingItem[] = []

  for (const item of [...baseline, ...aiFindings]) {
    const key = normalizeTitle(item.title)
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }

  return merged
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    .slice(0, MAX_FINDINGS)
}

export async function handleReviewDraftRequest(request: ReviewDraftRequest): Promise<Response> {
  if (!request.draft?.trim()) {
    return Response.json({ error: 'Geen concept om te reviewen.' }, { status: 400 })
  }

  const baseline = Array.isArray(request.baseline) ? request.baseline : []

  let ai: ReturnType<typeof resolveAiFromRequest>
  try {
    ai = resolveAiFromRequest(request.ai, 'REVIEW_MODEL')
  } catch {
    // Geen AI-reviewagent geconfigureerd → lever de heuristische baseline ongewijzigd terug.
    return Response.json({
      findings: baseline,
      provider: 'heuristiek',
      model: 'lokaal',
      enriched: false,
    } satisfies ReviewDraftResponse)
  }

  try {
    const content = await completeChat(
      ai,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(request) },
      ],
      { jsonMode: ai.provider !== 'anthropic', maxTokens: 4_000, timeoutMs: 120_000, useThinking: false },
    )

    const aiFindings = parseFindings(content)

    return Response.json({
      findings: mergeFindings(baseline, aiFindings),
      provider: ai.provider,
      model: ai.model,
      enriched: aiFindings.length > 0,
    } satisfies ReviewDraftResponse)
  } catch {
    // AI-call mislukt → val terug op de baseline zodat de review altijd iets oplevert.
    return Response.json({
      findings: baseline,
      provider: 'heuristiek',
      model: 'lokaal',
      enriched: false,
    } satisfies ReviewDraftResponse)
  }
}
