import { hasDossier, loadDossier, saveDossier } from './dossier'
import { loadVersionHistory, removeVersionHistory, saveVersionHistory } from './draftVersions'
import { listProjects, removeProject, upsertProject, type ProjectMeta } from './projects'
import { loadStored, removeStored, saveStored } from './storage'
import type { DossierSnapshot, DraftVersionHistory } from '../types/dossier'

/**
 * Prullenbak voor verwijderde projecten.
 *
 * Een project verwijderen is één klik, maar kan maanden werk kosten. Verwijderen zet het
 * hele dossier (bronnen, concepten, opmerkingen) plus de versiegeschiedenis daarom eerst
 * dertig dagen apart, zodat een beheerder het kan terughalen. Daarna ruimt de prullenbak
 * zichzelf op: bij elke keer lezen verdwijnt alles wat over de bewaartermijn heen is.
 *
 * De prullenbak staat in dezelfde werkruimte-opslag als de projecten zelf en is dus ook
 * per bedrijf gescheiden en onderdeel van de back-up.
 */

export const TRASH_RETENTION_DAYS = 30

const INDEX_KEY = 'bid-agent-trash'
const ENTRY_PREFIX = 'bid-agent-trashed-'
const DAY_MS = 24 * 60 * 60 * 1000

/** Wat er van een verwijderd project in de lijst zichtbaar is. */
export type TrashedProject = {
  meta: ProjectMeta
  deletedAt: string
  drafts: number
  sources: number
  files: number
}

export type TrashedProjectView = TrashedProject & {
  expiresAt: string
  /** Hele dagen tot definitief verwijderen; 0 = vandaag nog. */
  daysLeft: number
}

/** Het dossier zelf; apart bewaard zodat de lijst niet alle concepten hoeft te parsen. */
type TrashedPayload = {
  snapshot: DossierSnapshot | null
  versions: DraftVersionHistory
}

export type RestoreResult = 'hersteld' | 'niet-gevonden' | 'bestaat-al'

function entryKey(id: string) {
  return `${ENTRY_PREFIX}${id}`
}

function readIndex(): TrashedProject[] {
  const stored = loadStored<TrashedProject[]>(INDEX_KEY, [])
  return Array.isArray(stored) ? stored.filter((entry) => entry?.meta?.id && entry.deletedAt) : []
}

function writeIndex(entries: TrashedProject[]) {
  saveStored(INDEX_KEY, entries)
}

function expiryOf(entry: TrashedProject): number {
  return new Date(entry.deletedAt).getTime() + TRASH_RETENTION_DAYS * DAY_MS
}

/**
 * Ruim alles op wat langer dan de bewaartermijn in de prullenbak staat. Geeft terug
 * hoeveel projecten definitief zijn verwijderd.
 */
export function purgeExpiredTrash(now = Date.now()): number {
  const entries = readIndex()
  const expired = entries.filter((entry) => {
    const expiry = expiryOf(entry)
    // Onleesbare datum: nooit stilzwijgend weggooien.
    return Number.isFinite(expiry) && expiry <= now
  })
  if (!expired.length) return 0
  expired.forEach((entry) => removeStored(entryKey(entry.meta.id)))
  const expiredIds = new Set(expired.map((entry) => entry.meta.id))
  writeIndex(entries.filter((entry) => !expiredIds.has(entry.meta.id)))
  return expired.length
}

/** Verwijderde projecten, nieuwste eerst, met hoeveel dagen ze nog terug te halen zijn. */
export function listTrashedProjects(now = Date.now()): TrashedProjectView[] {
  purgeExpiredTrash(now)
  return readIndex()
    .slice()
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
    .map((entry) => {
      const expiry = expiryOf(entry)
      return {
        ...entry,
        expiresAt: Number.isFinite(expiry) ? new Date(expiry).toISOString() : '',
        daysLeft: Number.isFinite(expiry) ? Math.max(0, Math.ceil((expiry - now) / DAY_MS)) : TRASH_RETENTION_DAYS,
      }
    })
}

export function trashedProjectCount(now = Date.now()): number {
  purgeExpiredTrash(now)
  return readIndex().length
}

function inferSource(id: string): ProjectMeta['source'] {
  return id.startsWith('prj-') ? 'blank' : 'tender'
}

/**
 * Verplaats een project naar de prullenbak: het verdwijnt uit het overzicht, maar dossier
 * en versiegeschiedenis blijven bewaard. Geeft de prullenbakvermelding terug, of null als
 * er niets te verwijderen viel.
 */
export function trashProject(id: string): TrashedProject | null {
  if (!id) return null
  const snapshot = loadDossier<DossierSnapshot>(id)
  const known = listProjects().find((project) => project.id === id)
  if (!snapshot && !known) return null

  const meta: ProjectMeta = known ?? {
    id,
    title: snapshot?.project?.title || 'Naamloos project',
    buyer: snapshot?.project?.buyer || '',
    updatedAt: snapshot?.updatedAt || '',
    source: inferSource(id),
  }
  const versions = loadVersionHistory(id)
  const entry: TrashedProject = {
    meta,
    deletedAt: new Date().toISOString(),
    drafts: snapshot?.drafts?.length ?? (snapshot?.draft ? 1 : 0),
    sources: snapshot?.documents?.length ?? 0,
    files: snapshot?.tenderDocuments?.length ?? 0,
  }

  const payload: TrashedPayload = { snapshot, versions }
  saveStored(entryKey(id), payload)
  writeIndex([entry, ...readIndex().filter((item) => item.meta.id !== id)])

  removeProject(id)
  removeVersionHistory(id)
  return entry
}

/**
 * Haal een verwijderd project terug. Bestaat er inmiddels weer een project met hetzelfde
 * id (bijvoorbeeld dezelfde aanbesteding opnieuw opgehaald), dan wordt er niets
 * overschreven en blijft de prullenbakvermelding staan.
 */
export function restoreTrashedProject(id: string): RestoreResult {
  const entry = readIndex().find((item) => item.meta.id === id)
  if (!entry) return 'niet-gevonden'
  if (hasDossier(id)) return 'bestaat-al'

  const payload = loadStored<TrashedPayload | null>(entryKey(id), null)
  if (payload?.snapshot) saveDossier(id, payload.snapshot)
  if (payload?.versions && Object.keys(payload.versions).length) saveVersionHistory(id, payload.versions)
  upsertProject(entry.meta)

  removeStored(entryKey(id))
  writeIndex(readIndex().filter((item) => item.meta.id !== id))
  return 'hersteld'
}

/** Definitief verwijderen, vóór het einde van de bewaartermijn. */
export function purgeTrashedProject(id: string) {
  removeStored(entryKey(id))
  writeIndex(readIndex().filter((item) => item.meta.id !== id))
}
