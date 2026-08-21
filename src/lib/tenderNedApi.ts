import type {
  CpvCode,
  TenderDetail,
  TenderDocument,
  TenderDocumentBundle,
  TenderListItem,
  TenderSearchFilters,
} from '../types/tenderNed'
import { cpvSignificantPrefix, cpvWithCheckDigit } from './cpv'
import { mapWithConcurrency } from './analyzeDocumentApi'

const API_BASE = '/api/tenderned'

/**
 * TenderNed geeft bij pieken incidenteel een 5xx/429 terug; één herhaalde
 * poging na korte pauze vangt dat op zonder de gebruiker te storen.
 */
async function fetchTenderNed(url: string, retries = 2): Promise<Response> {
  let response = await fetch(url)
  for (let attempt = 0; attempt < retries && (response.status >= 500 || response.status === 429); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_500 * (attempt + 1)))
    response = await fetch(url)
  }
  return response
}

type RawPublication = {
  publicatieId: string
  kenmerk: number
  aanbestedingNaam: string
  opdrachtgeverNaam: string
  sluitingsDatum: string
  aantalDagenTotSluitingsDatum: number | null
  publicatieDatum?: string
  opdrachtBeschrijving?: string
  typePublicatie?: { code?: string; omschrijving?: string }
  typeOpdracht?: { omschrijving: string }
  procedure?: { omschrijving: string }
  link?: { href: string }
}

type RawPage = {
  content: RawPublication[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

type RawDetail = {
  publicatieId: number
  kenmerk: number
  aanbestedingNaam: string
  opdrachtgeverNaam: string
  sluitingsDatum: string
  publicatieDatum?: string
  opdrachtBeschrijving?: string
  cpvCodes?: CpvCode[]
  nutsCodes?: Array<{ code: string; omschrijving: string }>
  links?: { pdf?: { href: string } }
}

/** Dagen tot sluiting; TenderNed laat het veld soms leeg (bijv. marktconsultaties), dan zelf uit de datum afleiden. */
function daysUntil(sluitingsDatum: string | undefined, fallback: number | null | undefined): number {
  if (typeof fallback === 'number') return fallback
  if (!sluitingsDatum) return 0
  const closing = new Date(sluitingsDatum).getTime()
  if (Number.isNaN(closing)) return 0
  return Math.ceil((closing - Date.now()) / 86_400_000)
}

function mapListItem(raw: RawPublication, fetchedAt: string): TenderListItem {
  return {
    publicatieId: String(raw.publicatieId),
    kenmerk: raw.kenmerk,
    aanbestedingNaam: raw.aanbestedingNaam,
    opdrachtgeverNaam: raw.opdrachtgeverNaam,
    sluitingsDatum: raw.sluitingsDatum,
    aantalDagenTotSluitingsDatum: daysUntil(raw.sluitingsDatum, raw.aantalDagenTotSluitingsDatum),
    typePublicatie: raw.typePublicatie?.omschrijving,
    publicatieDatum: raw.publicatieDatum,
    fetchedAt,
    opdrachtBeschrijving: raw.opdrachtBeschrijving ?? '',
    typeOpdracht: raw.typeOpdracht?.omschrijving,
    procedure: raw.procedure?.omschrijving,
    link: raw.link?.href,
  }
}

export function matchesFilters(item: TenderListItem, filters: TenderSearchFilters) {
  if (filters.onlyOpen && item.aantalDagenTotSluitingsDatum < 0) return false

  if (filters.query.trim()) {
    const q = filters.query.toLowerCase()
    const haystack = `${item.aanbestedingNaam} ${item.opdrachtgeverNaam} ${item.opdrachtBeschrijving}`.toLowerCase()
    if (!haystack.includes(q)) return false
  }

  if (filters.cpvPrefix.trim() && item.cpvCodes?.length) {
    // CPV is hiërarchisch: een volledige code als "72000000" betekent de hele
    // afdeling 72 — opvullende nullen tellen niet mee in de match, anders
    // vindt zoeken op een bedrijfscode vrijwel nooit iets.
    const prefix = cpvSignificantPrefix(filters.cpvPrefix)
    const hit = item.cpvCodes.some((cpv) => cpv.code.replace(/\s/g, '').startsWith(prefix))
    if (!hit) return false
  }

  return true
}

export async function fetchPublicationsPage(page = 0, size = 20): Promise<{
  items: TenderListItem[]
  totalElements: number
  totalPages: number
  page: number
}> {
  const response = await fetchTenderNed(`${API_BASE}/v2/publicaties?page=${page}&size=${size}`)
  if (!response.ok) throw new Error(`TenderNed laden mislukt (${response.status})`)
  const data = (await response.json()) as RawPage
  const fetchedAt = new Date().toISOString()
  return {
    items: data.content.map((raw) => mapListItem(raw, fetchedAt)),
    totalElements: data.totalElements,
    totalPages: data.totalPages,
    page: data.number,
  }
}

export async function fetchPublicationDetail(publicatieId: string): Promise<TenderDetail> {
  const response = await fetchTenderNed(`${API_BASE}/v2/publicaties/${publicatieId}`)
  if (!response.ok) throw new Error(`Detail ${publicatieId} laden mislukt (${response.status})`)
  const raw = (await response.json()) as RawDetail
  const tendernedUrl = `https://www.tenderned.nl/aankondigingen/overzicht/${publicatieId}`

  return {
    publicatieId: String(raw.publicatieId),
    kenmerk: raw.kenmerk,
    aanbestedingNaam: raw.aanbestedingNaam,
    opdrachtgeverNaam: raw.opdrachtgeverNaam,
    sluitingsDatum: raw.sluitingsDatum,
    aantalDagenTotSluitingsDatum: 0,
    opdrachtBeschrijving: raw.opdrachtBeschrijving ?? '',
    publicatieDatum: raw.publicatieDatum ?? '',
    fetchedAt: new Date().toISOString(),
    cpvCodes: raw.cpvCodes ?? [],
    nutsCodes: raw.nutsCodes,
    pdfUrl: raw.links?.pdf?.href ? `https://www.tenderned.nl${raw.links.pdf.href}` : undefined,
    tendernedUrl,
    raw: raw as unknown as Record<string, unknown>,
  }
}

type RawDocument = {
  documentId?: string
  documentNaam?: string
  typeDocument?: { code?: string; omschrijving?: string }
  publicatieCategorie?: { code?: string; omschrijving?: string }
  grootte?: number
  links?: { download?: { href?: string } }
}

function mapDocument(raw: RawDocument): TenderDocument {
  const naam = raw.documentNaam?.trim() || raw.documentId || 'Document'
  return {
    documentId: raw.documentId ?? naam,
    documentNaam: naam,
    type: (raw.typeDocument?.code || naam.split('.').pop() || 'onbekend').toLowerCase(),
    categorie: raw.publicatieCategorie?.code ?? '',
    categorieOmschrijving: raw.publicatieCategorie?.omschrijving ?? '',
    grootte: raw.grootte ?? 0,
    downloadHref: raw.links?.download?.href
      ? `https://www.tenderned.nl${raw.links.download.href}`
      : '',
  }
}

/** Lichtgewicht metadata-lijst van alle documenten bij een publicatie (zonder download/extractie). */
export async function fetchPublicationDocumentList(publicatieId: string): Promise<TenderDocument[]> {
  const response = await fetchTenderNed(`${API_BASE}/v2/publicaties/${publicatieId}/documenten`)
  if (!response.ok) throw new Error(`Documentenlijst ${publicatieId} laden mislukt (${response.status})`)
  const data = (await response.json()) as { documenten?: RawDocument[] }
  return (data.documenten ?? []).map(mapDocument)
}

/** Downloadt alle documenten bij een publicatie en haalt er tekst uit (server-side, incl. zip-inhoud). */
export async function fetchTenderDocumentBundle(publicatieId: string): Promise<TenderDocumentBundle> {
  const response = await fetch(`/api/tender-documents?publicatieId=${encodeURIComponent(publicatieId)}`)
  const data = (await response.json()) as TenderDocumentBundle | { error: string }
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : `Documenten ${publicatieId} downloaden mislukt`)
  }
  return data
}

