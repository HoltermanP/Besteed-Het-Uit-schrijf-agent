import type { DocumentDistillate, DocumentExtract, RequestedDocument, TenderAnalysis } from './tenderAnalysis'
import type { SavedTenderDocument } from './tenderNed'

// Gedeelde types voor de projectomgeving. Een "dossier" is de volledige werkruimte
// van één project (bronnen, concept, analyse, opmerkingen) en wordt als één
// snapshot per project bewaard.

export type Stage = 'brons' | 'zilver' | 'goud'
export type SourceType = 'tender' | 'company' | 'rules' | 'training'

export type SourceDocument = {
  id: string
  name: string
  type: SourceType
  content: string
  importedAt: string
  /** Id van het geüploade projectdocument waaruit deze tekst komt (zie DossierSnapshot.tenderDocuments). */
  tenderDocumentId?: string
  /** Gecachet per-document distillaat uit de map-fase van de analyse. */
  extract?: DocumentExtract | null
  /** Gecomprimeerde promptversie (alleen company/rules/training), gecachet per upload. */
  distilled?: DocumentDistillate | null
}

export type CommentStatus = 'open' | 'verwerkt' | 'akkoord'

export type ReviewComment = {
  id: string
  fragment: string
  note: string
  status: CommentStatus
  /** Oorspronkelijke sectie-HTML vóór een gerichte herschrijving, voor terugdraaien. */
  previousSectionHtml?: string
}

export type TenderProject = {
  title: string
  tendernedId: string
  buyer: string
  deadline: string
  neonUrl?: string
}

/**
 * Eén te schrijven stuk binnen een project, met eigen concept, stadium en opmerkingen.
 * De lijst volgt uit de leidraadanalyse (requestedDocuments van soort 'schrijfstuk');
 * daarnaast kan de gebruiker eigen stukken toevoegen.
 */
export type DraftDocument = {
  /** Gelijk aan RequestedDocument.id zodat een heranalyse hetzelfde stuk terugvindt. */
  id: string
  title: string
  /** 'analyse' = uit de leidraadanalyse; 'eigen' = handmatig toegevoegd. */
  source: 'analyse' | 'eigen'
  /** De opdracht voor dit stuk (vraag, criteria, onderwerpen, limieten) zoals de analyse die zag. */
  requested: RequestedDocument
  stage: Stage
  html: string
  comments: ReviewComment[]
  updatedAt: string
}

// Volledige momentopname van een project; per project bewaard zodat je
// later verder kunt waar je was gebleven.
export type DossierSnapshot = {
  project: TenderProject
  documents: SourceDocument[]
  /** Origineel gedownloade aanbestedingsbestanden (met archieflink in Vercel Blob). */
  tenderDocuments?: SavedTenderDocument[]
  /**
   * Alle stukken van deze inschrijving, elk met eigen concept. Ontbreekt bij oudere dossiers;
   * dan wordt `draft`/`stage`/`comments` als enig stuk gemigreerd.
   */
  drafts?: DraftDocument[]
  /** Het stuk dat in de editor open staat. */
  activeDraftId?: string
  /** Opmerkingen van het actieve stuk (spiegel van drafts[active].comments, voor oudere lezers). */
  comments: ReviewComment[]
  /** Stadium van het actieve stuk (spiegel van drafts[active].stage). */
  stage: Stage
  /** Concept van het actieve stuk (spiegel van drafts[active].html). */
  draft: string
  analysis: TenderAnalysis | null
  /** Vingerafdruk van de bronnen waarop de laatste AI-analyse is gebaseerd. */
  analysisSource?: string | null
  updatedAt: string
}
