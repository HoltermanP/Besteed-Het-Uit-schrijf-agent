import { loadStored, removeStored, saveStored } from './storage'
import { cpvWithCheckDigit } from './cpv'
import { searchCompanyRelevantPublications } from './tenderNedApi'
import type { TenderListItem, TenderPreselection, TenderSortKey } from '../types/tenderNed'
import type { StoredTenderScore } from '../types/tenderScore'

// Voorselectie van tenders, per bedrijf bewaard in de werkruimte-opslag (Neon
// via /api/state). Volgorde van de voorselectie:
//   1. CPV-scan  — puur op de bedrijfs-CPV-codes, zonder AI (deze module)
//   2. AI-score  — alleen over de lijst uit stap 1 (tenderScoreApi)
// Beide stappen slaan hun resultaat op, zodat terugkeren naar de pagina of
// bladeren door de lijst direct werkt zonder opnieuw ophalen of scoren.

const STORAGE_KEY = 'bid-agent-tender-preselection'

/** Bovengrens van de voorselectie; voorkomt dat één scan honderden detail-calls en AI-batches kost. */
export const PRESELECTION_MAX_ITEMS = 200

// De opdrachtomschrijving kan vele kilobytes zijn; voor de lijst, de AI-score
// (die zelf op 900 tekens afkapt) en de opslag is een ingekorte versie genoeg.
const MAX_STORED_DESCRIPTION = 1_200

function compactItem(item: TenderListItem): TenderListItem {
  const beschrijving = item.opdrachtBeschrijving ?? ''
  return {
    ...item,
    opdrachtBeschrijving:
      beschrijving.length > MAX_STORED_DESCRIPTION ? `${beschrijving.slice(0, MAX_STORED_DESCRIPTION)}…` : beschrijving,
  }
}

export function getTenderPreselection(): TenderPreselection | null {
  const stored = loadStored<TenderPreselection | null>(STORAGE_KEY, null)
  if (!stored || !Array.isArray(stored.items)) return null
  return stored
}

export function saveTenderPreselection(preselection: TenderPreselection) {
  saveStored(STORAGE_KEY, preselection)
}

export function clearTenderPreselection() {
  removeStored(STORAGE_KEY)
}

/** Genormaliseerde set bedrijfscodes (volledige notatie), om te zien of de scan nog bij de configuratie past. */
export function normalizedCompanyCpv(companyCodes: Array<{ code: string }>): string[] {
  return [...new Set(companyCodes.map((cpv) => cpvWithCheckDigit(cpv.code)).filter((code): code is string => Boolean(code)))].sort()
}

/** True als de opgeslagen voorselectie met andere CPV-codes is gemaakt dan nu geconfigureerd. */
export function preselectionIsStale(
  preselection: TenderPreselection | null,
  companyCodes: Array<{ code: string }>,
): boolean {
  if (!preselection) return false
  const current = normalizedCompanyCpv(companyCodes)
  const stored = [...preselection.cpvCodes].sort()
  return current.length !== stored.length || current.some((code, index) => code !== stored[index])
}

export type PreselectionProgress = { phase: 'lijst' | 'cpv'; done: number; total: number }

/**
 * Stap 1: CPV-scan. Haalt de open tenders binnen de bedrijfs-CPV-codes op en
 * slaat de lijst op. Al bekende items behouden hun eerder bijgeladen CPV-codes,
 * zodat een verversing geen detail-calls herhaalt.
 */
