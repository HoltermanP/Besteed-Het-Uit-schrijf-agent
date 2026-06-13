import type { AiProvider } from './apiConfig'
import type { TenderAnalysis } from './tenderAnalysis'

export type WriteDraftAiConfig = {
  provider: AiProvider
  baseUrl: string
  apiKey: string
  model: string
}

export type WriteDraftDocument = {
  name: string
  type: 'tender' | 'company' | 'rules' | 'training'
  content: string
}

export type WriteDraftComment = {
  fragment: string
  note: string
  resolved: boolean
}

export type WriteDraftProject = {
  title: string
  tendernedId: string
  buyer: string
  deadline: string
}

export type WriteDraftRequest = {
  stage: 'brons' | 'zilver' | 'goud'
  project: WriteDraftProject
  documents: WriteDraftDocument[]
  comments: WriteDraftComment[]
  analysis: TenderAnalysis | null
  currentDraft?: string
  ai?: WriteDraftAiConfig
  stream?: boolean
}

export type WriteDraftResponse = {
  html: string
  model: string
  provider: AiProvider
}

export type WriteDraftError = {
  error: string
}
