import type { AiProvider } from './apiConfig'
import type { SourceDocument, TenderAnalysis } from './tenderAnalysis'
import type { WriteDraftAiConfig, WriteDraftProject } from './writeDraft'

export type RewriteFragmentRequest = {
  stage: 'brons' | 'zilver' | 'goud'
  project: WriteDraftProject
  /** Het tekstfragment waarop de opmerking betrekking heeft. */
  fragment: string
  /** De reviewopmerking / wijzigingsinstructie van de mens. */
  note: string
  /** Het af te bakenen onderdeel (<section> of <header>) dat herschreven mag worden. */
  sectionHtml: string
  documents: Pick<SourceDocument, 'name' | 'type' | 'content'>[]
  analysis: TenderAnalysis | null
  ai?: WriteDraftAiConfig
}

export type RewriteFragmentResponse = {
  /** Het bijgewerkte onderdeel als HTML (zelfde root-element als sectionHtml). */
  html: string
  model: string
  provider: AiProvider
}

export type RewriteFragmentError = {
  error: string
}