export async function runCpvPreselection(
  companyCodes: Array<{ code: string }>,
  options: { onlyOpen?: boolean; maxItems?: number; onProgress?: (progress: PreselectionProgress) => void } = {},
): Promise<TenderPreselection> {
  const codes = normalizedCompanyCpv(companyCodes)
  if (!codes.length) {
    throw new Error('Stel eerst CPV-codes in bij Configuratie → CPV-codes voordat de voorselectie kan draaien.')
  }

  const result = await searchCompanyRelevantPublications(companyCodes, {
    onlyOpen: options.onlyOpen ?? true,
    maxItems: options.maxItems ?? PRESELECTION_MAX_ITEMS,
    onProgress: options.onProgress,
  })

  const preselection: TenderPreselection = {
    scannedAt: new Date().toISOString(),
    cpvCodes: codes,
    totalMatches: result.totalElements,
    onlyOpen: options.onlyOpen ?? true,
    items: result.items.map(compactItem),
  }
  saveTenderPreselection(preselection)
  return preselection
}

/** Werkt losse items (bijv. na CPV-bijladen) bij in de opgeslagen voorselectie. */
export function updatePreselectionItems(updated: TenderListItem[]) {
  const current = getTenderPreselection()
  if (!current) return
  const byId = new Map(updated.map((item) => [item.publicatieId, item]))
  saveTenderPreselection({
    ...current,
    items: current.items.map((item) => byId.get(item.publicatieId) ?? item),
  })
}

function dateValue(value: string | undefined): number {
  if (!value) return Number.NaN
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? Number.NaN : time
}

/** Vergelijker die lege waarden (NaN) altijd achteraan zet, ongeacht richting. */
function compareNumbers(a: number, b: number, direction: 'asc' | 'desc'): number {
  const aMissing = Number.isNaN(a)
  const bMissing = Number.isNaN(b)
  if (aMissing && bMissing) return 0
  if (aMissing) return 1
  if (bMissing) return -1
  return direction === 'desc' ? b - a : a - b
}

export const TENDER_SORT_OPTIONS: Array<{ key: TenderSortKey; label: string }> = [
  { key: 'score', label: 'AI-score (hoog → laag)' },
  { key: 'publicatieDatum', label: 'Publicatiedatum (nieuw → oud)' },
  { key: 'sluitingsDatum', label: 'Sluitingsdatum (eerst sluitend bovenaan)' },
  { key: 'aanbestedingNaam', label: 'Naam (A → Z)' },
  { key: 'opdrachtgeverNaam', label: 'Opdrachtgever (A → Z)' },
]

/**
 * Sorteert tenders op de gekozen sleutel. Bij score komen ongescoorde tenders
 * achteraan; gelijke waarden vallen terug op publicatiedatum (nieuwste eerst).
 */
export function sortTenders(
  items: TenderListItem[],
  sortKey: TenderSortKey,
  scores: Record<string, StoredTenderScore | undefined>,
): TenderListItem[] {
  const byPublication = (a: TenderListItem, b: TenderListItem) =>
    compareNumbers(dateValue(a.publicatieDatum), dateValue(b.publicatieDatum), 'desc')

  const sorted = [...items]
  switch (sortKey) {
    case 'score':
      sorted.sort((a, b) => {
        const scoreA = scores[a.publicatieId]?.score ?? Number.NaN
        const scoreB = scores[b.publicatieId]?.score ?? Number.NaN
        return compareNumbers(scoreA, scoreB, 'desc') || byPublication(a, b)
      })
      break
    case 'publicatieDatum':
      sorted.sort((a, b) => byPublication(a, b) || a.aanbestedingNaam.localeCompare(b.aanbestedingNaam, 'nl'))
      break
    case 'sluitingsDatum':
      sorted.sort(
        (a, b) => compareNumbers(dateValue(a.sluitingsDatum), dateValue(b.sluitingsDatum), 'asc') || byPublication(a, b),
      )
      break
    case 'aanbestedingNaam':
      sorted.sort((a, b) => a.aanbestedingNaam.localeCompare(b.aanbestedingNaam, 'nl') || byPublication(a, b))
      break
    case 'opdrachtgeverNaam':
      sorted.sort((a, b) => a.opdrachtgeverNaam.localeCompare(b.opdrachtgeverNaam, 'nl') || byPublication(a, b))
      break
  }
  return sorted
}
