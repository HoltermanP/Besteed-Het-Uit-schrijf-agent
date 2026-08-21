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
  /** Datum waarop TenderNed de aankondiging publiceerde. */
  publicatieDatum?: string
  /** Moment waarop dit item uit de TenderNed-API is opgehaald. */
  fetchedAt?: string
  /** Soort publicatie, bijv. "Aankondiging van een opdracht", "Marktconsultatie", "Rectificatie". */
  typePublicatie?: string
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

/** Herkomst van een aanbestedingsdocument: gedownload van TenderNed of zelf geüpload in het project. */
export type SavedTenderDocumentSource = 'tenderned' | 'upload'

/** Resultaat per gedownload of geüpload document na tekstextractie. */
export type SavedTenderDocument = {
  /** Alleen aanwezig bij eigen uploads; koppelt het bestand aan zijn tekstbron in het dossier. */
  id?: string
  /** Ontbreekt bij oudere TenderNed-downloads; lees dat als 'tenderned'. */
  source?: SavedTenderDocumentSource
  /** Moment van uploaden (ISO), alleen bij eigen uploads. */
  uploadedAt?: string
  naam: string
  type: string
  categorie: string
  categorieOmschrijving: string
  grootte: number
  chars: number
  status: SavedTenderDocumentStatus
  note?: string
  /** URL van het originele bestand in Vercel Blob (ontbreekt zonder Blob-configuratie). */
  fileUrl?: string
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
  publicatieDatum?: string
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

/** Sorteersleutels voor de voorselectie. */
export type TenderSortKey =
  | 'score'
  | 'publicatieDatum'
  | 'sluitingsDatum'
  | 'aanbestedingNaam'
  | 'opdrachtgeverNaam'

/**
 * Opgeslagen voorselectie: de lijst tenders die puur op de bedrijfs-CPV-codes
 * uit TenderNed is opgehaald (stap 1), inclusief CPV-verrijking. De AI-scores
 * (stap 2) staan apart per publicatieId opgeslagen, zodat een nieuwe scan de
 * al gescoorde tenders niet opnieuw hoeft te scoren.
 */
export type TenderPreselection = {
  /** Moment van de CPV-scan. */
  scannedAt: string
  /** Bedrijfs-CPV-codes (volledige notatie) waarmee gescand is. */
  cpvCodes: string[]
  /** Totaal aantal treffers in TenderNed voor deze codes (kan groter zijn dan items). */
  totalMatches: number
  /** Alleen open inschrijvingen. */
  onlyOpen: boolean
  items: TenderListItem[]
}
