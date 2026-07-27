import type { AiProvider } from './apiConfig'
import type { DocumentExtract, SourceDocument, TenderAnalysis } from './tenderAnalysis'

export type AnalyzeTenderAiConfig = {
  provider: AiProvider
  baseUrl: string
  apiKey: string
  model: string
}

/** Per-document extract uit de map-fase, met de bestandsnaam voor bronverwijzing. */
export type TenderDocumentExtract = {
  name: string
  extract: DocumentExtract
}

export type AnalyzeTenderRequest = {
  buyerName: string
  documents: Pick<SourceDocument, 'name' | 'type' | 'content'>[]
  /** Heuristische baseline-analyse die de AI mag aanscherpen */
  baseline: TenderAnalysis
  /**
   * Per-document extracten uit de map-fase. Aanwezig → de reduce voegt ze deterministisch
   * samen en draait een compacte synthesepass i.p.v. de volledige documenten opnieuw te lezen.
   */
  extracts?: TenderDocumentExtract[]
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
