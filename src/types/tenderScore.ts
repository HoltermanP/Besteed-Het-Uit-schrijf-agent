import type { CompanyEnrichAiConfig } from './companyEnrich'

/** Compacte tender-metadata die naar de AI gaat (geen documenten nodig). */
export type TenderScoreInput = {
  publicatieId: string
  aanbestedingNaam: string
  opdrachtgeverNaam: string
  opdrachtBeschrijving: string
  cpvCodes?: Array<{ code: string; omschrijving?: string }>
  typePublicatie?: string
  typeOpdracht?: string
  procedure?: string
}

export type TenderScoreRequest = {
  /** Geformatteerd bedrijfsprofiel (profiel, competenties, CPV-codes, enz.). */
  companyText: string
  tenders: TenderScoreInput[]
  ai?: CompanyEnrichAiConfig
}

export type TenderScoreResult = {
  publicatieId: string
  /** Geschiktheid voor het bedrijf op een schaal van 0 tot 100. */
  score: number
  /** Korte motivering van de score, in het Nederlands. */
  toelichting: string
}

export type TenderScoreResponse = {
  scores: TenderScoreResult[]
}

export type TenderScoreError = {
  error: string
}

/** Gecachte score in de werkruimte-opslag (per bedrijf gescoped). */
export type StoredTenderScore = TenderScoreResult & {
  scoredAt: string
  /** `updatedAt` van het bedrijfsprofiel op het moment van scoren; wijzigt het profiel, dan vervalt de score. */
  profileStamp: string
}
