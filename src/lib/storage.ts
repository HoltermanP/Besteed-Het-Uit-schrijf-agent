// Werkruimte-opslag in de database (Neon) in plaats van localStorage.
//
// De UI leest en schrijft synchroon via een in-memory cache. Die cache wordt bij het
// opstarten éénmalig gehydrateerd uit /api/state (zie StorageGate); daarna worden
// wijzigingen gebufferd en gebundeld teruggeschreven naar de database. Bij het sluiten
// van het tabblad gaat een laatste flush via navigator.sendBeacon; staat er dan nog werk
// open, dan vraagt de browser eerst om bevestiging (beforeunload).

const cache = new Map<string, string>()
const dirtyKeys = new Set<string>()
const removedKeys = new Set<string>()

let hydratePromise: Promise<void> | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushChain: Promise<void> = Promise.resolve()

const FLUSH_DELAY_MS = 800
const KEEPALIVE_MAX_BYTES = 60_000
const LEGACY_PREFIX = 'bid-agent-'

// ── Opslagstatus ─────────────────────────────────────────────────────────────
// Zichtbaar voor de gebruiker ("niet opgeslagen / bezig / opgeslagen 14:32"), zodat
// die weet of werk echt in de database staat. Componenten abonneren zich via
// subscribeSaveStatus (geschikt voor useSyncExternalStore).

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export interface SaveStatus {
  state: SaveState
  /** ISO-tijdstip van de laatste geslaagde schrijfactie. */
  savedAt: string | null
  error: string | null
}

let saveStatus: SaveStatus = { state: 'idle', savedAt: null, error: null }
const saveListeners = new Set<() => void>()
let saving = false

function updateSaveStatus(patch: Partial<SaveStatus>) {
  saveStatus = { ...saveStatus, ...patch }
  saveListeners.forEach((listener) => listener())
}

function hasPendingChanges() {
  return dirtyKeys.size > 0 || removedKeys.size > 0
}

function markDirty() {
  // Tijdens een lopende schrijfactie blijft "bezig" staan; na afloop valt de status
  // vanzelf terug op "niet opgeslagen" zolang er nog wijzigingen wachten.
  if (!saving) updateSaveStatus({ state: 'dirty' })
}

export function getSaveStatus(): SaveStatus {
  return saveStatus
}

export function subscribeSaveStatus(listener: () => void): () => void {
  saveListeners.add(listener)
  return () => {
    saveListeners.delete(listener)
  }
}

/** Staat er werk open dat nog niet (zeker) in de database staat? */
export function hasUnsavedChanges(): boolean {
  return saving || hasPendingChanges()
}

// ── Bedrijfsscheiding ────────────────────────────────────────────────────────
// Werkdata (projecten, dossiers, bronnen, bedrijfsconfig, opgeslagen
// aanbestedingen) is gescheiden per bedrijf: elke sleutel krijgt een suffix met
// het actieve bedrijfs-id. Het eerste bedrijf ('default') gebruikt de
// oorspronkelijke, ongescopede sleutels zodat bestaande data zonder migratie
// behouden blijft. App-brede sleutels (API-config, het bedrijvenregister zelf)
// worden nooit gescoped.

export const DEFAULT_COMPANY_ID = 'default'
const COMPANY_SEPARATOR = '@@'
const GLOBAL_KEYS = new Set([
  'bid-agent-api-config',
  'bid-agent-companies',
  'bid-agent-active-company',
])

function activeCompanyId(): string {
  const raw = cache.get('bid-agent-active-company')
  if (!raw) return DEFAULT_COMPANY_ID
  try {
    return (JSON.parse(raw) as string) || DEFAULT_COMPANY_ID
  } catch {
    return DEFAULT_COMPANY_ID
  }
}

/**
 * De sleutel zoals die voor één bepaald bedrijf in de opslag staat. Nodig buiten de
 * actieve werkruimte om: de back-up-export leest de sleutels van álle bedrijven.
 */
export function scopedStorageKey(key: string, companyId: string): string {
  if (GLOBAL_KEYS.has(key)) return key
  return companyId === DEFAULT_COMPANY_ID ? key : `${key}${COMPANY_SEPARATOR}${companyId}`
}