/**
 * Laadt de CPV-codes per item bij via de detail-endpoint (lijstitems hebben ze
 * niet). Begrensde parallelliteit om de TenderNed-proxy niet te overvragen.
 */
export async function enrichWithCpv(
  items: TenderListItem[],
  options: { concurrency?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<TenderListItem[]> {
  return mapWithConcurrency(
    items,
    options.concurrency ?? 6,
    async (item) => {
      if (item.cpvCodes?.length) return item
      try {
        const detail = await fetchPublicationDetail(item.publicatieId)
        return { ...item, cpvCodes: detail.cpvCodes }
      } catch {
        return item
      }
    },
    options.onProgress,
  )
}

/** Scan meerdere pagina's en filter op CPV/tekst (TNS heeft ~144k publicaties). */
export async function searchPublications(
  filters: TenderSearchFilters,
  options: { maxPages?: number; pageSize?: number; targetMatches?: number } = {},
): Promise<{ items: TenderListItem[]; scannedPages: number; totalElements: number }> {
  const maxPages = options.maxPages ?? (filters.cpvPrefix.trim() ? 15 : 1)
  const pageSize = options.pageSize ?? 50
  const targetMatches = options.targetMatches ?? 40
  const matches: TenderListItem[] = []
  let totalElements = 0
  let scannedPages = 0

  for (let page = 0; page < maxPages; page += 1) {
    const result = await fetchPublicationsPage(page, pageSize)
    totalElements = result.totalElements
    scannedPages += 1

    const needsCpv = Boolean(filters.cpvPrefix.trim())
    const batch = needsCpv ? await enrichWithCpv(result.items) : result.items

    batch.forEach((item) => {
      if (matches.length >= targetMatches) return
      if (matches.some((existing) => existing.publicatieId === item.publicatieId)) return
      if (matchesFilters(item, filters)) matches.push(item)
    })

    if (matches.length >= targetMatches) break
    if (page >= result.totalPages - 1) break
  }

  return { items: matches, scannedPages, totalElements }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Eén pagina uit TenderNed, server-side gefilterd op CPV-codes (hiërarchisch:
 * "72000000-5" dekt de hele afdeling 72) en optioneel op sluitingsdatum.
 * TenderNed verwacht de volledige notatie met controlecijfer; ongeldige codes
 * worden overgeslagen.
 */
export async function fetchPublicationsByCpv(
  companyCodes: Array<{ code: string }>,
  options: { page?: number; size?: number; onlyOpen?: boolean; publishedSince?: string } = {},
): Promise<{ items: TenderListItem[]; totalElements: number; totalPages: number; page: number }> {
  const codes = [...new Set(companyCodes.map((cpv) => cpvWithCheckDigit(cpv.code)).filter((code): code is string => Boolean(code)))]
  if (!codes.length) throw new Error('Geen geldige CPV-codes om op te filteren.')

  const params = new URLSearchParams()
  params.set('page', String(options.page ?? 0))
  params.set('size', String(options.size ?? 100))
  codes.forEach((code) => params.append('cpvCodes', code))
  if (options.onlyOpen !== false) params.set('sluitingsDatumVanaf', todayIso())
  if (options.publishedSince) params.set('publicatieDatumVanaf', options.publishedSince)

  const response = await fetchTenderNed(`${API_BASE}/v2/publicaties?${params.toString()}`)
  if (!response.ok) throw new Error(`TenderNed CPV-filter mislukt (${response.status})`)
  const data = (await response.json()) as RawPage
  const fetchedAt = new Date().toISOString()
  return {
    items: data.content.map((raw) => mapListItem(raw, fetchedAt)),
    totalElements: data.totalElements,
    totalPages: data.totalPages,
    page: data.number,
  }
}

/**
 * Stap 1 van de voorselectie — puur op CPV-codes, zonder AI: haalt via het
 * server-side CPV-filter van TenderNed alle (open) publicaties op die binnen
 * de bedrijfs-CPV-codes vallen, ontdubbelt rectificaties op aanbestedingskenmerk
 * en laadt daarna de CPV-codes per tender bij (nodig voor weergave en voor
 * de AI-score in stap 2).
 */
export async function searchCompanyRelevantPublications(
  companyCodes: Array<{ code: string }>,
  options: {
    onlyOpen?: boolean
    maxItems?: number
    pageSize?: number
    onProgress?: (progress: { phase: 'lijst' | 'cpv'; done: number; total: number }) => void
  } = {},
): Promise<{ items: TenderListItem[]; scannedPages: number; totalElements: number }> {
  const maxItems = options.maxItems ?? 200
  const pageSize = options.pageSize ?? 100
  const seenIds = new Set<string>()
  const seenKenmerk = new Set<number>()
  const matches: TenderListItem[] = []
  let totalElements = 0
  let scannedPages = 0

  for (let page = 0; matches.length < maxItems; page += 1) {
    const result = await fetchPublicationsByCpv(companyCodes, { page, size: pageSize, onlyOpen: options.onlyOpen })
    totalElements = result.totalElements
    scannedPages += 1
    for (const item of result.items) {
      if (matches.length >= maxItems) break
      if (seenIds.has(item.publicatieId)) continue
      // Rectificaties en vervolgpublicaties delen het kenmerk van de
      // aanbesteding; de nieuwste publicatie (TenderNed sorteert nieuw → oud)
      // wint, zodat dezelfde tender niet twee keer in de lijst staat.
      if (item.kenmerk && seenKenmerk.has(item.kenmerk)) continue
      seenIds.add(item.publicatieId)
      if (item.kenmerk) seenKenmerk.add(item.kenmerk)
      matches.push(item)
    }
    options.onProgress?.({ phase: 'lijst', done: matches.length, total: Math.min(maxItems, totalElements) })
    if (page >= result.totalPages - 1 || !result.items.length) break
  }

  const enriched = await enrichWithCpv(matches, {
    concurrency: 6,
    onProgress: (done, total) => options.onProgress?.({ phase: 'cpv', done, total }),
  })

  return { items: enriched, scannedPages, totalElements }
}

export function collectCpvCodes(items: TenderListItem[]): CpvCode[] {
  const map = new Map<string, CpvCode>()
  items.forEach((item) => {
    item.cpvCodes?.forEach((cpv) => {
      if (!map.has(cpv.code)) map.set(cpv.code, cpv)
    })
  })
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code))
}
