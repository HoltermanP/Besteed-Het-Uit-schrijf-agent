import type {
  CpvCode,
  TenderDetail,
  TenderDocument,
  TenderDocumentBundle,
  TenderListItem,
  TenderSearchFilters,
} from '../types/tenderNed'

const API_BASE = '/api/tenderned'

type RawPublication = {
  publicatieId: string
  kenmerk: number
  aanbestedingNaam: string
  opdrachtgeverNaam: string
  sluitingsDatum: string
  aantalDagenTotSluitingsDatum: number
  opdrachtBeschrijving?: string
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

function mapListItem(raw: RawPublication): TenderListItem {
  return {
    publicatieId: raw.publicatieId,
    kenmerk: raw.kenmerk,
    aanbestedingNaam: raw.aanbestedingNaam,
    opdrachtgeverNaam: raw.opdrachtgeverNaam,
    sluitingsDatum: raw.sluitingsDatum,
    aantalDagenTotSluitingsDatum: raw.aantalDagenTotSluitingsDatum,
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
    const prefix = filters.cpvPrefix.replace(/\s/g, '')
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
  const response = await fetch(`${API_BASE}/v2/publicaties?page=${page}&size=${size}`)
  if (!response.ok) throw new Error(`TenderNed laden mislukt (${response.status})`)
  const data = (await response.json()) as RawPage
  return {
    items: data.content.map(mapListItem),
    totalElements: data.totalElements,
    totalPages: data.totalPages,
    page: data.number,
  }
}

export async function fetchPublicationDetail(publicatieId: string): Promise<TenderDetail> {
  const response = await fetch(`${API_BASE}/v2/publicaties/${publicatieId}`)
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
  const response = await fetch(`${API_BASE}/v2/publicaties/${publicatieId}/documenten`)
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

export async function enrichWithCpv(items: TenderListItem[]): Promise<TenderListItem[]> {
  const enriched = await Promise.all(
    items.map(async (item) => {
      if (item.cpvCodes?.length) return item
      try {
        const detail = await fetchPublicationDetail(item.publicatieId)
        return { ...item, cpvCodes: detail.cpvCodes }
      } catch {
        return item
      }
    }),
  )
  return enriched
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

export function collectCpvCodes(items: TenderListItem[]): CpvCode[] {
  const map = new Map<string, CpvCode>()
  items.forEach((item) => {
    item.cpvCodes?.forEach((cpv) => {
      if (!map.has(cpv.code)) map.set(cpv.code, cpv)
    })
  })
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code))
}
