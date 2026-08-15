import { getApiConfig, isWriterConfigured } from './apiConfig'
import type {
  DistillDocumentError,
  DistillDocumentRequest,
  DistillDocumentResponse,
} from '../types/distillDocument'
import type { SourceDocument } from '../types/tenderAnalysis'

function resolveAiConfig(): DistillDocumentRequest['ai'] {
  const apiConfig = getApiConfig()
  if (!isWriterConfigured(apiConfig)) return undefined
  return {
    provider: apiConfig.writer.provider,
    baseUrl: apiConfig.writer.baseUrl,
    apiKey: apiConfig.writer.apiKey,
    model: apiConfig.writer.model,
    testMode: apiConfig.testMode || undefined,
  }
}

/** Comprimeert één niet-leidraaddocument tot een compacte promptversie. */
export async function distillDocumentViaApi(
  document: Pick<SourceDocument, 'name' | 'type' | 'content'>,
): Promise<DistillDocumentResponse | null> {
  const payload: DistillDocumentRequest = {
    document: { name: document.name, type: document.type, content: document.content },
    ai: resolveAiConfig(),
  }

  try {
    const response = await fetch('/api/distill-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const raw = await response.text()
    if (!raw.trim()) return null
    const data = JSON.parse(raw) as DistillDocumentResponse | DistillDocumentError
    if (!response.ok || 'error' in data) return null
    return data
  } catch {
    return null
  }
}
