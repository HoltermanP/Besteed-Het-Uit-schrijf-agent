import type { CompanyConfig } from './companyConfig'

export type CompanyEnrichAiConfig = {
  provider: 'openai' | 'anthropic' | 'custom'
  baseUrl: string
  apiKey: string
  model: string
}

export type CompanyEnrichRequest = {
  website: string
  ai?: CompanyEnrichAiConfig
}

export type CompanyEnrichFields = Pick<
  CompanyConfig,
  'name' | 'tagline' | 'kvk' | 'website' | 'contactEmail' | 'profile' | 'competencies' | 'usps' | 'references'
>

export type CompanyEnrichResponse = {
  fields: CompanyEnrichFields
  sources: string[]
  notes: string
}

export type CompanyEnrichError = {
  error: string
}
