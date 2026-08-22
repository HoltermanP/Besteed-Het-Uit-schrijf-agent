import { getApiConfig, isWriterConfigured } from './apiConfig'
import type {
  ExtractRequirementsError,
  ExtractRequirementsRequest,
  ExtractRequirementsResponse,
} from '../types/extractRequirements'
import type { Requirement, SourceDocument } from '../types/tenderAnalysis'
import { usageHeaders } from './usageScope'

function resolveAiConfig(): ExtractRequirementsRequest['ai'] {
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

/** Haalt het eisenregister uit één aanbestedingsstuk (goedkope, gefocuste pass). `null` bij fouten. */
export async function extractRequirementsViaApi(
  document: Pick<SourceDocument, 'name' | 'type' | 'content'>,
  buyerName: string,
): Promise<Requirement[] | null> {
  const payload: ExtractRequirementsRequest = {
    document: { name: document.name, type: document.type, content: document.content },
    buyerName,
    ai: resolveAiConfig(),
  }

  try {
    const response = await fetch('/api/extract-requirements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...usageHeaders() },
      body: JSON.stringify(payload),
    })

    const raw = await response.text()
    if (!raw.trim()) return null
    const data = JSON.parse(raw) as ExtractRequirementsResponse | ExtractRequirementsError
    if (!response.ok || 'error' in data) return null
    return data.requirements
  } catch {
    return null
  }
}
