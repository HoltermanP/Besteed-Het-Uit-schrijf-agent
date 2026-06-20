import type { AiProvider } from './apiConfig'
import type { SourceDocument, TenderAnalysis } from './tenderAnalysis'

export type AnalyzeTenderAiConfig = {
  provider: AiProvider
  baseUrl: string
  apiKey: string
  model: string
}

export type AnalyzeTenderRequest = {
  buyerName: string
  documents: Pick<SourceDocument, 'name' | 'type' | 'content'>[]
  /** Heuristische baseline-analyse die de AI mag aanscherpen */
  baseline: TenderAnalysis
  ai?: AnalyzeTenderAiConfig
}

export type AnalyzeTenderResponse = {
  analysis: TenderAnalysis
  provider: string
  model: string
  enriched: boolean
}

export type AnalyzeTenderError = {
  error: string
}
