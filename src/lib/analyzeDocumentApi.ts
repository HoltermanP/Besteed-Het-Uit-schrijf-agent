import { getApiConfig, isWriterConfigured } from './apiConfig'
import type {
  AnalyzeDocumentError,
  AnalyzeDocumentRequest,
  AnalyzeDocumentResponse,
} from '../types/analyzeDocument'
import type { DocumentExtract, SourceDocument } from '../types/tenderAnalysis'

function resolveAiConfig(): AnalyzeDocumentRequest['ai'] {
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

/** Analyseert één aanbestedingsstuk (map-fase) en levert een compact extract terug. */
export async function analyzeDocumentViaApi(
  document: Pick<SourceDocument, 'name' | 'type' | 'content'>,
  buyerName: string,
): Promise<DocumentExtract | null> {
  const payload: AnalyzeDocumentRequest = {
    document: { name: document.name, type: document.type, content: document.content },
    buyerName,
    ai: resolveAiConfig(),
  }

  try {
    const response = await fetch('/api/analyze-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const raw = await response.text()
    if (!raw.trim()) return null
    const data = JSON.parse(raw) as AnalyzeDocumentResponse | AnalyzeDocumentError
    if (!response.ok || 'error' in data) return null
    return data.extract
  } catch {
    return null
  }
}

/**
 * Voert `task` uit over `items` met maximaal `limit` gelijktijdige calls (tegen rate limits),
 * en rapporteert voortgang na elke afronding. Behoudt de volgorde van `items`.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  let done = 0

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await task(items[index], index)
      done += 1
      onProgress?.(done, items.length)
    }
  })

  await Promise.all(workers)
  return results
}
