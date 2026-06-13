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
  unit: 'woorden' | 'paginas'
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
  gaps: string[]
  targetWordCount?: number
}
