import type { AiProvider } from './apiConfig'
import type { SourceDocument, TenderAnalysis } from './tenderAnalysis'

export type ReviewPriority = 'kritiek' | 'hoog' | 'normaal'

export type ReviewFindingItem = {
  priority: ReviewPriority
  title: string
  detail: string
}

export type ReviewDraftAiConfig = {
  provider: AiProvider
  baseUrl: string
  apiKey: string
  model: string
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
  /** Heuristische bevindingen die client-side al zijn berekend (deterministische feiten). */
  baseline: ReviewFindingItem[]
  ai?: ReviewDraftAiConfig
}

export type ReviewDraftResponse = {
  findings: ReviewFindingItem[]
  provider: string
  model: string
  /** true wanneer een AI-reviewagent de baseline heeft aangevuld. */
  enriched: boolean
}

export type ReviewDraftError = {
  error: string
}
