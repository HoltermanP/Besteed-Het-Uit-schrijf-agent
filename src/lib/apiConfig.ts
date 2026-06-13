import { type ApiConfig, defaultApiConfig } from '../types/apiConfig'
import { loadStored, saveStored } from './storage'

const STORAGE_KEY = 'bid-agent-api-config'

export function getApiConfig(): ApiConfig {
  const stored = loadStored<Partial<ApiConfig>>(STORAGE_KEY, {})
  return {
    tenderned: { ...defaultApiConfig.tenderned, ...stored.tenderned },
    neon: { ...defaultApiConfig.neon, ...stored.neon },
    writer: { ...defaultApiConfig.writer, ...stored.writer },
    review: { ...defaultApiConfig.review, ...stored.review },
  }
}

export function saveApiConfig(config: ApiConfig) {
  saveStored(STORAGE_KEY, config)
}

export function isNeonConfigured(config = getApiConfig()) {
  return config.neon.enabled && config.neon.connectionString.trim().length > 0
}

export function isTenderNedConfigured(config = getApiConfig()) {
  return config.tenderned.enabled
}

export function isWriterConfigured(config = getApiConfig()) {
  return config.writer.enabled && config.writer.apiKey.trim().length > 0
}

export function isReviewConfigured(config = getApiConfig()) {
  return config.review.enabled && config.review.apiKey.trim().length > 0
}

/** Migreer oude neonUrl uit project naar api-config indien nodig. */
export function migrateLegacyNeonUrl(legacyUrl?: string) {
  if (!legacyUrl?.trim()) return
  const config = getApiConfig()
  if (config.neon.connectionString.trim()) return
  saveApiConfig({
    ...config,
    neon: { connectionString: legacyUrl.trim(), enabled: true },
  })
}
