import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cpvWithCheckDigit } from '../../src/lib/cpv'
import type {
  AwardLot,
  AwardParseStatus,
  BuyerAward,
  BuyerCompetition,
  BuyerHistory,
  BuyerHistoryRequest,
  BuyerWinner,
} from '../../src/types/buyerHistory'
import type { CpvCode } from '../../src/types/tenderNed'
import { parseAwardNotice } from './awardNotice'
import { extractDocumentText } from './extractDocumentText'
import { isDatabaseConfigured, prisma } from './prisma'

/**
 * Marktbeeld per opdrachtgever, opgebouwd uit de gunningsaankondigingen (AGO) op
 * TenderNed.
 *
 * De TenderNed-API kan niet op opdrachtgever filteren — alleen op publicatiesoort,
 * CPV-code en publicatiedatum. Het beeld wordt daarom in twee stappen opgebouwd:
 * eerst een goedkope scan over de lijstpagina's binnen hetzelfde vakgebied, waarin
 * op naam wordt gematcht, daarna het lezen van de PDF's van alleen de gevonden
 * gunningen. Dat laatste is het dure deel en wordt permanent gecachet: een gunning
 * verandert niet meer, en de gegevens zijn publiek, dus de cache is gedeeld over
 * alle projecten en bedrijven.
 */

const TNS_BASE = 'https://www.tenderned.nl/papi/tenderned-rs-tns'
const DEV_STORE_PATH = path.join(process.cwd(), '.data', 'award-notices.json')

const PAGE_SIZE = 100
/** Lijstpagina's per scan; 100 pagina's dekt ruim tien jaar binnen één CPV-afdeling. */
const MAX_PAGES = 100
const LIST_CONCURRENCY = 6
/** Gunningen waarvan de PDF per verzoek wordt gelezen; de rest volgt bij een volgende scan. */
const MAX_PDF_READS = 40
const PDF_CONCURRENCY = 5
const MAX_PDF_BYTES = 12 * 1024 * 1024
const DEFAULT_YEARS = 5

type StoredAward = BuyerAward & { buyerKey: string; readAt: string }

type DevStore = { awards: StoredAward[] }

let devStoreCache: DevStore | null = null
let memoryStore: DevStore = { awards: [] }

function memoryStoreEnabled() {
  return process.env.AWARDS_MEMORY === '1'
}

async function readDevStore(): Promise<DevStore> {
  if (memoryStoreEnabled()) return memoryStore
  if (devStoreCache) return devStoreCache
  try {
    devStoreCache = JSON.parse(await readFile(DEV_STORE_PATH, 'utf8')) as DevStore
  } catch {
    devStoreCache = { awards: [] }
  }
  return devStoreCache
}

async function writeDevStore(store: DevStore) {
  if (memoryStoreEnabled()) {
    memoryStore = store
    return
  }
  devStoreCache = store
  await mkdir(path.dirname(DEV_STORE_PATH), { recursive: true })
  await writeFile(DEV_STORE_PATH, JSON.stringify(store, null, 2), 'utf8')
}

/**
 * Vergelijkbare vorm van een opdrachtgeversnaam. TenderNed kent geen vaste
 * schrijfwijze: dezelfde dienst heet er "Gemeente 's-Hertogenbosch" en
 * "Gemeente s Hertogenbosch", met of zonder rechtsvorm erachter.
 */
export function buyerKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?|c\.?v\.?|stichting|gemeenschappelijke regeling)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Hoort deze gunning bij de gevraagde opdrachtgever? Naast de exacte naam tellen
 * ook onderdelen mee ("Gemeente Amsterdam, Ingenieursbureau"), want die schrijven
 * dezelfde aanbestedingen uit — maar alleen op woordgrens, zodat "Gemeente Best"
 * niet ook "Gemeente Bestwijk" opslokt.
 */
export function matchesBuyer(candidate: string, target: string, includeVariants: boolean): boolean {
  const a = buyerKey(candidate)
  const b = buyerKey(target)
  if (!a || !b) return false
  if (a === b) return true
  if (!includeVariants) return false
  return a.startsWith(`${b} `)
}

async function mapWithLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index])
    }
  })
  await Promise.all(runners)
  return results
}

