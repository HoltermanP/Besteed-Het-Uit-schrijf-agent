import { getApiConfig, isWriterConfigured } from './apiConfig'
import type {
  AnalyzeIntentError,
  AnalyzeIntentRequest,
  AnalyzeIntentResponse,
} from '../types/analyzeIntent'
import type { SourceDocument, UnderlyingIntent } from '../types/tenderAnalysis'

async function readApiJson<T>(response: Response): Promise<T | AnalyzeIntentError> {
  const raw = await response.text()
  if (!raw.trim()) {
    return { error: 'Lege serverrespons ontvangen.' }
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    return { error: 'Ongeldige serverrespons bij intent-analyse.' }
  }
}

export async function enrichIntentViaApi(
  buyerName: string,
  documents: SourceDocument[],
  baseline: UnderlyingIntent,
): Promise<AnalyzeIntentResponse | null> {
  const payload: AnalyzeIntentRequest = {
    buyerName,
    documents: documents.map((doc) => ({
      name: doc.name,
      type: doc.type,
      content: doc.content,
    })),
    baseline,
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
    const response = await fetch('/api/analyze-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await readApiJson<AnalyzeIntentResponse>(response)
    if (!response.ok || 'error' in data) {
      return null
    }

    return data
  } catch {
    return null
  }
}
