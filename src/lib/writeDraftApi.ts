import { getApiConfig, isWriterConfigured } from './apiConfig'
import type {
  WriteDraftError,
  WriteDraftJobSnapshot,
  WriteDraftJobStart,
  WriteDraftRequest,
  WriteDraftResponse,
} from '../types/writeDraft'
import { usageHeaders } from './usageScope'

/*
 * Het schrijven van een stuk is een opdracht op de server, geen browserverbinding.
 * De werkplek start de opdracht, bewaart het opdracht-id bij het stuk en volgt de
 * voortgang met korte statusverzoeken. Sluit het tabblad of valt de verbinding weg,
 * dan schrijft de server door; bij terugkomst wordt de opdracht weer opgepakt
 * (zie followDraftJob) en staat het resultaat klaar.
 */

/** Tijd tussen twee statusverzoeken; op een achtergrondtabblad rustiger. */
const POLL_MS = 1_500
const POLL_HIDDEN_MS = 5_000
/** Zoveel mislukte statusverzoeken op rij (± 1 minuut) gelden als "verbinding kwijt". */
const MAX_POLL_FAILURES = 20

export type WriterStatus = {
  available: boolean
  provider: WriteDraftResponse['provider'] | null
  model: string | null
}

export type FollowJobHandlers = {
  onProgress?: (accumulated: string) => void
  onStatus?: (message: string) => void
  /** Stop met volgen; de opdracht zelf loopt op de server gewoon door. */
  signal?: AbortSignal
}

/** De opdracht bestaat niet meer op de server (opgeruimd of database geleegd). */
export class DraftJobLost extends Error {
  constructor() {
    super('De schrijfopdracht is niet meer bij de server bekend.')
    this.name = 'DraftJobLost'
  }
}

/** De server is even niet bereikbaar; de opdracht draait door en kan later worden opgepakt. */
export class DraftJobDisconnected extends Error {
  constructor(readonly jobId: string) {
    super('Geen verbinding met de server. De schrijfagent gaat door; het stuk staat er zodra je terug bent.')
    this.name = 'DraftJobDisconnected'
  }
}

/** Het volgen is bewust gestopt (ander stuk geopend, pagina verlaten). */
export class DraftJobUnwatched extends Error {
  constructor(readonly jobId: string) {
    super('Het volgen van de schrijfopdracht is gestopt.')
    this.name = 'DraftJobUnwatched'
  }
}

function buildPayload(
  request: Omit<WriteDraftRequest, 'ai' | 'stream'>,
  job: WriteDraftJobStart,
): WriteDraftRequest & WriteDraftJobStart {
  const payload = { ...request, ...job } as WriteDraftRequest & WriteDraftJobStart
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
  return payload
}

export function isNoAiConfigError(message: string): boolean {
  return message.toLowerCase().includes('geen ai-configuratie')
}

export async function fetchWriterStatus(): Promise<WriterStatus> {
  try {
    const response = await fetch('/api/writer-status')
    if (!response.ok) return { available: false, provider: null, model: null }
    return (await response.json()) as WriterStatus
  } catch {
    return { available: false, provider: null, model: null }
  }
}

/** Start een schrijfopdracht op de server en geef de eerste momentopname terug. */
export async function startDraftJob(
  request: Omit<WriteDraftRequest, 'ai' | 'stream'>,
  job: WriteDraftJobStart,
): Promise<WriteDraftJobSnapshot> {
  const response = await fetch('/api/write-draft/job', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Het schrijfwerk is verreweg de duurste taak; het stuk waar het bij hoort staat
      // hier expliciet in de opdracht en gaat vóór de open werkplek.
      ...usageHeaders({ projectId: job.projectId, draftId: job.draftId, draftTitle: job.draftTitle }),
    },
    body: JSON.stringify(buildPayload(request, job)),
  })

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const data = (await response.json()) as WriteDraftError
      throw new Error(data.error || 'Starten van de schrijfagent mislukt.')
    }
    const detail = (await response.text()).trim()
    throw new Error(detail || 'Starten van de schrijfagent mislukt.')
  }

  return (await response.json()) as WriteDraftJobSnapshot
}

