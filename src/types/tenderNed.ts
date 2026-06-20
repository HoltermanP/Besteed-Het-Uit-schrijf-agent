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

/** Document dat bij een publicatie hoort (metadata uit de TNS documentenlijst). */
export type TenderDocument = {
  documentId: string
  documentNaam: string
  type: string
  categorie: string
  categorieOmschrijving: string
  grootte: number
  downloadHref: string
}

export type SavedTenderDocumentStatus = 'ok' | 'leeg' | 'overgeslagen' | 'fout'

/** Resultaat per gedownload document na tekstextractie. */
export type SavedTenderDocument = {
  naam: string
  type: string
  categorie: string
  categorieOmschrijving: string
  grootte: number
  chars: number
  status: SavedTenderDocumentStatus
  note?: string
}

/** Respons van /api/tender-documents: alle documenten + samengevoegde tekst. */
export type TenderDocumentBundle = {
  publicatieId: string
  documents: SavedTenderDocument[]
  combinedText: string
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
  documents?: SavedTenderDocument[]
  tendernedUrl: string
  savedAt: string
  syncStatus: 'local' | 'pending' | 'synced'
}

export type TenderSearchFilters = {
  cpvPrefix: string
  query: string
  onlyOpen: boolean
}
