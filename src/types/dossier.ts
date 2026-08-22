import type {
  DocumentDistillate,
  DocumentExtract,
  RequestedDocument,
  RequirementStatusEntry,
  TenderAnalysis,
} from './tenderAnalysis'
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
  /** Sluitingsdatum (YYYY-MM-DD). */
  deadline: string
  /** Sluitingstijd (HH:MM, lokale tijd); ontbreekt = einde van de dag. */
  deadlineTime?: string
  neonUrl?: string
}

export type ReviewPriority = 'kritiek' | 'hoog' | 'normaal'

/**
 * Gerichte vraag van de AI-review aan het bidteam: informatie die nodig is om een eis af te
 * dekken, een claim te onderbouwen of een voorstel te kunnen schrijven zonder te verzinnen.
 */
export type InformationRequest = {
  id: string
  question: string
  /** Waarom dit nodig is: welke claim, sectie of eis onderbouwing mist. */
  reason: string
  section?: string
  /** Eis uit het eisenregister waar de vraag bij hoort. */
  requirementId?: string
  priority: ReviewPriority
  status: 'open' | 'beantwoord' | 'overgeslagen'
  answer?: string
  askedAtStage: Stage
}

/**
 * Verbetervoorstel van de AI-review. 'verbeteren' = beter voldoen aan de vraag/eisen;
 * 'overtreffen' = de uitvraag overstijgen op een punt waar de opdrachtgever dat waardeert.
 * Wordt pas verwerkt na goedkeuring door de gebruiker.
 */
export type ImprovementProposal = {
  id: string
  kind: 'verbeteren' | 'overtreffen'
  title: string
  /** Wat er concreet verandert of bijkomt. */
  detail: string
  /** Waarom dit punten oplevert (criterium, prioriteit van de opdrachtgever, vraag achter de vraag). */
  rationale: string
  section?: string
  criterion?: string
  /** Feitelijke input die het bidteam moet leveren om dit te kunnen schrijven zonder te verzinnen. */
  needsInput?: string
  status: 'voorgesteld' | 'goedgekeurd' | 'afgewezen' | 'verwerkt'
  /** Feiten/antwoord van de gebruiker bij goedkeuring (verplicht als needsInput gezet is). */
  input?: string
  proposedAtStage: Stage
}

/** De verbeterronde van één stuk: wat de AI-review vraagt en voorstelt vóór de volgende versie. */
export type ImprovementRound = {
  /** Stadium van het concept dat is gereviewd. */
  stage: Stage
  reviewedAt: string
  provider?: string
  model?: string
  informationRequests: InformationRequest[]
  proposals: ImprovementProposal[]
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
  /** Laatste verbeterronde (AI-review) van dit stuk; antwoorden en goedgekeurde voorstellen gaan mee naar de volgende versie. */
  round?: ImprovementRound | null
  updatedAt: string
}

/**
 * Wat er gebeurde waardoor deze versie ontstond: een generatie door de schrijfagent, een
 * verwerking (opmerkingen of verbeterronde), een eigen bewerkingsronde van de schrijver,
 * of het herstellen van een oudere versie.
 */
export type DraftVersionKind = 'generatie' | 'verwerking' | 'bewerking' | 'herstel'

/**
 * Momentopname van één stuk. Bij elke generatie, verwerking, eigen bewerkingsronde en
 * herstelactie wordt er één bewaard, zodat "Genereer" nooit werk weggooit. De
 * geschiedenis staat bewust náást het dossier-snapshot (eigen opslagsleutel): het
 * snapshot wordt bij elke toetsaanslag herschreven, de geschiedenis alleen bij een
 * nieuwe versie.
 */
export type DraftVersion = {
  id: string
  kind: DraftVersionKind
  /** Korte omschrijving van wat deze versie opleverde. */
  label: string
  stage: Stage
  html: string
  words: number
  createdAt: string
  provider?: string
  model?: string
  /** Id van de versie waaruit is hersteld (alleen bij kind 'herstel'). */
  restoredFromId?: string
}

/** Versiegeschiedenis van alle stukken van één project, op stuk-id (DraftDocument.id). */
export type DraftVersionHistory = Record<string, DraftVersion[]>

/** Status van één onderdeel op het indieningsscherm. */
export type SubmissionStatus = 'open' | 'bezig' | 'gereed' | 'nvt'

/** Het (definitieve) bestand dat bij een onderdeel van de indiening hoort. */
export type SubmissionFile = {
  name: string
  size: number
  type: string
  /** URL in Vercel Blob; ontbreekt als alleen de bestandsgegevens zijn vastgelegd. */
  url?: string
  uploadedAt: string
}

/** Per onderdeel (stuk, bijlage of eis) vastgelegd: status, eigenaar, notitie en bestand. */
export type SubmissionEntry = {
  /** Handmatige status; ontbreekt = afgeleid (stadium van het stuk, status van de eis). */
  status?: SubmissionStatus
  /** Wie uit het bidteam dit oppakt. */
  owner?: string
  note?: string
  file?: SubmissionFile | null
  updatedAt: string
}

/** Bijlage die de bidmanager zelf aan de indieningsset toevoegt (niet uit de analyse). */
export type CustomSubmissionItem = {
  id: string
  title: string
  kind: 'formulier' | 'bewijsstuk'
  mandatory: boolean
}

/** Indieningsscherm: de checklist van alle stukken, bijlagen en eisen richting de deadline. */
export type SubmissionState = {
  entries: Record<string, SubmissionEntry>
  customItems: CustomSubmissionItem[]
  /** Moment waarop de bidmanager de inschrijving als ingediend heeft gemarkeerd. */
  submittedAt?: string | null
  submittedNote?: string
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
  /** Status per eis uit het eisenregister (analysis.requirements), op eis-id. */
  requirementStatuses?: Record<string, RequirementStatusEntry>
  /** Indieningschecklist (status, eigenaar en bestand per onderdeel). */
  submission?: SubmissionState
  updatedAt: string
}
