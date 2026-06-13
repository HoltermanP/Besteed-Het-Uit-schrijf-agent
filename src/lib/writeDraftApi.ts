import { getApiConfig, isWriterConfigured } from './apiConfig'
import type {
  WriteDraftError,
  WriteDraftRequest,
  WriteDraftResponse,
} from '../types/writeDraft'

type StreamEvent =
  | { type: 'delta'; text: string; accumulated: string }
  | { type: 'done'; html: string; model: string; provider: WriteDraftResponse['provider'] }
  | { type: 'error'; error: string }

function buildPayload(request: Omit<WriteDraftRequest, 'ai' | 'stream'>): WriteDraftRequest {
  const payload: WriteDraftRequest = { ...request, stream: true }
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

function parseStreamEvent(line: string): StreamEvent | null {
  if (!line.startsWith('data: ')) return null
  const raw = line.slice(6).trim()
  if (!raw) return null
  try {
    return JSON.parse(raw) as StreamEvent
  } catch {
    return null
  }
}

export async function generateDraftViaApi(
  request: Omit<WriteDraftRequest, 'ai' | 'stream'>,
  onProgress?: (accumulated: string) => void,
): Promise<WriteDraftResponse> {
  const payload = buildPayload(request)

  const response = await fetch('/api/write-draft', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
  })

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream') || !response.body) {
    const data = (await response.json()) as WriteDraftResponse | WriteDraftError
    if (!response.ok || 'error' in data) {
      throw new Error('error' in data ? data.error : 'Genereren van concept mislukt.')
    }
    onProgress?.(data.html)
    return data
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: WriteDraftResponse | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const event = parseStreamEvent(line)
      if (!event) continue
      if (event.type === 'delta') onProgress?.(event.accumulated)
      if (event.type === 'done') {
        result = {
          html: event.html,
          model: event.model,
          provider: event.provider,
        }
      }
      if (event.type === 'error') throw new Error(event.error)
    }
  }

  if (!result) {
    throw new Error('Genereren stopte zonder resultaat.')
  }

  return result
}
