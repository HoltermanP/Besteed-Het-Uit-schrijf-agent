import type { CpvCode } from './tenderNed'

// Marktbeeld per opdrachtgever: wie won er eerder, met hoeveel concurrenten, en
// welke leerpunten hebben wij daar zelf opgedaan. De gunningsgegevens komen uit de
// "Aankondiging gegunde opdracht" (AGO) op TenderNed; de leerpunten uit onze eigen
// lessons-learned. Alles wat uit TenderNed komt is publiek en bedrijfsonafhankelijk.

/** Formaat van de gunnings-PDF: eForms (vanaf ~2023) of het oudere TED-formulier. */
export type AwardFormat = 'eforms' | 'ted'

/** Uitkomst van één perceel binnen een gunning. */
export type AwardLot = {
  /** Perceelaanduiding zoals in de aankondiging ("LOT-0001", "1"); null bij één ongenummerd perceel. */
  lot: string | null
  title: string | null
  /** Of dit perceel daadwerkelijk gegund is; false bij een ingetrokken of niet-gegunde procedure. */
  awarded: boolean
  /** Winnende partij(en). Meerdere bij een raamovereenkomst met meer contractanten. */
  winners: string[]
  /** Bij naam genoemde afvallers; de aankondiging noemt ze lang niet altijd. */
  losers: string[]
  /** Aantal ontvangen inschrijvingen: de concurrentiedruk op dit perceel. */
  tenderCount: number | null
  /** Laagste en hoogste ontvankelijke inschrijfsom in euro's, als de aankondiging ze noemt. */
  lowValue: number | null
  highValue: number | null
  /** Datum van contractsluiting (YYYY-MM-DD). */
  contractDate: string | null
}

/** Wat de parser uit de tekst van één gunnings-PDF haalt. */
export type ParsedAward = {
  format: AwardFormat
  lots: AwardLot[]
}

/** Waarom een gunning geen bruikbare cijfers opleverde. */
export type AwardParseStatus = 'ok' | 'niet-gegund' | 'onleesbaar' | 'ongelezen'

/** Eén gunning van een opdrachtgever, zoals bewaard in de cache. */
export type BuyerAward = {
  publicatieId: string
  /** Aanbestedingskenmerk; koppelt de gunning aan de oorspronkelijke aankondiging. */
  kenmerk: number | null
  buyer: string
  title: string
  /** Publicatiedatum van de gunning (YYYY-MM-DD). */
  publishedOn: string | null
  cpvCodes: CpvCode[]
  tendernedUrl: string
  status: AwardParseStatus
  format: AwardFormat | null
  lots: AwardLot[]
  /** Toelichting bij een status anders dan 'ok'. */
  note: string | null
}

/** Een partij die bij deze opdrachtgever won, opgeteld over alle gevonden gunningen. */
export type BuyerWinner = {
  name: string
  /** Aantal percelen dat deze partij bij deze opdrachtgever won. */
  wins: number
  /** Aantal keer dat de partij bij naam als afvaller genoemd staat. */
  losses: number
  /** Publicatiedatum van de meest recente winst (YYYY-MM-DD). */
  lastWonOn: string | null
  /** Titels van de gewonnen opdrachten, nieuwste eerst. */
  titles: string[]
}

/** Hoe zwaar de concurrentie bij deze opdrachtgever is. */
export type BuyerCompetition = {
  /** Percelen waarvoor een aantal inschrijvers bekend is. */
  measuredLots: number
  averageTenderCount: number | null
  /**
   * Mediaan aantal inschrijvers: eerlijker dan het gemiddelde, omdat afroepen van een
   * raamovereenkomst met één inschrijver het gemiddelde flink omlaag trekken.
   */
  medianTenderCount: number | null
  minTenderCount: number | null
  maxTenderCount: number | null
  /**
   * Percelen met precies één inschrijver. Dat zijn zelden echte competities maar
   * afroepen of gunningen zonder mededinging; een hoog aandeel zegt meer over de
   * inkoopvorm dan over de winkans.
   */
  singleBidderLots: number
}

/** Het volledige opdrachtgeversbeeld dat het bidteam te zien krijgt. */
export type BuyerHistory = {
  /** De opdrachtgever zoals gevraagd. */
  buyer: string
  /** Naamvarianten in TenderNed die als dezelfde opdrachtgever zijn meegeteld. */
  matchedNames: string[]
  /** Moment waarop dit beeld is samengesteld. */
  scannedAt: string
  /** Vanaf welke publicatiedatum is gezocht (YYYY-MM-DD). */
  since: string
  /** CPV-codes waarop de zoektocht is afgebakend; leeg = alle vakgebieden. */
  cpvCodes: string[]
  /** Aantal gunningen dat de scan bij deze opdrachtgever vond. */
  found: number
  /** Gunningen waarvan de PDF is gelezen, nieuwste eerst. */
  awards: BuyerAward[]
  winners: BuyerWinner[]
  competition: BuyerCompetition
  /** Gunningen die wel gevonden maar (nog) niet gelezen zijn, bijv. door de tijdslimiet. */
  unreadCount: number
}

export type BuyerHistoryRequest = {
  buyer: string
  /** CPV-codes van de lopende tender; bakent de scan af tot hetzelfde vakgebied. */
  cpvCodes?: string[]
  /** Hoeveel jaar terug er gezocht wordt (standaard 5). */
  years?: number
  /** Ook naamvarianten meenemen die met de opdrachtgever beginnen (standaard aan). */
  includeVariants?: boolean
  /** Cache negeren en de PDF's opnieuw lezen. */
  refresh?: boolean
}

export type BuyerHistoryResponse = { history: BuyerHistory }
export type BuyerHistoryError = { error: string }
