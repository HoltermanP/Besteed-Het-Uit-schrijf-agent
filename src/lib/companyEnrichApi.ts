import { getApiConfig, isWriterConfigured } from './apiConfig'
import type {
  CompanyEnrichError,
  CompanyEnrichRequest,
  CompanyEnrichResponse,
} from '../types/companyEnrich'

async function readApiJson<T>(response: Response): Promise<T | CompanyEnrichError> {
  const raw = await response.text()
  if (!raw.trim()) {
    return { error: 'Lege serverrespons ontvangen.' }
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    const preview = raw.replace(/\s+/g, ' ').trim().slice(0, 180)
    return {
      error: preview.startsWith('{')
        ? 'Ongeldige serverrespons ontvangen.'
        : preview || 'Ophalen van bedrijfsgegevens mislukt.',
    }
  }
}

export async function enrichCompanyFromWebsite(website: string): Promise<CompanyEnrichResponse> {
  const trimmed = website.trim()
  if (!trimmed) {
    throw new Error('Vul eerst een website in.')
  }

  const payload: CompanyEnrichRequest = { website: trimmed }
  const apiConfig = getApiConfig()
  if (isWriterConfigured(apiConfig)) {
    payload.ai = {
      provider: apiConfig.writer.provider,
      baseUrl: apiConfig.writer.baseUrl,
      apiKey: apiConfig.writer.apiKey,
      model: apiConfig.writer.model,
    }
  }

  const response = await fetch('/api/company-enrich', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await readApiJson<CompanyEnrichResponse>(response)
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'Ophalen van bedrijfsgegevens mislukt.')
  }

  return data
}
