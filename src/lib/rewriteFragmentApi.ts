import { getApiConfig, isWriterConfigured } from './apiConfig'
import type {
  RewriteFragmentError,
  RewriteFragmentRequest,
  RewriteFragmentResponse,
} from '../types/rewriteFragment'

function buildPayload(request: Omit<RewriteFragmentRequest, 'ai'>): RewriteFragmentRequest {
  const payload: RewriteFragmentRequest = { ...request }
  const apiConfig = getApiConfig()
  if (isWriterConfigured(apiConfig)) {
    payload.ai = {
      provider: apiConfig.writer.provider,
      baseUrl: apiConfig.writer.baseUrl,
      apiKey: apiConfig.writer.apiKey,
      model: apiConfig.writer.model,
    }
  }
  return payload
}

export async function rewriteFragmentViaApi(
  request: Omit<RewriteFragmentRequest, 'ai'>,
): Promise<RewriteFragmentResponse> {
  const response = await fetch('/api/rewrite-fragment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPayload(request)),
  })

  const data = (await response.json()) as RewriteFragmentResponse | RewriteFragmentError
  if (!response.ok || 'error' in data) {
    const message = 'error' in data ? data.error : 'Herschrijven van fragment mislukt.'
    throw new Error(message)
  }
  return data
}
