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
  evaluationCriteria: string[]
  styleProfile: StyleProfile
  underlyingIntent?: UnderlyingIntent
  gaps: string[]
  targetWordCount?: number
  targetCharCount?: number
}