/** Omgekeerde van scopedStorageKey: uit welke logische sleutel en welk bedrijf komt deze rij? */
export function splitStorageKey(stored: string): { key: string; companyId: string } {
  const index = stored.indexOf(COMPANY_SEPARATOR)
  if (index < 0) return { key: stored, companyId: DEFAULT_COMPANY_ID }
  return { key: stored.slice(0, index), companyId: stored.slice(index + COMPANY_SEPARATOR.length) }
}

function scopeKey(key: string): string {
  return scopedStorageKey(key, activeCompanyId())
}

/** Verwijdert alle werkdata van één bedrijf (gebruikt bij het verwijderen ervan). */
export function purgeCompanyData(companyId: string) {
  const suffix = `${COMPANY_SEPARATOR}${companyId}`
  const targets = [...cache.keys()].filter((key) => {
    if (GLOBAL_KEYS.has(key)) return false
    return companyId === DEFAULT_COMPANY_ID
      ? !key.includes(COMPANY_SEPARATOR)
      : key.endsWith(suffix)
  })
  targets.forEach((key) => {
    cache.delete(key)
    dirtyKeys.delete(key)
    removedKeys.add(key)
  })
  if (targets.length) markDirty()
  scheduleFlush()
}

async function fetchServerState(): Promise<Record<string, string>> {
  const response = await fetch('/api/state', { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Werkruimte-opslag niet bereikbaar (HTTP ${response.status}).`)
  }
  const payload = (await response.json()) as { state?: Record<string, string> }
  return payload.state ?? {}
}

// Eénmalige migratie: werk dat nog in localStorage staat (van vóór de database-opslag)
// wordt bij een lege database overgenomen en daarna lokaal opgeruimd.
function collectLegacyLocalState(): Record<string, string> {
  const legacy: Record<string, string> = {}
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(LEGACY_PREFIX)) continue
      const value = localStorage.getItem(key)
      if (value != null) legacy[key] = value
    }
  } catch {
    // localStorage kan geblokkeerd zijn; migratie dan overslaan.
  }
  return legacy
}

function clearLegacyLocalState(keys: string[]) {
  try {
    keys.forEach((key) => localStorage.removeItem(key))
  } catch {
    // Niet kritisch: de database is inmiddels leidend.
  }
}

export function hydrateStorage(): Promise<void> {
  hydratePromise ??= (async () => {
    const serverState = await fetchServerState()
    for (const [key, value] of Object.entries(serverState)) {
      cache.set(key, value)
    }

    if (Object.keys(serverState).length === 0) {
      const legacy = collectLegacyLocalState()
      const legacyKeys = Object.keys(legacy)
      if (legacyKeys.length) {
        for (const [key, value] of Object.entries(legacy)) {
          cache.set(key, value)
          dirtyKeys.add(key)
        }
        await flushNow()
        clearLegacyLocalState(legacyKeys)
      }
    }

    registerUnloadFlush()
  })().catch((error) => {
    // Mislukte hydratie niet cachen, zodat StorageGate opnieuw kan proberen.
    hydratePromise = null
    throw error
  })
  return hydratePromise
}

function buildPayload() {
  const set: Record<string, string> = {}
  for (const key of dirtyKeys) {
    const value = cache.get(key)
    if (value != null) set[key] = value
  }
  const remove = [...removedKeys]
  return { set, remove }
}

async function flushNow(): Promise<void> {
  if (!dirtyKeys.size && !removedKeys.size) return
  const payload = buildPayload()
  const sentDirty = [...dirtyKeys]
  const sentRemoved = [...removedKeys]
  dirtyKeys.clear()
  removedKeys.clear()
  saving = true
  updateSaveStatus({ state: 'saving' })

  try {
    const body = JSON.stringify(payload)
    const response = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
      // keepalive laat de request doorlopen als het tabblad sluit, maar de
      // browser begrenst keepalive-bodies op 64 KB en laat grotere requests
      // falen ("Failed to fetch"). Grote payloads (voorselectie, dossiers)
      // gaan daarom zonder keepalive; de pagehide-flush blijft best effort.
      keepalive: body.length < KEEPALIVE_MAX_BYTES,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    saving = false
    updateSaveStatus({
      // Kwamen er tijdens het schrijven nieuwe wijzigingen binnen, dan staan die nog open.
      state: hasPendingChanges() ? 'dirty' : 'saved',
      savedAt: new Date().toISOString(),
      error: null,
    })
  } catch (error) {
    // Terugleggen zodat een volgende flush het opnieuw probeert.
    sentDirty.forEach((key) => dirtyKeys.add(key))
    sentRemoved.forEach((key) => removedKeys.add(key))
    saving = false
    updateSaveStatus({ state: 'error', error: error instanceof Error ? error.message : String(error) })
    scheduleFlush(5000)
    console.warn('Opslaan naar database mislukt; wordt opnieuw geprobeerd.', error)
    throw error
  }
}

function scheduleFlush(delay = FLUSH_DELAY_MS) {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushChain = flushChain.then(() => flushNow().catch(() => {}))
  }, delay)
}

/** Wacht tot alle openstaande wijzigingen naar de database zijn geschreven. */
export async function flushStorage(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  flushChain = flushChain.then(() => flushNow().catch(() => {}))
  await flushChain
}

let unloadRegistered = false
function registerUnloadFlush() {
  if (unloadRegistered || typeof window === 'undefined') return
  unloadRegistered = true
  window.addEventListener('pagehide', () => {
    if (!dirtyKeys.size && !removedKeys.size) return
    const payload = buildPayload()
    dirtyKeys.clear()
    removedKeys.clear()
    // sendBeacon kan alleen POST; de state-route accepteert POST als alias van PUT.
    navigator.sendBeacon('/api/state', new Blob([JSON.stringify(payload)], { type: 'application/json' }))
  })
  // Waarschuw bij het sluiten of verversen van het tabblad zolang er werk openstaat of
  // nog onderweg is; de beacon hierboven is immers best effort. Navigatie binnen de app
  // (Next-router) raakt dit niet.
  window.addEventListener('beforeunload', (event) => {
    if (!hasUnsavedChanges()) return
    event.preventDefault()
    // Oudere browsers tonen de dialoog alleen met een (willekeurige) returnValue.
    event.returnValue = ''
  })
}

export function getStoredRaw(key: string): string | null {
  return cache.get(scopeKey(key)) ?? null
}

export function setStoredRaw(key: string, value: string) {
  const scoped = scopeKey(key)
  // Ongewijzigde waarde: niets te doen (voorkomt loze schrijfacties en een onterechte
  // "niet opgeslagen"-melding).
  if (cache.get(scoped) === value && !dirtyKeys.has(scoped) && !removedKeys.has(scoped)) return
  cache.set(scoped, value)
  removedKeys.delete(scoped)
  dirtyKeys.add(scoped)
  markDirty()
  scheduleFlush()
}

export function removeStored(key: string) {
  const scoped = scopeKey(key)
  cache.delete(scoped)
  dirtyKeys.delete(scoped)
  removedKeys.add(scoped)
  markDirty()
  scheduleFlush()
}

/** Sleutels van het actieve bedrijf; het bedrijfssuffix wordt gestript zodat aanroepers logische sleutels zien. */
export function listStoredKeys(prefix: string): string[] {
  const company = activeCompanyId()
  const suffix = company === DEFAULT_COMPANY_ID ? '' : `${COMPANY_SEPARATOR}${company}`
  return [...cache.keys()]
    .filter(
      (key) =>
        key.startsWith(prefix) &&
        (suffix ? key.endsWith(suffix) : !key.includes(COMPANY_SEPARATOR)),
    )
    .map((key) => (suffix ? key.slice(0, key.length - suffix.length) : key))
}

export function loadStored<T>(key: string, fallback: T): T {
  try {
    const stored = getStoredRaw(key)
    return stored ? (JSON.parse(stored) as T) : fallback
  } catch {
    return fallback
  }
}

export function saveStored<T>(key: string, value: T) {
  setStoredRaw(key, JSON.stringify(value))
}
