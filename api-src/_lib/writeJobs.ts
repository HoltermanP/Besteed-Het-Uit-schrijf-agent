import { randomUUID } from 'node:crypto'
import { prisma, isDatabaseConfigured } from './prisma'
import { resolveAiFromRequest, type AiRuntimeConfig } from './aiClient'
import {
  assembleFromCheckpoint,
  checkpointComplete,
  writeDraftInParts,
  WriteRunInterrupted,
  type DraftCheckpoint,
} from './writeDraft'
import type { WriteDraftJobSnapshot, WriteDraftRequest } from '../../src/types/writeDraft'

/*
 * De schrijfagent als ACHTERGRONDOPDRACHT.
 *
 * Een stuk van duizenden woorden schrijven duurt minuten. Liep dat in de HTTP-request van
 * de browser, dan verdween het werk zodra de verbinding wegviel of het tabblad sloot.
 * Daarom: de browser start een opdracht en krijgt direct een id terug; het schrijven draait
 * op de server en legt voortgang, checkpoint en resultaat vast in de database. De browser
 * volgt de opdracht met korte pollverzoeken en kan dat op elk moment (of op een ander
 * apparaat) hervatten — het resultaat staat er ook als niemand keek.
 *
 * Een serverfunctie heeft zelf ook een tijdslimiet (maxDuration). Loopt een opdracht daar
 * tegenaan, dan bewaart de run zijn checkpoint (opzet + geschreven secties), geeft de
 * opdracht vrij en start een verse run die verdergaat waar de vorige stopte.
 */

/** Tijd die één run maximaal neemt; ruim onder de maxDuration van de route (300 s). */
const RUN_BUDGET_MS = 240_000
/** Zonder teken van leven binnen deze tijd geldt een lopende opdracht als gestrand. */
const STALE_MS = 90_000
/** Noodrem tegen eindeloos hervatten; daarna wordt opgeleverd wat er ligt. */
const MAX_RUNS = 8
const HEARTBEAT_MS = 20_000
/** Minimale tijd tussen twee voortgangsschrijvingen naar de database. */
const PERSIST_MS = 3_000
/** Afgeronde opdrachten opruimen; de opdracht bevat de volledige (vertrouwelijke) invoer. */
const RETENTION_MS = 7 * 24 * 60 * 60 * 1_000
const HARD_RETENTION_MS = 14 * 24 * 60 * 60 * 1_000

export type WriteJobStatus = 'lopend' | 'gereed' | 'mislukt'

export type WriteJobRecord = {
  id: string
  projectId: string
  draftId: string
  draftTitle: string
  stage: string
  kind: string
  status: WriteJobStatus
  message: string
  request: string
  checkpoint: string | null
  partialHtml: string | null
  resultHtml: string | null
  error: string | null
  provider: string | null
  model: string | null
  version: number
  runs: number
  origin: string | null
  heartbeatAt: Date
  createdAt: Date
  finishedAt: Date | null
  updatedAt: Date
}

type JobPatch = Partial<Omit<WriteJobRecord, 'id' | 'createdAt' | 'updatedAt'>>

// ── Opslag ───────────────────────────────────────────────────────────────────
// Zonder DATABASE_URL (of met STATE_MEMORY=1, zoals in de Playwright-tests) draait een
// in-memory store, net als bij appState en styleDocuments.

const globalForJobs = globalThis as typeof globalThis & {
  writeJobMemory?: Map<string, WriteJobRecord>
}

function isMemoryStore() {
  return process.env.STATE_MEMORY === '1' || !isDatabaseConfigured()
}

function memoryStore(): Map<string, WriteJobRecord> {
  globalForJobs.writeJobMemory ??= new Map()
  return globalForJobs.writeJobMemory
}

export async function readWriteJob(id: string): Promise<WriteJobRecord | null> {
  if (!id) return null
  if (isMemoryStore()) return memoryStore().get(id) ?? null
  const row = await prisma.writeJob.findUnique({ where: { id } })
  return (row as WriteJobRecord | null) ?? null
}

async function updateJob(id: string, patch: JobPatch): Promise<void> {
  if (isMemoryStore()) {
    const current = memoryStore().get(id)
    if (current) memoryStore().set(id, { ...current, ...patch, updatedAt: new Date() })
    return
  }
  // Een verdwenen opdracht (opgeruimd, database geleegd) mag de run niet laten klappen.
  await prisma.writeJob.update({ where: { id }, data: patch }).catch((error: unknown) => {
    console.warn('[schrijfagent] voortgang bewaren mislukt:', error instanceof Error ? error.message : error)
  })
}

/** Verwijder afgeronde en volledig verlopen opdrachten (best effort, bij het aanmaken). */
async function purgeOldWriteJobs(): Promise<void> {
  const now = Date.now()
  const finishedBefore = new Date(now - RETENTION_MS)
  const createdBefore = new Date(now - HARD_RETENTION_MS)
  if (isMemoryStore()) {
    for (const [id, job] of memoryStore()) {
      const expired = job.finishedAt ? job.finishedAt < finishedBefore : job.createdAt < createdBefore
      if (expired) memoryStore().delete(id)
    }
    return
  }
  await prisma.writeJob
    .deleteMany({
      where: {
        OR: [{ finishedAt: { lt: finishedBefore } }, { createdAt: { lt: createdBefore } }],
      },
    })
    .catch(() => undefined)
}

