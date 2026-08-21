import type {
  ContentRequirement,
  RequestedDocument,
  RequestedDocumentKind,
  TenderAnalysis,
  WordLimit,
} from '../types/tenderAnalysis'

/**
 * Gedeelde helpers rond "op te stellen documenten": de stukken die een uitvraag van de
 * inschrijver verlangt. Wordt gebruikt door de analyse (normaliseren/ontdubbelen van
 * AI-output), de werkplek (één concept per schrijfstuk) en de schrijfagent (de analyse
 * toespitsen op het stuk dat nu geschreven wordt). Geen browser- of Node-API's, zodat
 * client en server dezelfde code delen.
 */

export const requestedDocumentKinds: RequestedDocumentKind[] = ['schrijfstuk', 'formulier', 'bewijsstuk']

export const requestedDocumentKindLabels: Record<RequestedDocumentKind, string> = {
  schrijfstuk: 'Schrijfstuk',
  formulier: 'Formulier',
  bewijsstuk: 'Bewijsstuk',
}

export const requestedDocumentKindHints: Record<RequestedDocumentKind, string> = {
  schrijfstuk: 'Door de schrijfagent op te stellen',
  formulier: 'Voorgeschreven format invullen/ondertekenen',
  bewijsstuk: 'Bestaand bewijs bijvoegen',
}

/** Vaste id van het standaard-inschrijfstuk wanneer de analyse geen losse schrijfstukken kent. */
export const FALLBACK_DOCUMENT_ID = 'doc-inschrijfstuk'
export const FALLBACK_DOCUMENT_TITLE = 'Inschrijfstuk'

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function posInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function stringList(value: unknown, max: number): string[] {
  return asArray<unknown>(value)
    .map((item) => str(item))
    .filter(Boolean)
    .slice(0, max)
}

/** Stabiele, leesbare sleutel uit een titel: "Plan van Aanpak — Kwaliteit" → "doc-plan-van-aanpak-kwaliteit". */
export function requestedDocumentId(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `doc-${slug || 'stuk'}`
}

export function normalizeRequestedDocumentKind(value: unknown): RequestedDocumentKind {
  const kind = str(value).toLowerCase()
  if (kind === 'formulier' || kind === 'bewijsstuk') return kind
  if (/formulier|form|verklaring|invul/.test(kind)) return 'formulier'
  if (/bewijs|bijlage|certificaat|referentie/.test(kind)) return 'bewijsstuk'
  return 'schrijfstuk'
}

function normalizeWordLimits(value: unknown, source: string): WordLimit[] {
  return asArray<Record<string, unknown>>(value)
    .map((item): WordLimit | null => {
      const unit = str(item.unit)
      const normalizedUnit = unit === 'karakters' || unit === 'paginas' ? unit : 'woorden'
      const min = posInt(item.min)
      const max = posInt(item.max)
      if (min === undefined && max === undefined) return null
      return {
        label: str(item.label) || 'Limiet',
        section: str(item.section) || undefined,
        min,
        max,
        unit: normalizedUnit,
        source: str(item.source) || source,
      }
    })
    .filter((item): item is WordLimit => item !== null)
}

/** Zet ruwe AI-JSON om naar gevalideerde RequestedDocument-items (ongeldige items vervallen). */
export function normalizeRequestedDocuments(value: unknown, source: string): RequestedDocument[] {
  return dedupeRequestedDocuments(
    asArray<Record<string, unknown>>(value)
      .map((item): RequestedDocument | null => {
        const title = str(item.title) || str(item.name)
        if (!title) return null
        return {
          id: requestedDocumentId(title),
          title,
          kind: normalizeRequestedDocumentKind(item.kind),
          question: str(item.question) || str(item.assignment),
          criteria: stringList(item.criteria, 8),
          topics: stringList(item.topics, 20),
          wordLimits: normalizeWordLimits(item.wordLimits, source),
          format: str(item.format) || undefined,
          mandatory: item.mandatory !== false,
          source: str(item.source) || source,
        }
      })
      .filter((item): item is RequestedDocument => item !== null),
  )
}

/** Ontdubbel op id (titel); de eerste vermelding wint, latere vullen lege velden aan. */
export function dedupeRequestedDocuments(list: RequestedDocument[]): RequestedDocument[] {
  const byId = new Map<string, RequestedDocument>()
  for (const doc of list) {
    const id = doc.id || requestedDocumentId(doc.title)
    const existing = byId.get(id)
    if (!existing) {
      byId.set(id, { ...doc, id })
      continue
    }
    byId.set(id, {
      ...existing,
      // Een schrijfstuk-classificatie wint van formulier/bewijsstuk: dan moet er geschreven worden.
      kind: existing.kind === 'schrijfstuk' || doc.kind === 'schrijfstuk' ? 'schrijfstuk' : existing.kind,
      question: existing.question || doc.question,
      criteria: existing.criteria.length ? existing.criteria : doc.criteria,
      topics: existing.topics.length ? existing.topics : doc.topics,
      wordLimits: existing.wordLimits.length ? existing.wordLimits : doc.wordLimits,
      format: existing.format || doc.format,
      mandatory: existing.mandatory || doc.mandatory,
    })
  }
  return [...byId.values()]
}

