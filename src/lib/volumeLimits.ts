import type { TenderAnalysis, WordLimit } from '../types/tenderAnalysis'

/**
 * Omvangslimieten van één stuk: woorden, karakters én pagina's, in één model.
 *
 * "Max. 2 A4" is een harde vormeis — een stuk dat op een derde pagina uitloopt kan de
 * inschrijving ongeldig maken. Daarom rekent alles met dezelfde maat: de schrijfagent
 * (woordbudget), de werkplek (teller en rode waarschuwing), de review en de
 * indieningschecklist. Geen browser- of Node-API's, zodat client, server en tests dezelfde
 * code delen; het echte paginagetal meet measureProposalPdf (pdfExport) in de browser.
 */

export type VolumeUnit = WordLimit['unit']

export const volumeUnitLabels: Record<VolumeUnit, string> = {
  woorden: 'woorden',
  karakters: 'karakters',
  paginas: "pagina's",
}

/**
 * Paginamodel: pagina's ≈ vaste kop + zichtbare woorden / dichtheid.
 *
 * Geijkt op concepten die door de PDF-exporter zijn gehaald (zie de ijktest in
 * tests/volume.spec.ts): 400/800/1600/3200 woorden leveren 1,63/2,47/4,60/8,79 pagina's op.
 * De kop (kicker, titel, metadatablok, lead) kost een halve pagina voordat de eerste sectie
 * begint — bij een limiet van 2 A4 is dat een kwart van de ruimte en dus bepalend.
 *
 * De dichtheid loopt met de opbouw uiteen (gemeten 352–375 woorden per A4: meer secties
 * betekent meer koppen, subtitels en tabelkoppen per woord). De standaard staat daarom
 * bewust aan de behoudende kant — een stuk dat net te kort is kost punten, een stuk dat
 * uitloopt kost de inschrijving. Zodra er van dit project een concept ligt, meet de werkplek
 * de echte dichtheid en rekent de schrijfagent daarmee (zie WriteDraftRequest.layout).
 */
export const HEADER_PAGES = 0.5
/** Zichtbare woorden per volle A4 in de proposal-opmaak (koppen, alinea's, lijsten, tabellen). */
export const DEFAULT_WORDS_PER_PAGE = 340

/** Grenzen waarbinnen een gemeten dichtheid geloofwaardig is; daarbuiten geldt de standaard. */
const MIN_WORDS_PER_PAGE = 150
const MAX_WORDS_PER_PAGE = 900

/** Vanaf dit deel van de limiet is het krap: nog binnen, maar zonder speling. */
export const TIGHT_RATIO = 0.95

export function clampWordsPerPage(value: number | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return DEFAULT_WORDS_PER_PAGE
  return Math.min(MAX_WORDS_PER_PAGE, Math.max(MIN_WORDS_PER_PAGE, Math.round(value!)))
}

/**
 * Dichtheid uit een gemeten concept: hoeveel zichtbare woorden gingen er in een volle pagina,
 * de vaste kop niet meegerekend. `filledPages` is de vulling als gebroken getal (zie
 * measureProposalPdf) — met het hele paginagetal zou een half gevulde laatste pagina de
 * dichtheid stelselmatig te laag maken. Te weinig tekst om iets te kunnen zeggen → undefined.
 */
export function measureWordsPerPage(words: number, filledPages: number): number | undefined {
  const body = filledPages - HEADER_PAGES
  if (!(words > 200) || !(body > 0.5)) return undefined
  return clampWordsPerPage(words / body)
}

/** Woordbudget dat in een aantal pagina's past. */
export function wordsForPages(pages: number, wordsPerPage = DEFAULT_WORDS_PER_PAGE): number {
  return Math.max(0, Math.round((pages - HEADER_PAGES) * clampWordsPerPage(wordsPerPage)))
}

/** Geschat aantal pagina's bij een aantal woorden (gebroken getal). */
export function pagesForWords(words: number, wordsPerPage = DEFAULT_WORDS_PER_PAGE): number {
  if (words <= 0) return 0
  return HEADER_PAGES + words / clampWordsPerPage(wordsPerPage)
}

export type VolumeLimits = {
  maxWords?: number
  maxChars?: number
  maxPages?: number
}

/** Strengste maximum (kleinste max) binnen een eenheid. */
export function strictestMax(limits: WordLimit[], unit: VolumeUnit): number | undefined {
  return limits
    .filter((limit) => limit.unit === unit && limit.max)
    .reduce<number | undefined>((min, limit) => (min === undefined ? limit.max! : Math.min(min, limit.max!)), undefined)
}

export function limitsFromWordLimits(limits: WordLimit[]): VolumeLimits {
  return {
    maxWords: strictestMax(limits, 'woorden'),
    maxChars: strictestMax(limits, 'karakters'),
    maxPages: strictestMax(limits, 'paginas'),
  }
}

/** De limieten van de (op een stuk toegespitste) analyse. */
export function limitsForAnalysis(analysis: TenderAnalysis | null | undefined): VolumeLimits {
  if (!analysis) return {}
  const fromList = limitsFromWordLimits(analysis.wordLimits ?? [])
  return {
    maxWords: analysis.targetWordCount ?? fromList.maxWords,
    maxChars: analysis.targetCharCount ?? fromList.maxChars,
    maxPages: analysis.targetPageCount ?? fromList.maxPages,
  }
}

