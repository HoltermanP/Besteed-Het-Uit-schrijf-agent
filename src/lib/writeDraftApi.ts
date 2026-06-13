import { getApiConfig, isWriterConfigured } from './apiConfig'
import type {
  WriteDraftError,
  WriteDraftRequest,
  WriteDraftResponse,
} from '../types/writeDraft'

type StreamEvent =
  | { type: 'delta'; text: string; accumulated: string }
  | { type: 'status'; message: string }
  | { type: 'done'; html: string; model: string; provider: WriteDraftResponse['provider'] }
  | { type: 'error'; error: string }

export type WriterStatus = {
  available: boolean
  provider: WriteDraftResponse['provider'] | null
  model: string | null
}

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
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const raw = trimmed.slice(5).trim()
  if (!raw) return null
  try {
    return JSON.parse(raw) as StreamEvent
  } catch {
    return null
  }
}

function processStreamLines(lines: string[], handlers: {
  onDelta?: (accumulated: string) => void
  onStatus?: (message: string) => void
  onDone?: (result: WriteDraftResponse) => void
  onError?: (message: string) => void
}) {
  for (const line of lines) {
    const event = parseStreamEvent(line)
    if (!event) continue
    if (event.type === 'delta') handlers.onDelta?.(event.accumulated)
    if (event.type === 'status') handlers.onStatus?.(event.message)
    if (event.type === 'done') {
      handlers.onDone?.({
        html: event.html,
        model: event.model,
        provider: event.provider,
      })
    }
    if (event.type === 'error') handlers.onError?.(event.error)
  }
}

export function isNoAiConfigError(message: string): boolean {
  return message.toLowerCase().includes('geen ai-configuratie')
}

export async function fetchWriterStatus(): Promise<WriterStatus> {
  try {
    const response = await fetch('/api/writer-status')
    if (!response.ok) return { available: false, provider: null, model: null }
    return (await response.json()) as WriterStatus
  } catch {
    return { available: false, provider: null, model: null }
  }
}

export async function generateDraftViaApi(
  request: Omit<WriteDraftRequest, 'ai' | 'stream'>,
  onProgress?: (accumulated: string) => void,
  onStatus?: (message: string) => void,
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

  if (!response.ok) {
    if (contentType.includes('application/json')) {
      const data = (await response.json()) as WriteDraftError
      throw new Error(data.error || 'Genereren van concept mislukt.')
    }
    const detail = (await response.text()).trim()
    throw new Error(detail || 'Genereren van concept mislukt.')
  }

  if (!contentType.includes('text/event-stream') || !response.body) {
    const data = (await response.json()) as WriteDraftResponse | WriteDraftError
    if ('error' in data) throw new Error(data.error)
    onProgress?.(data.html)
    return data
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: WriteDraftResponse | null = null
  let streamError: string | null = null

  const handleLines = (lines: string[]) => {
    processStreamLines(lines, {
      onDelta: onProgress,
      onStatus,
      onDone: (value) => {
        result = value
      },
      onError: (message) => {
        streamError = message
      },
    })
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    handleLines(lines)
  }

  if (buffer.trim()) {
    handleLines(buffer.split('\n'))
  }

  if (streamError) throw new Error(streamError)
  if (!result) {
    throw new Error('Genereren stopte voortijdig. Probeer opnieuw of controleer de AI-configuratie.')
  }

  return result
}