/** Strengste maximum (kleinste max) binnen een eenheid. */
export function strictestMax(limits: WordLimit[], unit: WordLimit['unit']): number | undefined {
  return limits
    .filter((limit) => limit.unit === unit && limit.max)
    .reduce<number | undefined>((min, limit) => {
      const value = limit.max!
      return min === undefined ? value : Math.min(min, value)
    }, undefined)
}

/**
 * Standaard-inschrijfstuk wanneer de analyse geen losse schrijfstukken heeft herkend:
 * één document dat alle inhoudseisen en de globale limieten draagt.
 */
export function buildFallbackDocument(analysis: TenderAnalysis | null): RequestedDocument {
  const contentRequirements = analysis?.contentRequirements ?? []
  const leidraad = analysis?.leidraadSource
  const planVanAanpak = (analysis?.documentRequirements ?? []).find((req) => /plan van aanpak/i.test(req.name))
  return {
    id: FALLBACK_DOCUMENT_ID,
    title: planVanAanpak ? 'Plan van aanpak' : FALLBACK_DOCUMENT_TITLE,
    kind: 'schrijfstuk',
    question: analysis?.underlyingIntent?.explicitQuestion
      ? `Lever ${analysis.underlyingIntent.explicitQuestion}.`
      : 'Schrijf het inschrijfstuk dat de aanbestedingsstukken vragen, langs de beoordelingscriteria.',
    criteria: analysis?.evaluationCriteria ?? [],
    topics: contentRequirements.filter((req) => req.mandatory).map((req) => req.topic),
    wordLimits: analysis?.wordLimits ?? [],
    mandatory: true,
    source: leidraad ?? 'leidraad',
  }
}

/** De stukken die de schrijfagent moet schrijven; altijd minstens één (het standaard-inschrijfstuk). */
export function writableDocuments(analysis: TenderAnalysis | null): RequestedDocument[] {
  const writable = (analysis?.requestedDocuments ?? []).filter((doc) => doc.kind === 'schrijfstuk')
  return writable.length ? writable : [buildFallbackDocument(analysis)]
}

/** Formulieren en bewijsstukken: de checklist van wat naast de schrijfstukken moet worden aangeleverd. */
export function nonWritableDocuments(analysis: TenderAnalysis | null): RequestedDocument[] {
  return (analysis?.requestedDocuments ?? []).filter((doc) => doc.kind !== 'schrijfstuk')
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length > 3)
}

/** Ruwe overeenkomst tussen een onderwerp uit het stuk en een inhoudseis uit de analyse. */
function topicMatches(topic: string, requirement: ContentRequirement): boolean {
  const a = topic.toLowerCase()
  const b = requirement.topic.toLowerCase()
  if (a === b || a.includes(b) || b.includes(a)) return true
  const at = tokens(topic)
  const bt = tokens(requirement.topic)
  if (!at.length || !bt.length) return false
  const overlap = at.filter((token) => bt.includes(token)).length
  return overlap >= Math.min(2, Math.min(at.length, bt.length))
}

/**
 * Spits de analyse toe op één te schrijven stuk: de inhoudseisen, criteria en limieten van
 * dát document. Zo schrijft, reviewt en telt de pijplijn per stuk in plaats van op de
 * hele uitvraag. Is dit het enige schrijfstuk, dan gelden de globale limieten en eisen.
 */
export function scopeAnalysisToDocument(
  analysis: TenderAnalysis,
  doc: RequestedDocument,
  options: { soleDocument?: boolean } = {},
): TenderAnalysis {
  const sole = options.soleDocument ?? writableDocuments(analysis).length <= 1

  const wordLimits = doc.wordLimits.length ? doc.wordLimits : sole ? analysis.wordLimits : []
  const evaluationCriteria = doc.criteria.length ? doc.criteria : analysis.evaluationCriteria

  let contentRequirements: ContentRequirement[]
  if (doc.topics.length) {
    const matched = analysis.contentRequirements.filter((req) => doc.topics.some((topic) => topicMatches(topic, req)))
    const extra = doc.topics
      .filter((topic) => !matched.some((req) => topicMatches(topic, req)))
      .map((topic): ContentRequirement => ({ topic, detail: topic, mandatory: doc.mandatory, source: doc.source }))
    contentRequirements = [...matched, ...extra]
  } else {
    contentRequirements = analysis.contentRequirements
  }

  return {
    ...analysis,
    wordLimits,
    evaluationCriteria,
    contentRequirements,
    targetWordCount: strictestMax(wordLimits, 'woorden'),
    targetCharCount: strictestMax(wordLimits, 'karakters'),
  }
}

/** Korte, leesbare weergave van de limieten van een stuk ("max. 3500 woorden · max. 4 pagina's"). */
export function formatDocumentLimits(doc: RequestedDocument): string {
  return doc.wordLimits
    .map((limit) => {
      const unit = limit.unit === 'paginas' ? "pagina's" : limit.unit
      if (limit.min && limit.max) return `${limit.min}–${limit.max} ${unit}`
      if (limit.max) return `max. ${limit.max.toLocaleString('nl-NL')} ${unit}`
      if (limit.min) return `min. ${limit.min.toLocaleString('nl-NL')} ${unit}`
      return unit
    })
    .join(' · ')
}
