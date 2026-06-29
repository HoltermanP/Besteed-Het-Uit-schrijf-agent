import { getApiConfig, isReviewConfigured, isWriterConfigured } from './apiConfig'
import type { TenderAnalysis } from '../types/tenderAnalysis'
import type {
  EvaluateProjectResponse,
  LessonAiConfig,
  LessonDraft,
  LessonLearned,
  LessonLearnedInput,
  LessonOutcome,
  SelectLessonsResponse,
} from '../types/lessonLearned'

type LessonsResponse = { lessons: LessonLearned[] }
type LessonResponse = { lesson: LessonLearned }
type ApiError = { error: string }

/** Bouwt de AI-config voor leerpunt-endpoints: review-config indien ingesteld, anders writer-config. */
function buildAi(): LessonAiConfig | undefined {
  const apiConfig = getApiConfig()
  const section = isReviewConfigured(apiConfig)
    ? apiConfig.review
    : isWriterConfigured(apiConfig)
      ? apiConfig.writer
      : null
  if (!section) return undefined
  return {
    provider: section.provider,
    baseUrl: section.baseUrl,
    apiKey: section.apiKey,
    model: section.model,
  }
}

export async function fetchLessons(): Promise<LessonLearned[]> {
  const response = await fetch('/api/lessons-learned')
  const data = (await response.json()) as LessonsResponse | ApiError
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'Leerpunten ophalen mislukt.')
  }
  return data.lessons
}

export async function createLesson(input: LessonLearnedInput): Promise<LessonLearned> {
  const response = await fetch('/api/lessons-learned', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = (await response.json()) as LessonResponse | ApiError
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'Leerpunt opslaan mislukt.')
  }
  return data.lesson
}

export async function updateLesson(input: {
  id: string
  projectTitle?: string
  buyer?: string | null
  outcome?: LessonOutcome
  score?: number | null
  category?: string | null
  situation?: string
  lesson?: string
  recommendation?: string
}): Promise<LessonLearned> {
  const response = await fetch('/api/lessons-learned', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = (await response.json()) as LessonResponse | ApiError
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'Leerpunt bijwerken mislukt.')
  }
  return data.lesson
}

export async function deleteLesson(id: string): Promise<void> {
  const response = await fetch(`/api/lessons-learned?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  const data = (await response.json()) as { ok?: boolean; error?: string }
  if (!response.ok || data.error) {
    throw new Error(data.error ?? 'Leerpunt verwijderen mislukt.')
  }
}

/** Laat de AI leerpunten opstellen uit een afgerond project. */
export async function evaluateProjectViaApi(args: {
  project: { title: string; buyer: string; deadline: string; tendernedId: string }
  outcome: LessonOutcome
  reflection: string
  draft: string
  analysis: TenderAnalysis | null
}): Promise<EvaluateProjectResponse> {
  const response = await fetch('/api/evaluate-project', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...args, ai: buildAi() }),
  })
  const data = (await response.json()) as EvaluateProjectResponse | ApiError
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'AI-evaluatie mislukt.')
  }
  return data
}

/**
 * Laat de AI de relevante leerpunten kiezen voor een nieuw project.
 * Geeft `null` terug bij fouten zodat de UI zonder leerpunten kan doorgaan.
 */
export async function selectRelevantLessons(args: {
  project: { title: string; buyer: string }
  analysis: TenderAnalysis | null
  tenderSummary?: string
  candidates: LessonLearned[]
}): Promise<LessonLearned[]> {
  if (!args.candidates.length) return []

  try {
    const response = await fetch('/api/select-lessons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: args.project,
        analysis: args.analysis,
        tenderSummary: args.tenderSummary,
        candidates: args.candidates.map((c) => ({
          id: c.id,
          projectTitle: c.projectTitle,
          buyer: c.buyer,
          outcome: c.outcome,
          category: c.category,
          situation: c.situation,
          lesson: c.lesson,
          recommendation: c.recommendation,
        })),
        ai: buildAi(),
      }),
    })

    const data = (await response.json()) as SelectLessonsResponse | ApiError
    if (!response.ok || 'error' in data) return []

    const byId = new Map(args.candidates.map((c) => [c.id, c]))
    return data.selected
      .map((sel) => byId.get(sel.id))
      .filter((lesson): lesson is LessonLearned => Boolean(lesson))
  } catch {
    return []
  }
}

/** Zet geselecteerde leerpunten om naar één tekstblok voor de schrijfagent. */
export function lessonsToPromptContent(lessons: LessonLearned[]): string {
  return lessons
    .map((lesson, index) => {
      const header = [lesson.category, lesson.outcome].filter(Boolean).join(' · ')
      return `${index + 1}. ${lesson.lesson}${header ? ` [${header}]` : ''}
   Context: ${lesson.situation || '—'}
   Toepassen: ${lesson.recommendation || '—'}`
    })
    .join('\n\n')
}

export type { LessonDraft }
