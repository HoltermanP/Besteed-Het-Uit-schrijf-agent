import type { AiProvider } from './apiConfig'
import type { RequestedDocument, TenderAnalysis } from './tenderAnalysis'

export type WriteDraftAiConfig = {
  provider: AiProvider
  baseUrl: string
  apiKey: string
  model: string
  testMode?: boolean
}

export type WriteDraftDocument = {
  name: string
  type: 'tender' | 'company' | 'rules' | 'training' | 'lessons'
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

/** Kort profiel van een ander stuk uit dezelfde inschrijving (voor afbakening en samenhang). */
export type WriteDraftSibling = Pick<RequestedDocument, 'title' | 'kind' | 'question'>

/**
 * Uitkomst van de verbeterronde die de schrijfagent moet verwerken: alleen door de gebruiker
 * goedgekeurde voorstellen en gegeven antwoorden; onbeantwoorde vragen markeren wat NIET
 * met aannames ingevuld mag worden.
 */
export type WriteDraftImprovements = {
  approvedProposals: Array<{
    kind: 'verbeteren' | 'overtreffen'
    title: string
    detail: string
    rationale: string
    section?: string
    input?: string
  }>
  answers: Array<{ question: string; answer: string; section?: string }>
  unanswered: Array<{ question: string; reason: string; section?: string }>
}

export type WriteDraftRequest = {
  stage: 'brons' | 'zilver' | 'goud'
  project: WriteDraftProject
  documents: WriteDraftDocument[]
  comments: WriteDraftComment[]
  /** Analyse, bij voorkeur al toegespitst op het te schrijven stuk (zie scopeAnalysisToDocument). */
  analysis: TenderAnalysis | null
  /** Het stuk dat nu geschreven wordt: titel, vraag, criteria, onderwerpen en limieten. */
  targetDocument?: RequestedDocument
  /** De overige stukken van deze inschrijving — elders uitgewerkt, hier niet herhalen. */
  siblingDocuments?: WriteDraftSibling[]
  /** Goedgekeurde voorstellen en antwoorden uit de verbeterronde (zilver/goud). */
  improvements?: WriteDraftImprovements
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
