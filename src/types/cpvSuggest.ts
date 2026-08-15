import type { CompanyEnrichAiConfig } from './companyEnrich'

export type CpvSuggestCompanyInfo = {
  name: string
  tagline: string
  website: string
  profile: string
  competencies: string
  usps: string
  references: string
  /** Optionele extra context, bijv. fragmenten uit geüploade bedrijfsdocumenten. */
  extraContext?: string
}

export type CpvSuggestRequest = {
  company: CpvSuggestCompanyInfo
  /** Reeds geconfigureerde codes, zodat de AI die niet opnieuw voorstelt. */
  existingCodes?: string[]
  ai?: CompanyEnrichAiConfig
}

export type CpvSuggestion = {
  code: string
  omschrijving: string
  reden: string
}

export type CpvSuggestResponse = {
  suggestions: CpvSuggestion[]
  notes: string
}

export type CpvSuggestError = {
  error: string
}
