import type { AiProvider } from './apiConfig'
import type { TenderAnalysis } from './tenderAnalysis'

export type LessonOutcome = 'gewonnen' | 'verloren' | 'ingetrokken' | 'onbekend'

export const lessonOutcomeLabels: Record<LessonOutcome, string> = {
  gewonnen: 'Gewonnen',
  verloren: 'Verloren',
  ingetrokken: 'Ingetrokken / niet ingediend',
  onbekend: 'Uitkomst onbekend',
}

export const lessonOutcomes = Object.keys(lessonOutcomeLabels) as LessonOutcome[]

/** Eén leerpunt uit een afgerond project, zoals opgeslagen in de database. */
export type LessonLearned = {
  id: string
  projectTitle: string
  buyer: string | null
  outcome: LessonOutcome
  /** Optionele score (bijv. behaalde of geschatte kans 0-100). */
  score: number | null
  /** Thema/tag, bijv. "prijs", "social return", "ICT". */
  category: string | null
  /** Context: wat speelde er in dit project. */
  situation: string
  /** Het leerpunt zelf. */
  lesson: string
  /** Hoe toe te passen bij een volgend project. */
  recommendation: string
  /** Koppeling naar het bron-dossier/tender. */
  sourceTenderId: string | null
  createdAt: string
  updatedAt: string
}

/** Concept-leerpunt zoals voorgesteld door de AI of ingevoerd door de gebruiker (nog niet opgeslagen). */
export type LessonDraft = {
  category: string
  situation: string
  lesson: string
  recommendation: string
}

export type LessonAiConfig = {
  provider: AiProvider
  baseUrl: string
  apiKey: string
  model: string
}

/** Invoer voor het opslaan van een nieuw leerpunt. */
export type LessonLearnedInput = {
  projectTitle: string
  buyer?: string | null
  outcome: LessonOutcome
  score?: number | null
  category?: string | null
  situation: string
  lesson: string
  recommendation: string
  sourceTenderId?: string | null
}

// --- evaluate-project: AI stelt leerpunten op uit een afgerond project ---

export type EvaluateProjectRequest = {
  project: {
    title: string
    buyer: string
    deadline: string
    tendernedId: string
  }
  outcome: LessonOutcome
  /** Vrije reflectie van de gebruiker: wat ging goed/fout, feedback opdrachtgever, etc. */
  reflection: string
  /** Het uiteindelijke concept (HTML) van het project. */
  draft: string
  analysis: TenderAnalysis | null
  ai?: LessonAiConfig
}

export type EvaluateProjectResponse = {
  lessons: LessonDraft[]
  provider: string
  model: string
}

export type EvaluateProjectError = {
  error: string
}

// --- select-lessons: AI kiest relevante leerpunten voor een nieuw project ---

export type SelectLessonsRequest = {
  project: {
    title: string
    buyer: string
  }
  analysis: TenderAnalysis | null
  /** Korte samenvatting van de aanbestedingsbronnen wanneer er nog geen analyse is. */
  tenderSummary?: string
  /** Kandidaat-leerpunten uit de database (id + kerngegevens). */
  candidates: Array<Pick<LessonLearned, 'id' | 'projectTitle' | 'buyer' | 'outcome' | 'category' | 'situation' | 'lesson' | 'recommendation'>>
  ai?: LessonAiConfig
}

export type SelectedLesson = {
  id: string
  /** Waarom dit leerpunt relevant is voor het nieuwe project. */
  reason: string
}

export type SelectLessonsResponse = {
  selected: SelectedLesson[]
  provider: string
  model: string
}

export type SelectLessonsError = {
  error: string
}