type RawListItem = {
  publicatieId: string | number
  kenmerk?: number
  aanbestedingNaam?: string
  opdrachtgeverNaam?: string
  publicatieDatum?: string
}

type RawListPage = {
  content?: RawListItem[]
  totalPages?: number
  totalElements?: number
}

function listUrl(page: number, cpvCodes: string[], since: string): string {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('size', String(PAGE_SIZE))
  params.set('publicatieType', 'AGO')
  params.set('publicatieDatumVanaf', since)
  cpvCodes.forEach((code) => params.append('cpvCodes', code))
  return `${TNS_BASE}/v2/publicaties?${params.toString()}`
}

async function fetchListPage(page: number, cpvCodes: string[], since: string): Promise<RawListPage | null> {
  try {
    const response = await fetch(listUrl(page, cpvCodes, since), { headers: { Accept: 'application/json' } })
    if (!response.ok) return null
    return (await response.json()) as RawListPage
  } catch {
    return null
  }
}

type ScanHit = {
  publicatieId: string
  kenmerk: number | null
  buyer: string
  title: string
  publishedOn: string | null
}

function toHit(raw: RawListItem): ScanHit {
  return {
    publicatieId: String(raw.publicatieId),
    kenmerk: typeof raw.kenmerk === 'number' ? raw.kenmerk : null,
    buyer: raw.opdrachtgeverNaam ?? '',
    title: raw.aanbestedingNaam ?? '',
    publishedOn: raw.publicatieDatum ? raw.publicatieDatum.slice(0, 10) : null,
  }
}

/** Loopt de gunningslijst af en houdt alleen de publicaties van deze opdrachtgever over. */
async function scanBuyerAwards(buyer: string, cpvCodes: string[], since: string, includeVariants: boolean) {
  const first = await fetchListPage(0, cpvCodes, since)
  if (!first) throw new Error('TenderNed is nu niet bereikbaar; probeer het zo opnieuw.')

  const totalPages = Math.min(first.totalPages ?? 1, MAX_PAGES)
  const hits: ScanHit[] = []
  const seen = new Set<string>()

  const collect = (items: RawListItem[] | undefined) => {
    for (const raw of items ?? []) {
      const hit = toHit(raw)
      if (seen.has(hit.publicatieId)) continue
      if (!matchesBuyer(hit.buyer, buyer, includeVariants)) continue
      seen.add(hit.publicatieId)
      hits.push(hit)
    }
  }

  collect(first.content)

  const rest = Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => index + 1)
  const pages = await mapWithLimit(rest, LIST_CONCURRENCY, (page) => fetchListPage(page, cpvCodes, since))
  pages.forEach((page) => collect(page?.content))

  hits.sort((a, b) => (b.publishedOn ?? '').localeCompare(a.publishedOn ?? ''))
  return { hits, scannedPages: totalPages, totalInScope: first.totalElements ?? 0 }
}

async function fetchAwardCpv(publicatieId: string): Promise<CpvCode[]> {
  try {
    const response = await fetch(`${TNS_BASE}/v2/publicaties/${publicatieId}`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return []
    const detail = (await response.json()) as { cpvCodes?: CpvCode[] }
    return detail.cpvCodes ?? []
  } catch {
    return []
  }
}

/** Downloadt de gunnings-PDF en leest er de winnaars en het aantal inschrijvers uit. */
async function readAwardPdf(hit: ScanHit): Promise<Pick<BuyerAward, 'status' | 'format' | 'lots' | 'note'>> {
  let buffer: Buffer
  try {
    const response = await fetch(`${TNS_BASE}/v2/publicaties/${hit.publicatieId}/pdf`)
    if (!response.ok) {
      return { status: 'onleesbaar', format: null, lots: [], note: `PDF ophalen mislukt (${response.status})` }
    }
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > MAX_PDF_BYTES) {
      return { status: 'onleesbaar', format: null, lots: [], note: 'PDF te groot' }
    }
    buffer = Buffer.from(bytes)
  } catch {
    return { status: 'onleesbaar', format: null, lots: [], note: 'PDF ophalen mislukt' }
  }

  let text: string
  try {
    text = await extractDocumentText(`gunning-${hit.publicatieId}.pdf`, buffer)
  } catch {
    return { status: 'onleesbaar', format: null, lots: [], note: 'Geen tekst uit de PDF te halen' }
  }

  const parsed = parseAwardNotice(text)
  const awarded = parsed.lots.filter((lot) => lot.awarded)

  if (!parsed.lots.length) {
    return { status: 'onleesbaar', format: parsed.format, lots: [], note: 'Geen resultaatsectie in de aankondiging' }
  }
  if (!awarded.length) {
    return {
      status: 'niet-gegund',
      format: parsed.format,
      lots: parsed.lots,
      note: 'De procedure is niet gegund of ingetrokken',
    }
  }
  return { status: 'ok', format: parsed.format, lots: parsed.lots, note: null }
}