export function isJobStale(job: WriteJobRecord): boolean {
  return Date.now() - job.heartbeatAt.getTime() > STALE_MS
}

export async function createWriteJob(input: {
  request: WriteDraftRequest
  projectId: string
  draftId: string
  draftTitle: string
  kind: string
  origin: string | null
}): Promise<WriteJobRecord> {
  const now = new Date()
  const job: WriteJobRecord = {
    id: randomUUID(),
    projectId: input.projectId,
    draftId: input.draftId,
    draftTitle: input.draftTitle,
    stage: input.request.stage,
    kind: input.kind,
    status: 'lopend',
    message: 'De schrijfagent is gestart…',
    request: JSON.stringify(input.request),
    checkpoint: null,
    partialHtml: null,
    resultHtml: null,
    error: null,
    provider: null,
    model: null,
    version: 1,
    runs: 0,
    origin: input.origin,
    heartbeatAt: now,
    createdAt: now,
    finishedAt: null,
    updatedAt: now,
  }

  await purgeOldWriteJobs()

  if (isMemoryStore()) {
    memoryStore().set(job.id, job)
    return job
  }
  const { updatedAt: _updatedAt, ...data } = job
  await prisma.writeJob.create({ data })
  return job
}

/**
 * Neem een opdracht over voor deze run. Draait er al een run (recent teken van leven),
 * dan gebeurt er niets — zo verdubbelt een dubbele poll of resume-aanroep het werk niet.
 */
async function claimWriteJob(id: string): Promise<WriteJobRecord | null> {
  const job = await readWriteJob(id)
  if (!job || job.status !== 'lopend') return null
  if (job.runs > 0 && !isJobStale(job)) return null

  const now = new Date()
  if (isMemoryStore()) {
    const current = memoryStore().get(id)
    if (!current || current.heartbeatAt.getTime() !== job.heartbeatAt.getTime()) return null
    const claimed: WriteJobRecord = { ...current, runs: current.runs + 1, heartbeatAt: now, updatedAt: now }
    memoryStore().set(id, claimed)
    return claimed
  }
  // Optimistisch slot: alleen als de hartslag nog dezelfde is als bij het lezen.
  const result = await prisma.writeJob.updateMany({
    where: { id, status: 'lopend', heartbeatAt: job.heartbeatAt },
    data: { runs: { increment: 1 }, heartbeatAt: now },
  })
  if (!result.count) return null
  return { ...job, runs: job.runs + 1, heartbeatAt: now }
}

function parseCheckpoint(raw: string | null): DraftCheckpoint {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as DraftCheckpoint
  } catch {
    return {}
  }
}

