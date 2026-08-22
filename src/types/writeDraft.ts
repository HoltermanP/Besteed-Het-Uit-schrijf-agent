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
  /**
   * Opmaakdichtheid die de werkplek aan een echt concept van deze inschrijving heeft
   * gemeten: hoeveel zichtbare woorden er in één A4 van de PDF-export passen. Hiermee
   * rekent de schrijfagent een paginalimiet ("max. 2 A4") om naar een woordbudget dat
   * klopt met wat er straks daadwerkelijk wordt geëxporteerd. Ontbreekt bij het eerste
   * stuk van een project; dan geldt de geijkte standaard.
   */
  layout?: { wordsPerPage: number }
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

/*
 * Achtergrondopdracht van de schrijfagent. De browser start een opdracht en volgt die met
 * korte statusverzoeken; het schrijven zelf draait op de server. Valt de verbinding weg of
 * gaat het tabblad dicht, dan loopt de opdracht door en is het resultaat er later gewoon.
 */

export type WriteDraftJobStatus = 'lopend' | 'gereed' | 'mislukt'

/** Wat de browser meestuurt om de opdracht later bij het juiste stuk terug te vinden. */
export type WriteDraftJobStart = {
  projectId: string
  draftId: string
  draftTitle: string
  /** Waarvoor de opdracht draait; alleen voor de melding aan de gebruiker. */
  kind: 'schrijven' | 'opmerkingen' | 'verbeterronde'
}

export type WriteDraftJobSnapshot = {
  id: string
  projectId: string
  draftId: string
  draftTitle: string
  stage: WriteDraftRequest['stage']
  kind: string
  status: WriteDraftJobStatus
  /** Statusmelding voor de gebruiker ("Secties schrijven (3/7 gereed)…"). */
  message: string
  /** Loopt op bij elke voortgangsschrijving; met `since` haalt de client alleen nieuwe tekst op. */
  version: number
  /** Het document tot nu toe; null als er sinds `since` niets veranderde. */
  partialHtml: string | null
  /** Het afgeronde stuk; alleen gevuld bij status 'gereed'. */
  html: string | null
  error: string | null
  provider: string | null
  model: string | null
  startedAt: string
  updatedAt: string
  finishedAt: string | null
}
