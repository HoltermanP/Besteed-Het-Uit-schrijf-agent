import type { AiProvider } from './apiConfig'
import type { DocumentRole, Requirement, SourceDocument } from './tenderAnalysis'

export type ExtractRequirementsAiConfig = {
  provider: AiProvider
  baseUrl: string
  apiKey: string
  model: string
  testMode?: boolean
}

export type ExtractRequirementsRequest = {
  document: Pick<SourceDocument, 'name' | 'type' | 'content'>
  /** Optionele hint; de server bepaalt de rol anders zelf uit de bestandsnaam. */
  role?: DocumentRole
  buyerName?: string
  ai?: ExtractRequirementsAiConfig
}

export type ExtractRequirementsResponse = {
  requirements: Requirement[]
  provider: string
  model: string
}

export type ExtractRequirementsError = {
  error: string
}