// --- cache ---------------------------------------------------------------

function toAward(record: {
  publicatieId: string
  kenmerk: number | null
  buyer: string
  title: string
  publishedOn: string | null
  cpvCodes: string
  status: string
  format: string | null
  lots: string
  note: string | null
}): BuyerAward {
  return {
    publicatieId: record.publicatieId,
    kenmerk: record.kenmerk,
    buyer: record.buyer,
    title: record.title,
    publishedOn: record.publishedOn,
    cpvCodes: JSON.parse(record.cpvCodes || '[]') as CpvCode[],
    tendernedUrl: `https://www.tenderned.nl/aankondigingen/overzicht/${record.publicatieId}`,
    status: record.status as AwardParseStatus,
    format: (record.format as BuyerAward['format']) ?? null,
    lots: JSON.parse(record.lots || '[]') as AwardLot[],
    note: record.note,
  }
}

async function loadCached(publicatieIds: string[]): Promise<Map<string, BuyerAward>> {
  if (!publicatieIds.length) return new Map()

  if (isDatabaseConfigured()) {
    const records = await prisma.awardNotice.findMany({ where: { publicatieId: { in: publicatieIds } } })
    return new Map(records.map((record) => [record.publicatieId, toAward(record)]))
  }

  const store = await readDevStore()
  const wanted = new Set(publicatieIds)
  return new Map(
    store.awards.filter((award) => wanted.has(award.publicatieId)).map((award) => [award.publicatieId, award]),
  )
}

async function saveAwards(awards: BuyerAward[], key: string) {
  if (!awards.length) return

  if (isDatabaseConfigured()) {
    await Promise.all(
      awards.map((award) => {
        const data = {
          buyerKey: key,
          kenmerk: award.kenmerk,
          buyer: award.buyer,
          title: award.title,
          publishedOn: award.publishedOn,
          cpvCodes: JSON.stringify(award.cpvCodes),
          status: award.status,
          format: award.format,
          lots: JSON.stringify(award.lots),
          note: award.note,
        }
        return prisma.awardNotice.upsert({
          where: { publicatieId: award.publicatieId },
          create: { publicatieId: award.publicatieId, ...data },
          update: data,
        })
      }),
    )
    return
  }

  const store = await readDevStore()
  const byId = new Map(store.awards.map((award) => [award.publicatieId, award]))
  const readAt = new Date().toISOString()
  awards.forEach((award) => byId.set(award.publicatieId, { ...award, buyerKey: key, readAt }))
  store.awards = [...byId.values()]
  await writeDevStore(store)
}

// --- samenvatten ---------------------------------------------------------

/** Telt per partij hoe vaak die bij deze opdrachtgever won en verloor. */
export function summarizeWinners(awards: BuyerAward[]): BuyerWinner[] {
  const byName = new Map<string, BuyerWinner>()

  const entry = (name: string): BuyerWinner => {
    const key = buyerKey(name)
    const existing = byName.get(key)
    if (existing) return existing
    const created: BuyerWinner = { name, wins: 0, losses: 0, lastWonOn: null, titles: [] }
    byName.set(key, created)
    return created
  }

  for (const award of awards) {
    for (const lot of award.lots) {
      if (!lot.awarded) continue
      for (const name of lot.winners) {
        const winner = entry(name)
        winner.wins += 1
        if (!winner.lastWonOn || (award.publishedOn ?? '') > winner.lastWonOn) {
          winner.lastWonOn = award.publishedOn
        }
        const title = lot.title || award.title
        if (title && !winner.titles.includes(title)) winner.titles.push(title)
      }
      for (const name of lot.losers) entry(name).losses += 1
    }
  }

  return [...byName.values()].sort(
    (a, b) => b.wins - a.wins || (b.lastWonOn ?? '').localeCompare(a.lastWonOn ?? '') || a.name.localeCompare(b.name),
  )
}

