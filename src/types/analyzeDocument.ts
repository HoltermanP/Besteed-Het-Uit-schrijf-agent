import type { AiProvider } from './apiConfig'
import type { DocumentExtract, DocumentRole, SourceDocument } from './tenderAnalysis'

export type AnalyzeDocumentAiConfig = {
  provider: AiProvider
  baseUrl: string
  apiKey: string
  model: string
  testMode?: boolean
}

export type AnalyzeDocumentRequest = {
  document: Pick<SourceDocument, 'name' | 'type' | 'content'>
  /** Optionele hint; de server bepaalt de rol anders zelf uit de bestandsnaam. */
  role?: DocumentRole
  /** Opdrachtgever, voor context bij de extractie. */
  buyerName?: string
  ai?: AnalyzeDocumentAiConfig
}

export type AnalyzeDocumentResponse = {
  extract: DocumentExtract
  provider: string
  model: string
  enriched: boolean
}

export type AnalyzeDocumentError = {
  error: string
}