/** Start een verse serverbeurt voor een opdracht die nog niet af is. */
async function triggerContinuation(job: WriteJobRecord): Promise<void> {
  const origin = job.origin ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  // Zonder bekende oorsprong hervat de opdracht bij het eerstvolgende statusverzoek
  // van de client (die controleert op gestrande opdrachten).
  if (!origin) return
  try {
    await fetch(`${origin}/api/write-draft/job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume: job.id }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    console.warn('[schrijfagent] hervatten aanroepen mislukt:', error instanceof Error ? error.message : error)
  }
}

/**
 * Schrijf het stuk voor deze opdracht. Keert terug zodra deze beurt klaar is: de opdracht
 * is dan gereed, mislukt, óf vrijgegeven voor een vervolgbeurt die zelf is aangevraagd.
 */
export async function runWriteJob(id: string): Promise<void> {
  const job = await claimWriteJob(id)
  if (!job) return

  const deadline = Date.now() + RUN_BUDGET_MS
  let request: WriteDraftRequest
  try {
    request = JSON.parse(job.request) as WriteDraftRequest
  } catch {
    await updateJob(id, {
      status: 'mislukt',
      message: 'De opdracht kon niet worden gelezen.',
      error: 'De opdracht kon niet worden gelezen.',
      version: job.version + 1,
      finishedAt: new Date(),
    })
    return
  }

  let ai: AiRuntimeConfig
  try {
    ai = resolveAiFromRequest(request.ai as AiRuntimeConfig | undefined, 'WRITER_MODEL')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Geen AI-configuratie beschikbaar.'
    await updateJob(id, {
      status: 'mislukt',
      message,
      error: message,
      version: job.version + 1,
      finishedAt: new Date(),
    })
    return
  }

  let checkpoint = parseCheckpoint(job.checkpoint)
  let message = job.message
  let partialHtml = job.partialHtml
  let version = job.version
  let checkpointDirty = false
  let lastPersist = 0
  // Schrijfacties netjes achter elkaar, zodat een trage database geen oude staat terugzet.
  let queue: Promise<void> = Promise.resolve()

  const flush = (force = false) => {
    const now = Date.now()
    if (!force && now - lastPersist < PERSIST_MS) return
    lastPersist = now
    version += 1
    const patch: JobPatch = { message, partialHtml, version, heartbeatAt: new Date() }
    if (checkpointDirty) {
      patch.checkpoint = JSON.stringify(checkpoint)
      checkpointDirty = false
    }
    // Een mislukte schrijfactie mag de keten niet breken; de volgende poging pakt hem op.
    queue = queue.then(() => updateJob(id, patch)).catch(() => undefined)
  }

  const heartbeat = setInterval(() => {
    queue = queue.then(() => updateJob(id, { heartbeatAt: new Date() })).catch(() => undefined)
  }, HEARTBEAT_MS)

  try {
    const html = await writeDraftInParts(
      ai,
      request,
      (payload) => {
        if (payload.type === 'status' && typeof payload.message === 'string') message = payload.message
        if (payload.type === 'delta' && typeof payload.accumulated === 'string') {
          partialHtml = payload.accumulated
        }
        flush()
      },
      {
        checkpoint,
        onCheckpoint: (next) => {
          checkpoint = next
          checkpointDirty = true
          flush(true)
        },
        deadline,
      },
    )
    await queue
    await updateJob(id, {
      status: 'gereed',
      message: `Stuk geschreven met ${ai.provider} (${ai.model}).`,
      resultHtml: html,
      partialHtml: html,
      checkpoint: null,
      provider: ai.provider,
      model: ai.model,
      version: version + 1,
      heartbeatAt: new Date(),
      finishedAt: new Date(),
    })
  } catch (error) {
    await queue
    if (error instanceof WriteRunInterrupted) {
      await handleInterruptedRun(job, request, error.checkpoint, version, ai)
      return
    }
    const detail = error instanceof Error ? error.message : 'Onbekende fout bij genereren.'
    await updateJob(id, {
      status: 'mislukt',
      message: `Genereren mislukt: ${detail}`,
      error: detail,
      // Geschreven secties blijven staan; de gebruiker kan ze alsnog overnemen.
      partialHtml: assembleFromCheckpoint(request, checkpoint) ?? partialHtml,
      version: version + 1,
      heartbeatAt: new Date(),
      finishedAt: new Date(),
    })
  } finally {
    clearInterval(heartbeat)
  }
}

/**
 * Deze beurt raakte door zijn tijd heen. Voortgang bewaren, de opdracht vrijgeven en een
 * vervolgbeurt aanvragen. Alleen als hervatten telkens niet lukt, wordt opgeleverd wat er
 * ligt — geschreven tekst gooien we nooit weg.
 */
async function handleInterruptedRun(
  job: WriteJobRecord,
  request: WriteDraftRequest,
  checkpoint: DraftCheckpoint,
  version: number,
  ai: AiRuntimeConfig,
): Promise<void> {
  const partial = assembleFromCheckpoint(request, checkpoint)
  const complete = checkpointComplete(checkpoint)

  if (job.runs >= MAX_RUNS) {
    const done = complete && partial
    await updateJob(job.id, {
      status: done ? 'gereed' : 'mislukt',
      message: done
        ? 'Stuk geschreven; de laatste opmaakcontrole is overgeslagen omdat het schrijven lang duurde.'
        : 'Het schrijven duurde te lang. De secties die af zijn, staan hieronder.',
      error: done ? null : 'Het schrijven duurde te lang en is gestopt.',
      resultHtml: done ? partial : null,
      partialHtml: partial,
      checkpoint: null,
      provider: ai.provider,
      model: ai.model,
      version: version + 1,
      heartbeatAt: new Date(),
      finishedAt: new Date(),
    })
    return
  }

  await updateJob(job.id, {
    status: 'lopend',
    message: 'Het schrijven gaat verder in een volgende serverbeurt…',
    checkpoint: JSON.stringify(checkpoint),
    partialHtml: partial,
    version: version + 1,
    // Hartslag terugzetten geeft de opdracht vrij, zodat de vervolgbeurt hem mag overnemen.
    heartbeatAt: new Date(0),
  })
  await triggerContinuation(job)
}

/** Wat de client van een opdracht te zien krijgt; de opdrachtinvoer blijft server-side. */
export function toJobSnapshot(job: WriteJobRecord, sinceVersion = 0): WriteDraftJobSnapshot {
  const fresh = job.version > sinceVersion
  return {
    id: job.id,
    projectId: job.projectId,
    draftId: job.draftId,
    draftTitle: job.draftTitle,
    stage: job.stage as WriteDraftJobSnapshot['stage'],
    kind: job.kind,
    status: job.status,
    message: job.message,
    version: job.version,
    // Ongewijzigd sinds de vorige poll: het (grote) document niet opnieuw versturen.
    partialHtml: fresh ? job.partialHtml : null,
    html: job.status === 'gereed' ? job.resultHtml : null,
    error: job.error,
    provider: job.provider,
    model: job.model,
    startedAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
  }
}