/** Gemiddelde karakters per Nederlands woord incl. spatie — voor karakter- en paginalimieten. */
export const CHARS_PER_WORD = 6.5

/**
 * Het bindende woordmaximum: het strengste van de woorden-, karakter- en paginalimiet,
 * alle drie omgerekend naar woorden. Dit is het budget waarop de schrijfagent stuurt.
 */
export function maxWordsFor(limits: VolumeLimits, wordsPerPage = DEFAULT_WORDS_PER_PAGE): number | undefined {
  const candidates: number[] = []
  if (limits.maxWords) candidates.push(limits.maxWords)
  if (limits.maxChars) candidates.push(Math.floor(limits.maxChars / CHARS_PER_WORD))
  if (limits.maxPages) candidates.push(wordsForPages(limits.maxPages, wordsPerPage))
  return candidates.length ? Math.max(1, Math.min(...candidates)) : undefined
}

/** Zichtbare woorden in het concept (HTML-tags tellen niet mee). */
export function countWords(html: string): number {
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return plain ? plain.split(' ').length : 0
}

/** Zichtbare karakters in het concept. */
export function countCharacters(html: string): number {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length
}

export type VolumeLevel = 'ok' | 'krap' | 'over'

export type VolumeCounts = {
  words: number
  chars: number
  /** Gemeten pagina's (measureProposalPdf); ontbreekt zolang de PDF niet is doorgerekend. */
  pages?: number
}

export type VolumeCheck = {
  unit: VolumeUnit
  used: number
  max: number
  /** Verbruikt deel van de limiet; > 1 is een overschrijding. */
  ratio: number
  level: VolumeLevel
  /** "2.310 / 2.000 woorden". */
  label: string
  /** true als het paginagetal is geschat in plaats van gemeten. */
  estimated: boolean
}

/** Het aantal A4 dat de export aflevert; een uitloop van niets telt niet mee, leeg is nul. */
export function printedPages(pages: number): number {
  if (pages <= 0) return 0
  return Math.max(1, Math.ceil(pages - 0.02))
}

/** Pagina's tellen als hele A4 — een stuk dat één regel uitloopt beslaat toch een pagina extra. */
function formatCount(value: number, unit: VolumeUnit): string {
  return (unit === 'paginas' ? printedPages(value) : Math.round(value)).toLocaleString('nl-NL')
}

function levelFor(unit: VolumeUnit, used: number, max: number): VolumeLevel {
  if (unit === 'paginas' ? printedPages(used) > max : used > max) return 'over'
  return used >= max * TIGHT_RATIO ? 'krap' : 'ok'
}

/**
 * Toets het concept aan elke gestelde limiet. Zonder gemeten paginagetal wordt het
 * aantal pagina's geschat uit de woorden; dat staat als `estimated` in het resultaat,
 * zodat het scherm geen zekerheid suggereert die er niet is.
 */
export function checkVolume(
  counts: VolumeCounts,
  limits: VolumeLimits,
  wordsPerPage = DEFAULT_WORDS_PER_PAGE,
): VolumeCheck[] {
  const checks: VolumeCheck[] = []

  const add = (unit: VolumeUnit, used: number, max: number | undefined, estimated = false) => {
    if (!max) return
    checks.push({
      unit,
      used,
      max,
      ratio: used / max,
      level: levelFor(unit, used, max),
      label: `${formatCount(used, unit)} / ${Math.round(max).toLocaleString('nl-NL')} ${volumeUnitLabels[unit]}`,
      estimated,
    })
  }

  add('woorden', counts.words, limits.maxWords)
  add('karakters', counts.chars, limits.maxChars)
  if (limits.maxPages) {
    const measured = counts.pages !== undefined
    add('paginas', measured ? counts.pages! : pagesForWords(counts.words, wordsPerPage), limits.maxPages, !measured)
  }

  return checks
}

export function volumeLevel(checks: VolumeCheck[]): VolumeLevel {
  if (checks.some((check) => check.level === 'over')) return 'over'
  if (checks.some((check) => check.level === 'krap')) return 'krap'
  return 'ok'
}

/** "2.310 / 2.000 woorden · 3 / 2 pagina's" — alleen de overschreden limieten. */
export function overLimitSummary(checks: VolumeCheck[]): string | null {
  const over = checks.filter((check) => check.level === 'over')
  if (!over.length) return null
  return over.map((check) => `${check.label}${check.estimated ? ' (geschat)' : ''}`).join(' · ')
}

/** Korte weergave van alle limieten van een stuk: "max. 3.500 woorden · max. 2 pagina's". */
export function formatLimits(limits: VolumeLimits): string {
  const parts: string[] = []
  if (limits.maxWords) parts.push(`max. ${limits.maxWords.toLocaleString('nl-NL')} woorden`)
  if (limits.maxChars) parts.push(`max. ${limits.maxChars.toLocaleString('nl-NL')} karakters`)
  if (limits.maxPages) parts.push(`max. ${limits.maxPages} ${limits.maxPages === 1 ? 'pagina' : "pagina's"}`)
  return parts.join(' · ')
}
