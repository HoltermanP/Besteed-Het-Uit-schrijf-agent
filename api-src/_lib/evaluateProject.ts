import { completeChat, resolveAiFromRequest } from './aiClient'
import type {
  EvaluateProjectRequest,
  EvaluateProjectResponse,
  LessonDraft,
  LessonOutcome,
} from '../../src/types/lessonLearned'
import type { TenderAnalysis } from '../../src/types/tenderAnalysis'

const DRAFT_CHAR_LIMIT = 30_000
const REFLECTION_CHAR_LIMIT = 8_000
const MAX_LESSONS = 8

const outcomeLabels: Record<LessonOutcome, string> = {
  gewonnen: 'Gewonnen',
  verloren: 'Verloren',
  ingetrokken: 'Ingetrokken / niet ingediend',
  onbekend: 'Uitkomst onbekend',
}

const SYSTEM_PROMPT = `Je bent een senior bid-evaluator voor Nederlandse aanbestedingen (Aanbestedingswet, EMVI, BPKV).
Je destilleert uit een afgerond project concrete, herbruikbare leerpunten ("lessons learned") die de winkans bij vergelijkbare toekomstige aanbestedingen vergroten.

DOEL
Lever scherpe, overdraagbare leerpunten — geen samenvatting van het project. Elk leerpunt moet bij een vólgend project bruikbaar zijn als richtlijn.

WAAR JE OP LET
- Wat werkte aantoonbaar (en is herhaalbaar) en wat kostte punten (en moet anders)?
- Bewijsvoering, dekking van beoordelingscriteria, prijsstrategie, vorm-/indieningseisen, planning en bewijslast.
- Feedback van de opdrachtgever uit de reflectie weegt zwaar.
- Vertaal incidentele observaties naar een algemeen toepasbare les.

REGELS
- Baseer je uitsluitend op het aangeleverde concept, de analyse, de uitkomst en de reflectie. Verzin geen feiten.
- Formuleer elk leerpunt generiek genoeg om bij andere aanbestedingen toe te passen, maar concreet genoeg om naar te handelen.
- Geef per leerpunt een "category" (kort thema, bijv. "prijs", "social return", "bewijslast", "vormeisen", "planning"), een "situation" (wat speelde er), een "lesson" (het leerpunt) en een "recommendation" (hoe het volgende keer toe te passen).
- Maximaal ${MAX_LESSONS} leerpunten, gerangschikt op impact (belangrijkste eerst).
- Schrijf in het Nederlands.

Antwoord uitsluitend met geldig JSON in exact deze vorm:
{
  "lessons": [
    { "category": "", "situation": "", "lesson": "", "recommendation": "" }
  ]
}`

function draftToPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DRAFT_CHAR_LIMIT)
}

function formatAnalysis(analysis: TenderAnalysis | null): string {
  if (!analysis) return 'Geen leidraadanalyse beschikbaar.'
  const lines = [`- Samenvatting: ${analysis.summary}`]
  if ((analysis.evaluationCriteria ?? []).length) {
    lines.push('- Beoordelingscriteria:')
    analysis.evaluationCriteria.forEach((criterion) => lines.push(`  • ${criterion}`))
  }
  if (analysis.underlyingIntent) {
    lines.push(`- Vraag achter de vraag: ${analysis.underlyingIntent.questionBehindQuestion}`)
  }
  return lines.join('\n')
}

function buildUserPrompt(request: EvaluateProjectRequest): string {
  return `Project:
- Titel: ${request.project.title}
- Opdrachtgever: ${request.project.buyer}
- Deadline: ${request.project.deadline}
- TenderNed: ${request.project.tendernedId}
- Uitkomst: ${outcomeLabels[request.outcome] ?? request.outcome}

Leidraadanalyse:
${formatAnalysis(request.analysis)}

Reflectie van het team (wat ging goed/fout, feedback opdrachtgever, opmerkingen):
${request.reflection?.trim().slice(0, REFLECTION_CHAR_LIMIT) || '- (geen reflectie aangeleverd)'}

=== INGEDIEND CONCEPT (platte tekst) ===
${draftToPlainText(request.draft) || '(geen concept beschikbaar)'}

Lever de leerpunten als JSON.`
}

function parseLessons(content: string): LessonDraft[] {
  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim()
  let parsed: { lessons?: unknown }
  try {
    parsed = JSON.parse(jsonText) as { lessons?: unknown }
  } catch {
    return []
  }
  if (!Array.isArray(parsed.lessons)) return []

  return parsed.lessons
    .map((raw): LessonDraft | null => {
      if (!raw || typeof raw !== 'object') return null
      const item = raw as Record<string, unknown>
      const lesson = typeof item.lesson === 'string' ? item.lesson.trim() : ''
      if (!lesson) return null
      return {
        category: typeof item.category === 'string' ? item.category.trim() : '',
        situation: typeof item.situation === 'string' ? item.situation.trim() : '',
        lesson,
        recommendation: typeof item.recommendation === 'string' ? item.recommendation.trim() : '',
      }
    })
    .filter((item): item is LessonDraft => item !== null)
    .slice(0, MAX_LESSONS)
}

export async function handleEvaluateProjectRequest(
  request: EvaluateProjectRequest,
): Promise<Response> {
  if (!request.draft?.trim() && !request.reflection?.trim()) {
    return Response.json(
      { error: 'Geen concept of reflectie aangeleverd om uit te evalueren.' },
      { status: 400 },
    )
  }

  let ai: ReturnType<typeof resolveAiFromRequest>
  try {
    ai = resolveAiFromRequest(request.ai, 'REVIEW_MODEL')
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Geen AI-configuratie beschikbaar voor evaluatie.'
    return Response.json({ error: message }, { status: 400 })
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

    const lessons = parseLessons(content)
    return Response.json({
      lessons,
      provider: ai.provider,
      model: ai.model,
    } satisfies EvaluateProjectResponse)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'AI-evaluatie van het project is mislukt.'
    return Response.json({ error: message }, { status: 502 })
  }
}
