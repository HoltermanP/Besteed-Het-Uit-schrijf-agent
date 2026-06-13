import { getApiConfig, isWriterConfigured } from './apiConfig'
import type {
  WriteDraftError,
  WriteDraftRequest,
  WriteDraftResponse,
} from '../types/writeDraft'

export async function generateDraftViaApi(
  request: Omit<WriteDraftRequest, 'ai'>,
): Promise<WriteDraftResponse> {
  const payload: WriteDraftRequest = { ...request }
  const apiConfig = getApiConfig()
  if (isWriterConfigured(apiConfig)) {
    payload.ai = {
      provider: apiConfig.writer.provider,
      baseUrl: apiConfig.writer.baseUrl,
      apiKey: apiConfig.writer.apiKey,
      model: apiConfig.writer.model,
    }
  }

  const response = await fetch('/api/write-draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = (await response.json()) as WriteDraftResponse | WriteDraftError
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'Genereren van concept mislukt.')
  }

  return data
}
