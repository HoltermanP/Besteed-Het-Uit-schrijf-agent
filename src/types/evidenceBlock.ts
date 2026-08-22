import type { AiProvider } from './apiConfig'
import type { TenderAnalysis } from './tenderAnalysis'

/*
 * Bewijsbibliotheek: referenties, cases en cijfers als losse, herbruikbare bouwstenen.
 *
 * Een aanbestedingstekst valt of staat bij toetsbare feiten. Die feiten staan hier één
 * keer vast — met de bron erbij — zodat de schrijfagent ze CITEERT in plaats van
 * verzint, en de reviewer elke claim in het concept kan terugleggen op een bouwsteen.
 * De bibliotheek is bedrijfsbreed (net als lessons learned), niet projectgebonden.
 */

export type EvidenceKind = 'referentie' | 'case' | 'cijfer'

export const evidenceKindLabels: Record<EvidenceKind, string> = {
  referentie: 'Referentie',
  case: 'Case',
  cijfer: 'Cijfer',
}

export const evidenceKinds = Object.keys(evidenceKindLabels) as EvidenceKind[]

/** Eén bouwsteen uit de bewijsbibliotheek, zoals opgeslagen in de database. */
export type EvidenceBlock = {
  id: string
  kind: EvidenceKind
  /** Korte, herkenbare naam: "Gemeente Utrecht — inkoopondersteuning". */
  title: string
  /** Opdrachtgever/klant waar deze bouwsteen bij hoort. */
  client: string | null
  /** Periode of peilmoment: "2023–2025", "Q4 2025". */
  period: string | null
  /** Thema/tag, bijv. "social return", "ICT", "duurzaamheid". */
  category: string | null
  /** Context: wat speelde er (case) of wat hield de opdracht in (referentie). */
  situation: string
  /** Het feit zoals het geciteerd mag worden — dit is wat de schrijfagent overneemt. */
  claim: string
  /** Aantoonbaar resultaat of effect. */
  result: string
  /** Cijfer: de waarde ("98", "1,2 mln"). */
  value: string | null
  /** Cijfer: de eenheid ("%", "fte", "€"). */
  unit: string | null
  /**
   * Waar het bewijs vandaan komt: document, systeem, meetmoment of contactpersoon.
   * Zonder bewijs is een bouwsteen niet citeerbaar en gaat hij niet naar de schrijfagent.
   */
  proof: string
  /** Datum waarop dit is geverifieerd (YYYY-MM-DD). */
  verifiedOn: string | null
  /** Houdbaar tot (YYYY-MM-DD); daarna citeert de agent de bouwsteen niet meer. */
  validUntil: string | null
  createdAt: string
  updatedAt: string
}

/** Invoer voor het opslaan van een nieuwe bouwsteen. */
export type EvidenceBlockInput = {
  kind: EvidenceKind
  title: string
  client?: string | null
  period?: string | null
  category?: string | null
  situation?: string
  claim: string
  result?: string
  value?: string | null
  unit?: string | null
  proof?: string
  verifiedOn?: string | null
  validUntil?: string | null
}

export type EvidenceBlockPatch = Partial<EvidenceBlockInput> & { id: string }

/** Waarom een bouwsteen (niet) geciteerd mag worden. */
export type EvidenceUsability = 'citeerbaar' | 'geen-bewijs' | 'verlopen'

export const evidenceUsabilityLabels: Record<EvidenceUsability, string> = {
  citeerbaar: 'Citeerbaar',
  'geen-bewijs': 'Geen bewijs vastgelegd',
  verlopen: 'Houdbaarheid verlopen',
}

export type EvidenceAiConfig = {
  provider: AiProvider
  baseUrl: string
  apiKey: string
  model: string
  testMode?: boolean
}

// --- select-evidence: AI kiest de bouwstenen die bij dit stuk passen ---

export type SelectEvidenceRequest = {
  project: {
    title: string
    buyer: string
  }
  analysis: TenderAnalysis | null
  /** Het stuk dat geschreven wordt (titel + vraag), zodat de selectie daarop toespitst. */
  document?: { title: string; question: string }
  /** Korte samenvatting van de aanbestedingsbronnen wanneer er nog geen analyse is. */
  tenderSummary?: string
  /** Kandidaat-bouwstenen (alleen citeerbare) met hun handle. */
  candidates: Array<{
    id: string
    handle: string
    kind: EvidenceKind
    title: string
    client: string | null
    category: string | null
    summary: string
  }>
  ai?: EvidenceAiConfig
}

export type SelectedEvidence = {
  id: string
  /** Waarvoor deze bouwsteen bruikbaar is in dit stuk. */
  reason: string
}

export type SelectEvidenceResponse = {
  selected: SelectedEvidence[]
  provider: string
  model: string
}

export type EvidenceError = {
  error: string
}
