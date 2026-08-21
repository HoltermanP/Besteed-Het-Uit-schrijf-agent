export type SourceType = 'tender' | 'company' | 'rules' | 'training'

/** Rol van een aanbestedingsdocument in de map-fase van de analyse. */
export type DocumentRole = 'leidraad' | 'nota-van-inlichtingen' | 'bijlage' | 'overig'

/**
 * Per-document distillaat uit de map-fase: één AI-call leest één stuk volledig
 * en levert een compacte, gestructureerde extractie. De reduce-fase voegt de
 * extracten van alle stukken samen tot één {@link TenderAnalysis}.
 */
export type DocumentExtract = {
  role: DocumentRole
  /** Beknopte samenvatting van waar dit stuk over gaat. */
  summary: string
  wordLimits: WordLimit[]
  contentRequirements: ContentRequirement[]
  documentRequirements: DocumentRequirement[]
  /** Stukken die de inschrijver moet opstellen of aanleveren, met de vraag per stuk. */
  requestedDocuments?: RequestedDocument[]
  submissionRequirements: SubmissionRequirement[]
  evaluationCriteria: string[]
  /** Alleen bij Nota van Inlichtingen: wijzigingen die eerdere eisen overrulen. */
  modifications: string[]
  /** Feiten, cijfers en constraints die relevant zijn om conform te schrijven (m.n. bijlagen). */
  keyFacts: string[]
  /** Lengte van de brontekst waarop dit extract is gebaseerd — voor cache-invalidatie. */
  sourceChars: number
  analyzedAt: string
  provider?: string
  model?: string
}

/** Gecomprimeerde promptversie van een bron (niet-leidraad); eenmalig gedistilleerd en gecachet. */
export type DocumentDistillate = {
  content: string
  /** Lengte van de brontekst waarop het distillaat is gebaseerd — voor cache-invalidatie. */
  sourceChars: number
  distilledAt: string
  provider?: string
  model?: string
}

export type SourceDocument = {
  id: string
  name: string
  type: SourceType
  content: string
  importedAt: string
  /** Gecachet per-document distillaat uit de map-fase; ontbreekt tot het stuk is geanalyseerd. */
  extract?: DocumentExtract | null
  /** Gecomprimeerde versie voor de schrijfprompt (alleen company/rules/training). */
  distilled?: DocumentDistillate | null
}

export type WordLimit = {
  label: string
  section?: string
  min?: number
  max?: number
  unit: 'woorden' | 'paginas' | 'karakters'
  source: string
}

export type ContentRequirement = {
  topic: string
  detail: string
  mandatory: boolean
  source: string
}

export type DocumentRequirement = {
  name: string
  mandatory: boolean
  source: string
}

/**
 * Soort in te dienen stuk:
 * - schrijfstuk: door de inschrijver zelf te SCHRIJVEN (plan van aanpak, kwaliteitsdocument per
 *   (sub)gunningscriterium, casusuitwerking, implementatieplan, presentatie …) — dit schrijft de agent
 * - formulier: voorgeschreven format dat ingevuld/ondertekend wordt (UEA, prijsblad, verklaringen)
 * - bewijsstuk: bestaand bewijs dat wordt bijgevoegd (referenties, CV's, certificaten, uittreksels)
 */
export type RequestedDocumentKind = 'schrijfstuk' | 'formulier' | 'bewijsstuk'

/**
 * Eén concreet stuk dat de uitvraag van de inschrijver verlangt. Voor schrijfstukken is dit
 * de opdracht voor de schrijfagent: de letterlijke vraag, de criteria waarop het stuk wordt
 * beoordeeld, de onderwerpen die erin moeten en de limieten die voor dít stuk gelden.
 */
export type RequestedDocument = {
  /** Stabiele sleutel (afgeleid van de titel) zodat een heranalyse hetzelfde stuk herkent. */
  id: string
  title: string
  kind: RequestedDocumentKind
  /** De letterlijke vraag/opdracht uit de leidraad waar dit stuk antwoord op geeft. */
  question: string
  /** (Sub)gunningscriteria waarop dit stuk wordt beoordeeld, incl. weging waar bekend. */
  criteria: string[]
  /** Onderwerpen/vragen die in dít stuk beantwoord moeten worden. */
  topics: string[]
  /** Limieten die specifiek voor dit stuk gelden (leeg = geen eigen limiet gevonden). */
  wordLimits: WordLimit[]
  /** Vorm-/formaateisen voor dit stuk (bv. "PDF, max. 4 A4, Arial 10"). */
  format?: string
  mandatory: boolean
  source: string
}

/** Specifieke eis aan de inschrijving zelf (vorm, opmaak, indiening, geschiktheid) */
export type SubmissionRequirementCategory =
  | 'vorm'
  | 'opmaak'
  | 'indiening'
  | 'geschiktheid'
  | 'uitsluiting'
  | 'proces'
  | 'overig'

export type SubmissionRequirement = {
  /** Type eis: vorm (bestandsformaat/anonimisering), opmaak (lettertype/marges), indiening (deadline/kanaal/ondertekening), geschiktheid, uitsluiting, proces, overig */
  category: SubmissionRequirementCategory
  /** De concrete, toetsbare eis */
  requirement: string
  mandatory: boolean
  source: string
}

export type StyleProfile = {
  companyName: string
  buyerName: string
  companySignals: string[]
  buyerSignals: string[]
  blendedGuidance: string
}

/** Onderliggende opdrachtintentie — de "vraag achter de vraag" */
export type UnderlyingIntent = {
  explicitQuestion: string
  underlyingNeed: string
  questionBehindQuestion: string
  buyerPriorities: string[]
  implicitSuccessFactors: string[]
  writingGuidance: string
  /** Intern reflectiestuk voor het inschrijver-team; niet bedoeld voor indiening */
  teamBrief: string
}

export type TenderAnalysis = {
  analyzedAt: string
  leidraadFound: boolean
  leidraadSource?: string
  summary: string
  wordLimits: WordLimit[]
  contentRequirements: ContentRequirement[]
  documentRequirements: DocumentRequirement[]
  /**
   * Welke stukken de inschrijver moet opstellen of aanleveren, met per stuk de vraag,
   * criteria, onderwerpen en limieten. De schrijfagent schrijft elk 'schrijfstuk' apart.
   */
  requestedDocuments: RequestedDocument[]
  /** Specifieke eisen aan de inschrijving zelf (vorm, opmaak, indiening, geschiktheid) */
  submissionRequirements: SubmissionRequirement[]
  evaluationCriteria: string[]
  styleProfile: StyleProfile
  underlyingIntent?: UnderlyingIntent
  gaps: string[]
  targetWordCount?: number
  targetCharCount?: number
  /** Bron van de analyse: true zodra een AI de heuristische baseline heeft aangescherpt */
  aiAnalyzed?: boolean
  analysisProvider?: string
  analysisModel?: string
}