/** Hoeveel partijen er bij deze opdrachtgever gemiddeld tegenover ons staan. */
export function summarizeCompetition(awards: BuyerAward[]): BuyerCompetition {
  const counts = awards
    .flatMap((award) => award.lots)
    .filter((lot) => lot.awarded && typeof lot.tenderCount === 'number')
    .map((lot) => lot.tenderCount as number)

  if (!counts.length) {
    return {
      measuredLots: 0,
      averageTenderCount: null,
      medianTenderCount: null,
      minTenderCount: null,
      maxTenderCount: null,
      singleBidderLots: 0,
    }
  }

  const total = counts.reduce((sum, count) => sum + count, 0)
  const sorted = [...counts].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2

  return {
    measuredLots: counts.length,
    averageTenderCount: Math.round((total / counts.length) * 10) / 10,
    medianTenderCount: median,
    minTenderCount: sorted[0],
    maxTenderCount: sorted[sorted.length - 1],
    singleBidderLots: counts.filter((count) => count === 1).length,
  }
}

function sinceDate(years: number): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10)
}

export async function buildBuyerHistory(request: BuyerHistoryRequest): Promise<BuyerHistory> {
  const buyer = request.buyer?.trim() ?? ''
  if (!buyer) throw new Error('Geef een opdrachtgever op.')

  const years = Math.min(Math.max(Math.round(request.years ?? DEFAULT_YEARS), 1), 15)
  const since = sinceDate(years)
  const includeVariants = request.includeVariants !== false
  // TenderNed filtert alleen op de volledige CPV-notatie met controlecijfer.
  const cpvCodes = [
    ...new Set(
      (request.cpvCodes ?? [])
        .map((code) => cpvWithCheckDigit(code))
        .filter((code): code is string => Boolean(code)),
    ),
  ]

  const { hits } = await scanBuyerAwards(buyer, cpvCodes, since, includeVariants)
  const cached = request.refresh ? new Map<string, BuyerAward>() : await loadCached(hits.map((hit) => hit.publicatieId))

  const missing = hits.filter((hit) => !cached.has(hit.publicatieId))
  const toRead = missing.slice(0, MAX_PDF_READS)

  const freshlyRead = await mapWithLimit(toRead, PDF_CONCURRENCY, async (hit): Promise<BuyerAward> => {
    const [parsed, cpv] = await Promise.all([readAwardPdf(hit), fetchAwardCpv(hit.publicatieId)])
    return {
      publicatieId: hit.publicatieId,
      kenmerk: hit.kenmerk,
      buyer: hit.buyer,
      title: hit.title,
      publishedOn: hit.publishedOn,
      cpvCodes: cpv,
      tendernedUrl: `https://www.tenderned.nl/aankondigingen/overzicht/${hit.publicatieId}`,
      ...parsed,
    }
  })

  await saveAwards(freshlyRead, buyerKey(buyer))

  const byId = new Map(freshlyRead.map((award) => [award.publicatieId, award]))
  const awards = hits
    .map((hit) => cached.get(hit.publicatieId) ?? byId.get(hit.publicatieId))
    .filter((award): award is BuyerAward => Boolean(award))

  const matchedNames = [...new Set(hits.map((hit) => hit.buyer).filter(Boolean))].sort()

  return {
    buyer,
    matchedNames,
    scannedAt: new Date().toISOString(),
    since,
    cpvCodes,
    found: hits.length,
    awards,
    winners: summarizeWinners(awards),
    competition: summarizeCompetition(awards),
    unreadCount: Math.max(0, missing.length - toRead.length),
  }
}

export async function handleBuyerHistoryRequest(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 })
    }
    const body = (await request.json().catch(() => ({}))) as BuyerHistoryRequest
    const history = await buildBuyerHistory(body)
    return Response.json({ history })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout bij het opdrachtgeversbeeld.'
    return Response.json({ error: message }, { status: 400 })
  }
}
