import type { AiProvider } from './apiConfig'
import type { SourceDocument } from './tenderAnalysis'

export type DistillDocumentAiConfig = {
  provider: AiProvider
  baseUrl: string
  apiKey: string
  model: string
}

export type DistillDocumentRequest = {
  document: Pick<SourceDocument, 'name' | 'type' | 'content'>
  ai?: DistillDocumentAiConfig
}

export type DistillDocumentResponse = {
  /** Gecomprimeerde promptversie van het document. */
  content: string
  /** Lengte van de brontekst — voor cache-invalidatie aan de clientkant. */
  sourceChars: number
  provider: string
  model: string
}

export type DistillDocumentError = {
  error: string
}
