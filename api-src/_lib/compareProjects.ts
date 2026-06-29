import { completeChat, resolveAiFromRequest } from './aiClient'
import type {
  CompareProjectInput,
  CompareProjectsRequest,
  CompareProjectsResponse,
  ComparisonDifference,
} from '../../src/types/compareProjects'
import type { LessonDraft } from '../../src/types/lessonLearned'

const EXCERPT_CHAR_LIMIT = 8_000
const MAX_PROJECTS = 4
const MAX_LESSONS = 6

const SYSTEM_PROMPT = `Je bent een senior bid-strateeg voor Nederlandse aanbestedingen (Aanbestedingswet, EMVI, BPKV).
Je vergelijkt hoe een inschrijver meerdere projecten in het verleden heeft aangepakt en maakt de aanpak-keuzes expliciet.

DOEL
Help de inschrijver leren van zijn eigen historie: laat zien wat de aanpakken gemeen hadden, waarin ze verschilden, welke patronen opvallen en welke herbruikbare leerpunten dit oplevert voor toekomstige aanbestedingen.

WAAR JE OP LET
- Opbouw en structuur van het plan van aanpak (volgorde, koppen, lengte).
- Dekking van de beoordelingscriteria en de bewijsvoering.
- Welke bronnen zijn ingezet en hoe zwaar.
- Toon, concreetheid en onderbouwing.
- Verschillen die plausibel de winkans beïnvloeden.

REGELS
- Baseer je uitsluitend op de aangeleverde projectgegevens. Verzin geen feiten en geen uitkomsten die er niet staan.
- Wees concreet en vergelijkend: benoem per verschil hoe de projecten van elkaar afweken.
- Leerpunten moeten generiek genoeg zijn voor een volgend project, maar concreet genoeg om naar te handelen.
- Geef per leerpunt een "category" (kort thema), "situation" (wat speelde er, met verwijzing naar de projecten), "lesson" (het leerpunt) en "recommendation" (hoe toe te passen).
- Maximaal ${MAX_LESSONS} leerpunten, belangrijkste eerst. Schrijf in het Nederlands.

Antwoord uitsluitend met geldig JSON in exact deze vorm:
{
  "overview": "",
  "similarities": [""],
  "differences": [{ "aspect": "", "observation": "" }],
  "insights": [""],
  "lessons": [{ "category": "", "situation": "", "lesson": "", "recommendation": "" }]
}`

function formatProject(project: CompareProjectInput, index: number): string {
  const evaluationCriteria = Array.isArray(project.evaluationCriteria) ? project.evaluationCriteria : []
  const headings = Array.isArray(project.headings) ? project.headings : []
  const lines = [
    `### Project ${index + 1}: ${project.title || 'Naamloos project'}`,
    `- Opdrachtgever: ${project.buyer || '—'}`,
    `- Deadline: ${project.deadline || '—'}`,
    `- Fase: ${project.stage || '—'}`,
    `- Woorden in concept: ${project.wordCount ?? 0}`,
    `- Gebruikte bronnen: ${project.documentOverview || '—'}`,
  ]
  if (project.analysisSummary) {
    lines.push(`- Leidraadanalyse: ${project.analysisSummary}`)
  }
  if (evaluationCriteria.length) {
    lines.push(`- Beoordelingscriteria: ${evaluationCriteria.join('; ')}`)
  }
  if (headings.length) {
    lines.push(`- Opbouw concept (koppen): ${headings.join(' › ')}`)
  }
  lines.push(
    `- Fragment concept (platte tekst): ${(project.draftExcerpt ?? '').slice(0, EXCERPT_CHAR_LIMIT) || '(geen concept beschikbaar)'}`,
  )
  return lines.join('\n')
}

function buildUserPrompt(projects: CompareProjectInput[]): string {
  return `Vergelijk de aanpak van de volgende ${projects.length} projecten.

${projects.map(formatProject).join('\n\n')}

Lever de vergelijking als JSON.`
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item): item is string => item.length > 0)
}

function parseDifferences(value: unknown): ComparisonDifference[] {
  if (!Array.isArray(value)) return []
  return value
    .map((raw): ComparisonDifference | null => {
      if (!raw || typeof raw !== 'object') return null
      const item = raw as Record<string, unknown>
      const observation = typeof item.observation === 'string' ? item.observation.trim() : ''
      if (!observation) return null
      return {
        aspect: typeof item.aspect === 'string' ? item.aspect.trim() : '',
        observation,
      }
    })
    .filter((item): item is ComparisonDifference => item !== null)
}

function parseLessons(value: unknown): LessonDraft[] {
  if (!Array.isArray(value)) return []
  return value
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

function parseComparison(content: string) {
  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim()
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>
  } catch {
    return { overview: '', similarities: [], differences: [], insights: [], lessons: [] }
  }
  return {
    overview: typeof parsed.overview === 'string' ? parsed.overview.trim() : '',
    similarities: asStringArray(parsed.similarities),
    differences: parseDifferences(parsed.differences),
    insights: asStringArray(parsed.insights),
    lessons: parseLessons(parsed.lessons),
  }
}

export async function handleCompareProjectsRequest(
  request: CompareProjectsRequest,
): Promise<Response> {
  const projects = Array.isArray(request.projects) ? request.projects.slice(0, MAX_PROJECTS) : []
  if (projects.length < 2) {
    return Response.json(
      { error: 'Selecteer minstens twee projecten om te vergelijken.' },
      { status: 400 },
    )
  }

  let ai: ReturnType<typeof resolveAiFromRequest>
  try {
    ai = resolveAiFromRequest(request.ai, 'REVIEW_MODEL')
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Geen AI-configuratie beschikbaar voor vergelijking.'
    return Response.json({ error: message }, { status: 400 })
  }

  try {
    const content = await completeChat(
      ai,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(projects) },
      ],
      { jsonMode: ai.provider !== 'anthropic', maxTokens: 4_000, timeoutMs: 120_000, useThinking: false },
    )

    const comparison = parseComparison(content)
    return Response.json({
      ...comparison,
      provider: ai.provider,
      model: ai.model,
    } satisfies CompareProjectsResponse)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'AI-vergelijking van de projecten is mislukt.'
    return Response.json({ error: message }, { status: 502 })
  }
}