async function fetchJobSnapshot(jobId: string, since: number, signal?: AbortSignal): Promise<WriteDraftJobSnapshot> {
  const response = await fetch(`/api/write-draft/job?id=${encodeURIComponent(jobId)}&since=${since}`, {
    cache: 'no-store',
    signal,
  })
  if (response.status === 404) throw new DraftJobLost()
  if (!response.ok) throw new Error(`Status van de schrijfopdracht opvragen mislukt (HTTP ${response.status}).`)
  return (await response.json()) as WriteDraftJobSnapshot
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms)
    function finish() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', finish)
      resolve()
    }
    signal?.addEventListener('abort', finish, { once: true })
  })
}

/**
 * Volg een lopende opdracht tot het stuk klaar is. Gebruikt bij het starten én bij het
 * terugkeren in een nieuwe sessie: het opdracht-id staat bij het stuk in de werkruimte.
 * Een korte storing wordt uitgezeten; blijft de server onbereikbaar, dan stopt het volgen
 * met DraftJobDisconnected — de opdracht zelf loopt door.
 */
export async function followDraftJob(
  jobId: string,
  handlers: FollowJobHandlers = {},
): Promise<WriteDraftResponse> {
  const { onProgress, onStatus, signal } = handlers
  let since = 0
  let failures = 0
  let lastMessage = ''

  while (true) {
    if (signal?.aborted) throw new DraftJobUnwatched(jobId)

    let snapshot: WriteDraftJobSnapshot | null = null
    try {
      snapshot = await fetchJobSnapshot(jobId, since, signal)
      failures = 0
    } catch (error) {
      if (error instanceof DraftJobLost) throw error
      if (signal?.aborted) throw new DraftJobUnwatched(jobId)
      failures += 1
      if (failures >= MAX_POLL_FAILURES) throw new DraftJobDisconnected(jobId)
    }

    if (snapshot) {
      since = snapshot.version
      if (snapshot.partialHtml) onProgress?.(snapshot.partialHtml)
      if (snapshot.message && snapshot.message !== lastMessage) {
        lastMessage = snapshot.message
        onStatus?.(snapshot.message)
      }
      if (snapshot.status === 'gereed' && snapshot.html) {
        return {
          html: snapshot.html,
          model: snapshot.model ?? '',
          provider: (snapshot.provider ?? 'anthropic') as WriteDraftResponse['provider'],
        }
      }
      if (snapshot.status === 'mislukt') {
        throw new Error(snapshot.error || snapshot.message || 'Genereren mislukt.')
      }
    }

    const hidden = typeof document !== 'undefined' && document.hidden
    await wait(hidden ? POLL_HIDDEN_MS : POLL_MS, signal)
  }
}

export type GenerateDraftOptions = FollowJobHandlers & {
  /** Waar het resultaat hoort; hiermee vindt een volgende sessie de opdracht terug. */
  job: WriteDraftJobStart
  /** Zodra de opdracht op de server staat: bewaar het id bij het stuk. */
  onStarted?: (snapshot: WriteDraftJobSnapshot) => void
}

/**
 * Start de schrijfagent en wacht op het resultaat. Het wachten is niet meer dan volgen:
 * mislukt het volgen, dan blijft de opdracht op de server staan en pikt de werkplek hem
 * later weer op.
 */
export async function generateDraftViaApi(
  request: Omit<WriteDraftRequest, 'ai' | 'stream'>,
  options: GenerateDraftOptions,
): Promise<WriteDraftResponse> {
  const snapshot = await startDraftJob(request, options.job)
  options.onStarted?.(snapshot)
  if (snapshot.message) options.onStatus?.(snapshot.message)
  return followDraftJob(snapshot.id, options)
}
