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
import { usageHeaders } from './usageScope'

const STORAGE_KEY = 'bid-agent-tender-scores'
// Batchgrootte gelijk aan het servermaximum: minder aanroepen betekent minder
// herhaalde (gecachte) bedrijfsprofiel-tokens en minder overhead per tender.
const BATCH_SIZE = 20
// Parallelle batches ná de eerste: de eerste batch schrijft de prompt-cache van
// het bedrijfsprofiel; de volgende lezen die uit cache (~10% van de inputprijs).
const PARALLEL_BATCHES = 3
const MAX_COMPANY_CHARS = 8_000

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
    typePublicatie: item.typePublicatie,
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
    headers: { 'Content-Type': 'application/json', ...usageHeaders() },
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
  let done = fromCache

  const batches: TenderListItem[][] = []
  for (let index = 0; index < pending.length; index += BATCH_SIZE) {
    batches.push(pending.slice(index, index + BATCH_SIZE))
  }

  const runBatch = async (batch: TenderListItem[]) => {
    const result = await scoreBatch(companyText, batch.map(toScoreInput))
    const returned = new Set<string>()
    for (const score of result.scores) {
      stored[score.publicatieId] = { ...score, scoredAt, profileStamp: stamp }
      returned.add(score.publicatieId)
      scored += 1
    }
    failed += batch.filter((item) => !returned.has(item.publicatieId)).length
    persistScores(stored)
    done += batch.length
    options.onProgress?.({ done, total: items.length, fromCache })
  }

  // Eerste batch apart: een fout hier (ontbrekende API-key, profiel) meteen
  // doorgeven, en de prompt-cache van het bedrijfsprofiel is daarna warm voor
  // de parallelle vervolgbatches.
  const [first, ...rest] = batches
  await runBatch(first)

  let cursor = 0
  const workers = Array.from({ length: Math.min(PARALLEL_BATCHES, rest.length) }, async () => {
    while (cursor < rest.length) {
      const batch = rest[cursor++]
      try {
        await runBatch(batch)
      } catch (error) {
        failed += batch.length
        done += batch.length
        options.onProgress?.({ done, total: items.length, fromCache })
        console.warn('Tenderbatch scoren mislukt; volgende batch wordt geprobeerd.', error)
      }
    }
  })
  await Promise.all(workers)

  return { scores: stored, scored, fromCache, failed }
}
