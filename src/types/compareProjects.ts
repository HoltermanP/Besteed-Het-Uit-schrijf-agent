import type { LessonAiConfig, LessonDraft } from './lessonLearned'

/** Compacte weergave van één project zoals aangeleverd aan de AI-vergelijking. */
export type CompareProjectInput = {
  id: string
  title: string
  buyer: string
  deadline: string
  /** Fase van het concept: brons | zilver | goud (of leeg). */
  stage: string
  /** Samenvatting uit de leidraadanalyse, indien beschikbaar. */
  analysisSummary: string
  /** Beoordelingscriteria uit de analyse. */
  evaluationCriteria: string[]
  /** Overzicht van gebruikte brondocumenten, gegroepeerd per type. */
  documentOverview: string
  /** Koppen (h1–h3) uit het concept — de opbouw van het plan van aanpak. */
  headings: string[]
  /** Aantal woorden in het concept. */
  wordCount: number
  /** Platte-tekst-fragment van het concept (afgekapt). */
  draftExcerpt: string
}

export type CompareProjectsRequest = {
  projects: CompareProjectInput[]
  ai?: LessonAiConfig
}

/** Eén verschilpunt tussen de vergeleken projecten. */
export type ComparisonDifference = {
  /** Aspect waarop ze verschilden, bijv. "Prijsstrategie" of "Opbouw plan van aanpak". */
  aspect: string
  /** Hoe de aanpak per project verschilde op dit aspect. */
  observation: string
}

export type CompareProjectsResponse = {
  /** Korte samenvatting van de vergelijking. */
  overview: string
  /** Wat de aanpakken gemeen hadden. */
  similarities: string[]
  /** Waarin de aanpakken verschilden. */
  differences: ComparisonDifference[]
  /** Wat opvalt / terugkerende patronen. */
  insights: string[]
  /** Herbruikbare leerpunten uit de vergelijking (direct op te slaan in de database). */
  lessons: LessonDraft[]
  provider: string
  model: string
}

export type CompareProjectsError = {
  error: string
}
