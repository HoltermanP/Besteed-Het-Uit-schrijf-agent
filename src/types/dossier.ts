import type { DocumentDistillate, DocumentExtract, TenderAnalysis } from './tenderAnalysis'
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

// Volledige momentopname van een project; per project bewaard zodat je
// later verder kunt waar je was gebleven.
export type DossierSnapshot = {
  project: TenderProject
  documents: SourceDocument[]
  /** Origineel gedownloade aanbestedingsbestanden (met archieflink in Vercel Blob). */
  tenderDocuments?: SavedTenderDocument[]
  comments: ReviewComment[]
  stage: Stage
  draft: string
  analysis: TenderAnalysis | null
  /** Vingerafdruk van de bronnen waarop de laatste AI-analyse is gebaseerd. */
  analysisSource?: string | null
  updatedAt: string
}
