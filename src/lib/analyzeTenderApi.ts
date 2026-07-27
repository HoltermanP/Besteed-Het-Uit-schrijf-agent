import { getApiConfig, isWriterConfigured } from './apiConfig'
import type {
  AnalyzeTenderError,
  AnalyzeTenderRequest,
  AnalyzeTenderResponse,
  TenderDocumentExtract,
} from '../types/analyzeTender'
import type { SourceDocument, TenderAnalysis } from '../types/tenderAnalysis'

async function readApiJson<T>(response: Response): Promise<T | AnalyzeTenderError> {
  const raw = await response.text()
  if (!raw.trim()) {
    return { error: 'Lege serverrespons ontvangen.' }
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    return { error: 'Ongeldige serverrespons bij uitvraag-analyse.' }
  }
}

export async function analyzeTenderViaApi(
  buyerName: string,
  documents: SourceDocument[],
  baseline: TenderAnalysis,
  extracts?: TenderDocumentExtract[],
): Promise<AnalyzeTenderResponse | null> {
  const payload: AnalyzeTenderRequest = {
    buyerName,
    documents: documents.map((doc) => ({
      name: doc.name,
      type: doc.type,
      content: doc.content,
    })),
    baseline,
    ...(extracts?.length ? { extracts } : {}),
  }

  const apiConfig = getApiConfig()
  if (isWriterConfigured(apiConfig)) {
    payload.ai = {
      provider: apiConfig.writer.provider,
      baseUrl: apiConfig.writer.baseUrl,
      apiKey: apiConfig.writer.apiKey,
      model: apiConfig.writer.model,
    }
  }

  try {
    const response = await fetch('/api/analyze-tender', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await readApiJson<AnalyzeTenderResponse>(response)
    if (!response.ok || 'error' in data) {
      return null
    }

    return data
  } catch {
    return null
  }
}
