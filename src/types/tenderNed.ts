export type CpvCode = {
  code: string
  omschrijving: string
  isHoofdOpdracht?: boolean
}

export type TenderListItem = {
  publicatieId: string
  kenmerk: number
  aanbestedingNaam: string
  opdrachtgeverNaam: string
  sluitingsDatum: string
  aantalDagenTotSluitingsDatum: number
  opdrachtBeschrijving: string
  typeOpdracht?: string
  procedure?: string
  link?: string
  cpvCodes?: CpvCode[]
}

export type TenderDetail = TenderListItem & {
  publicatieDatum: string
  cpvCodes: CpvCode[]
  nutsCodes?: Array<{ code: string; omschrijving: string }>
  pdfUrl?: string
  tendernedUrl: string
  raw?: Record<string, unknown>
}

export type SavedTender = {
  id: string
  publicatieId: string
  kenmerk: number
  aanbestedingNaam: string
  opdrachtgeverNaam: string
  sluitingsDatum: string
  cpvCodes: CpvCode[]
  opdrachtBeschrijving: string
  documentText: string
  tendernedUrl: string
  savedAt: string
  syncStatus: 'local' | 'pending' | 'synced'
}

export type TenderSearchFilters = {
  cpvPrefix: string
  query: string
  onlyOpen: boolean
}
