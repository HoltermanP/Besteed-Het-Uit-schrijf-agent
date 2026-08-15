import { getApiConfig, isWriterConfigured } from './apiConfig'
import { companyConfigToSourceDocuments, getCompanyConfig, isCompanyConfigured } from './companyConfig'
import { loadStored, saveStored } from './storage'
import type { TenderListItem } from '../types/tenderNed'
import type {
  StoredTenderScore,
  TenderScoreError,
  TenderScoreInput,
  TenderScoreRequest,
  TenderScoreResponse,
} from '../types/tenderScore'

const STORAGE_KEY = 'bid-agent-tender-scores'
const BATCH_SIZE = 10
const MAX_COMPANY_CHARS = 12_000

export type ScoreProgress = {
  done: number
  total: number
  fromCache: number
}

export type ScoreSelectionResult = {
  scores: Record<string, StoredTenderScore>
  scored: number
  fromCache: number
  failed: number
}

export function getTenderScores(): Record<string, StoredTenderScore> {
  return loadStored<Record<string, StoredTenderScore>>(STORAGE_KEY, {})
}

function persistScores(scores: Record<string, StoredTenderScore>) {
  saveStored(STORAGE_KEY, scores)
}

/** Stempel van het bedrijfsprofiel; verandert het profiel, dan vervallen gecachte scores. */
export function currentProfileStamp(): string {
  return getCompanyConfig().updatedAt || 'ongewijzigd'
}

function buildCompanyText(): string {
  const docs = companyConfigToSourceDocuments()
  const text = docs.map((doc) => doc.content).join('\n\n')
  if (text.length <= MAX_COMPANY_CHARS) return text
  return `${text.slice(0, MAX_COMPANY_CHARS)}\n\n[tekst ingekort]`
}

function toScoreInput(item: TenderListItem): TenderScoreInput {
  return {
    publicatieId: item.publicatieId,
    aanbestedingNaam: item.aanbestedingNaam,
    opdrachtgeverNaam: item.opdrachtgeverNaam,
    opdrachtBeschrijving: item.opdrachtBeschrijving,
    cpvCodes: item.cpvCodes?.map((cpv) => ({ code: cpv.code, omschrijving: cpv.omschrijving })),
    typeOpdracht: item.typeOpdracht,
    procedure: item.procedure,
  }
}

async function readApiJson<T>(response: Response): Promise<T | TenderScoreError> {
  const raw = await response.text()
  if (!raw.trim()) {
    return { error: 'Lege serverrespons ontvangen.' }
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    const preview = raw.replace(/\s+/g, ' ').trim().slice(0, 180)
    return {
      error: preview.startsWith('{')
        ? 'Ongeldige serverrespons ontvangen.'
        : preview || 'Scoren van tenders mislukt.',
    }
  }
}

async function scoreBatch(companyText: string, batch: TenderScoreInput[]): Promise<TenderScoreResponse> {
  const payload: TenderScoreRequest = { companyText, tenders: batch }

  const apiConfig = getApiConfig()
  if (isWriterConfigured(apiConfig)) {
    payload.ai = {
      provider: apiConfig.writer.provider,
      baseUrl: apiConfig.writer.baseUrl,
      apiKey: apiConfig.writer.apiKey,
      model: apiConfig.writer.model,
      testMode: apiConfig.testMode || undefined,
    }
  }

  const response = await fetch('/api/score-tenders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await readApiJson<TenderScoreResponse>(response)
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'Scoren van tenders mislukt.')
  }
  return data
}

/**
 * Scoort de aangeleverde tenders tegen het actieve bedrijfsprofiel (0-100).
 * Tenders die al gescoord zijn onder hetzelfde profiel komen uit de cache;
 * de rest gaat in batches naar de AI. Resultaten worden per bedrijf bewaard.
 */
export async function scoreTendersForCompany(
  items: TenderListItem[],
  options: { force?: boolean; onProgress?: (progress: ScoreProgress) => void } = {},
): Promise<ScoreSelectionResult> {
  if (!isCompanyConfigured()) {
    throw new Error('Vul eerst het bedrijfsprofiel in (via Configuratie) voordat AI tenders kan scoren.')
  }

  const stamp = currentProfileStamp()
  const stored = getTenderScores()
  const pending: TenderListItem[] = []
  let fromCache = 0

  for (const item of items) {
    const cached = stored[item.publicatieId]
    if (!options.force && cached && cached.profileStamp === stamp) {
      fromCache += 1
    } else {
      pending.push(item)
    }
  }

  options.onProgress?.({ done: fromCache, total: items.length, fromCache })

  if (!pending.length) {
    return { scores: stored, scored: 0, fromCache, failed: 0 }
  }

  const companyText = buildCompanyText()
  const scoredAt = new Date().toISOString()
  let scored = 0
  let failed = 0

  for (let index = 0; index < pending.length; index += BATCH_SIZE) {
    const batch = pending.slice(index, index + BATCH_SIZE)
    try {
      const result = await scoreBatch(companyText, batch.map(toScoreInput))
      const returned = new Set<string>()
      for (const score of result.scores) {
        stored[score.publicatieId] = { ...score, scoredAt, profileStamp: stamp }
        returned.add(score.publicatieId)
        scored += 1
      }
      failed += batch.filter((item) => !returned.has(item.publicatieId)).length
      persistScores(stored)
    } catch (error) {
      failed += batch.length
      // Eerste batchfout meteen doorgeven als er nog niets gelukt is (bijv.
      // ontbrekend profiel of API-key); anders doorgaan met de rest.
      if (!scored && index === 0) throw error
      console.warn('Tenderbatch scoren mislukt; volgende batch wordt geprobeerd.', error)
    }
    options.onProgress?.({ done: fromCache + Math.min(index + BATCH_SIZE, pending.length), total: items.length, fromCache })
  }

  return { scores: stored, scored, fromCache, failed }
}
