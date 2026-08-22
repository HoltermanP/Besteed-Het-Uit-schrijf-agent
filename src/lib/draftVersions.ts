import { countWords } from './tenderAnalysis'
import { loadStored, removeStored, saveStored } from './storage'
import type { DraftVersion, DraftVersionHistory, DraftVersionKind, Stage } from '../types/dossier'

/**
 * Versiegeschiedenis per stuk: elke generatie, verwerking, eigen bewerkingsronde en
 * herstelactie wordt bewaard, zodat de schrijver alles terugvindt, twee versies naast
 * elkaar kan leggen en een oudere versie kan herstellen.
 *
 * De geschiedenis staat in een eigen opslagsleutel per project — níét in het
 * dossier-snapshot. Dat snapshot wordt bij elke wijziging in de editor herschreven; de
 * geschiedenis alleen wanneer er echt een versie bijkomt.
 */

const PREFIX = 'bid-agent-versions-'

/** Maximaal aantal bewaarde versies per stuk. */
export const MAX_VERSIONS_PER_DRAFT = 30

/** Ruimtebudget van de hele geschiedenis van één project (tekens JSON). */
const HISTORY_BUDGET_CHARS = 1_200_000

export const versionKindLabels: Record<DraftVersionKind, string> = {
  generatie: 'Generatie',
  verwerking: 'Verwerking',
  bewerking: 'Eigen bewerking',
  herstel: 'Hersteld',
}

export function versionsStorageKey(projectId: string) {
  return `${PREFIX}${projectId}`
}

export function loadVersionHistory(projectId: string): DraftVersionHistory {
  if (!projectId) return {}
  const stored = loadStored<DraftVersionHistory>(versionsStorageKey(projectId), {})
  if (!stored || typeof stored !== 'object') return {}
  const history: DraftVersionHistory = {}
  for (const [draftId, list] of Object.entries(stored)) {
    if (Array.isArray(list)) history[draftId] = list.filter((item) => item && typeof item.html === 'string')
  }
  return history
}

export function saveVersionHistory(projectId: string, history: DraftVersionHistory) {
  if (!projectId) return
  saveStored(versionsStorageKey(projectId), history)
}

export function removeVersionHistory(projectId: string) {
  if (!projectId) return
  removeStored(versionsStorageKey(projectId))
}

export function versionsFor(history: DraftVersionHistory, draftId: string): DraftVersion[] {
  return history[draftId] ?? []
}

/** Geschiedenis van stukken die niet meer bestaan opruimen (bv. na het verwijderen van een stuk). */
export function pruneRemovedDrafts(history: DraftVersionHistory, draftIds: string[]): DraftVersionHistory {
  const keep = new Set(draftIds)
  const entries = Object.entries(history).filter(([draftId]) => keep.has(draftId))
  if (entries.length === Object.keys(history).length) return history
  return Object.fromEntries(entries)
}

const makeId = () => `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/**
 * Vergelijkbare vorm van een concept. De editor levert de HTML anders geserialiseerd op dan
 * de schrijfagent (aanhalingstekens, lege elementen, inspringing), dus wordt de tekst eerst
 * door de browser genormaliseerd. Zo levert dezelfde inhoud nooit een dubbele versie op —
 * bijvoorbeeld na het herladen van de pagina.
 */
function fingerprint(html: string): string {
  const collapsed = html.replace(/\s+/g, ' ').trim()
  if (typeof document === 'undefined') return collapsed
  const template = document.createElement('template')
  template.innerHTML = collapsed
  return template.innerHTML
}

export type NewDraftVersion = {
  kind: DraftVersionKind
  label: string
  stage: Stage
  html: string
  provider?: string
  model?: string
  restoredFromId?: string
}

/**
 * Verwijder versies zodra de lijst te lang wordt: de oudste (het eerste concept) en de
 * nieuwste blijven staan; daartussen vallen eerst de oudste eigen bewerkingsrondes weg,
 * daarna de oudste overige versies.
 */
export function pruneVersions(list: DraftVersion[], maxItems = MAX_VERSIONS_PER_DRAFT): DraftVersion[] {
  let pruned = list
  const tooLarge = () => JSON.stringify(pruned).length > HISTORY_BUDGET_CHARS
  while (pruned.length > 2 && (pruned.length > maxItems || tooLarge())) {
    const middle = pruned.slice(1, -1)
    const target = middle.findIndex((item) => item.kind === 'bewerking')
    const dropIndex = target >= 0 ? target + 1 : 1
    pruned = [...pruned.slice(0, dropIndex), ...pruned.slice(dropIndex + 1)]
  }
  return pruned
}

/**
 * Voeg een versie toe aan de geschiedenis van één stuk. Levert dezelfde geschiedenis terug
 * als de tekst gelijk is aan de nieuwste versie — dan is er niets te bewaren.
 */
export function recordDraftVersion(
  history: DraftVersionHistory,
  draftId: string,
  input: NewDraftVersion,
): DraftVersionHistory {
  if (!draftId || !input.html.trim()) return history
  const current = history[draftId] ?? []
  const newest = current[current.length - 1]
  if (newest && fingerprint(newest.html) === fingerprint(input.html)) return history

  const version: DraftVersion = {
    id: makeId(),
    kind: input.kind,
    label: input.label,
    stage: input.stage,
    html: input.html,
    words: countWords(input.html),
    createdAt: new Date().toISOString(),
    provider: input.provider,
    model: input.model,
    restoredFromId: input.restoredFromId,
  }
  return { ...history, [draftId]: pruneVersions([...current, version]) }
}

/** Tijdstip van een versie, kort en leesbaar (bv. "22 aug 14:03"). */
export function formatVersionMoment(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
