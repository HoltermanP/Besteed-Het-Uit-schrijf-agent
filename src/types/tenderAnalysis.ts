export type SourceType = 'tender' | 'company' | 'rules' | 'training'

export type SourceDocument = {
  id: string
  name: string
  type: SourceType
  content: string
  importedAt: string
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
