import type { AiProvider } from './apiConfig'
import type { RequestedDocument, Requirement, RequirementCheck, SourceDocument, TenderAnalysis } from './tenderAnalysis'

export type ReviewPriority = 'kritiek' | 'hoog' | 'normaal'

export type ReviewFindingItem = {
  priority: ReviewPriority
  title: string
  detail: string
}

/** Informatievraag zoals de reviewer die levert (id en status kent alleen de client). */
export type ReviewInformationRequest = {
  question: string
  reason: string
  section?: string
  requirementId?: string
  priority: ReviewPriority
}

/** Verbetervoorstel zoals de reviewer dat levert (id en status kent alleen de client). */
export type ReviewProposal = {
  kind: 'verbeteren' | 'overtreffen'
  title: string
  detail: string
  rationale: string
  section?: string
  criterion?: string
  needsInput?: string
}

/** Context uit de vorige verbeterronde, zodat de reviewer niet herhaalt en verwerking controleert. */
export type ReviewRoundContext = {
  stage: 'brons' | 'zilver' | 'goud'
  answered: Array<{ question: string; answer: string }>
  unanswered: string[]
  skipped: string[]
  approved: Array<{ title: string; detail: string; input?: string; processed: boolean }>
  rejected: string[]
}

export type ReviewDraftAiConfig = {
  provider: AiProvider
  baseUrl: string
  apiKey: string
  model: string
  testMode?: boolean
}

export type ReviewDraftComment = {
  fragment: string
  note: string
  resolved: boolean
}

export type ReviewDraftProject = {
  title: string
  tendernedId: string
  buyer: string
  deadline: string
}

export type ReviewDraftRequest = {
  stage: 'brons' | 'zilver' | 'goud'
  project: ReviewDraftProject
  draft: string
  documents: Pick<SourceDocument, 'name' | 'type' | 'content'>[]
  comments: ReviewDraftComment[]
  analysis: TenderAnalysis | null
  /** Het stuk dat gereviewd wordt (vraag, criteria, limieten), als de inschrijving uit meerdere stukken bestaat. */
  targetDocument?: RequestedDocument
  /** Heuristische bevindingen die client-side al zijn berekend (deterministische feiten). */
  baseline: ReviewFindingItem[]
  /** Eisen die het bidteam zelf moet afdekken en die nog open staan — kandidaat-informatievragen. */
  openUserRequirements?: Requirement[]
  /** Vorige verbeterronde van dit stuk. */
  round?: ReviewRoundContext
  ai?: ReviewDraftAiConfig
}

export type ReviewDraftResponse = {
  findings: ReviewFindingItem[]
  provider: string
  model: string
  /** true wanneer een AI-reviewagent de baseline heeft aangevuld. */
  enriched: boolean
  /** Oordeel per agent-toetsbare eis uit het eisenregister (analysis.requirements) voor dit stuk. */
  requirementChecks?: RequirementCheck[]
  /** Gerichte vragen aan het bidteam (ontbrekende onderbouwing, open eisen, input voor voorstellen). */
  informationRequests?: ReviewInformationRequest[]
  /** Voorstellen om de volgende versie beter te maken of de uitvraag te overtreffen. */
  proposals?: ReviewProposal[]
}

export type ReviewDraftError = {
  error: string
}
