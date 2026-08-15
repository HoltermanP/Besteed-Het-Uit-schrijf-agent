import { getApiConfig, isWriterConfigured } from './apiConfig'
import type { CompanyConfig } from '../types/companyConfig'
import type { CpvSuggestError, CpvSuggestRequest, CpvSuggestResponse } from '../types/cpvSuggest'

const MAX_EXTRA_CONTEXT_CHARS = 6_000

async function readApiJson<T>(response: Response): Promise<T | CpvSuggestError> {
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
        : preview || 'Voorstellen van CPV-codes mislukt.',
    }
  }
}

function buildExtraContext(config: CompanyConfig): string {
  if (!config.files.length) return ''
  const parts: string[] = []
  let remaining = MAX_EXTRA_CONTEXT_CHARS
  for (const file of config.files) {
    if (remaining <= 200) break
    const excerpt = file.content.trim().slice(0, Math.min(2_000, remaining))
    if (!excerpt) continue
    parts.push(`Document "${file.name}":\n${excerpt}`)
    remaining -= excerpt.length
  }
  return parts.join('\n\n')
}

export async function suggestCpvCodesForCompany(config: CompanyConfig): Promise<CpvSuggestResponse> {
  const payload: CpvSuggestRequest = {
    company: {
      name: config.name,
      tagline: config.tagline,
      website: config.website,
      profile: config.profile,
      competencies: config.competencies,
      usps: config.usps,
      references: config.references,
      extraContext: buildExtraContext(config),
    },
    existingCodes: config.cpvCodes.map((cpv) => cpv.code),
  }

  const apiConfig = getApiConfig()
  if (isWriterConfigured(apiConfig)) {
    payload.ai = {
      provider: apiConfig.writer.provider,
      baseUrl: apiConfig.writer.baseUrl,
      apiKey: apiConfig.writer.apiKey,
      model: apiConfig.writer.model,
      testMode: apiConfig.testMode || undefined,
    }
  }

  const response = await fetch('/api/cpv-suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await readApiJson<CpvSuggestResponse>(response)
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'Voorstellen van CPV-codes mislukt.')
  }

  return data
}
