import type { AiProvider } from './apiConfig'
import type { SourceDocument, UnderlyingIntent } from './tenderAnalysis'

export type AnalyzeIntentAiConfig = {
  provider: AiProvider
  baseUrl: string
  apiKey: string
  model: string
}

export type AnalyzeIntentRequest = {
  buyerName: string
  documents: Pick<SourceDocument, 'name' | 'type' | 'content'>[]
  baseline: UnderlyingIntent
  ai?: AnalyzeIntentAiConfig
}

export type AnalyzeIntentResponse = {
  underlyingIntent: UnderlyingIntent
  provider: string
  model: string
  enriched: boolean
}

export type AnalyzeIntentError = {
  error: string
}
