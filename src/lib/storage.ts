// Werkruimte-opslag in de database (Neon) in plaats van localStorage.
//
// De UI leest en schrijft synchroon via een in-memory cache. Die cache wordt bij het
// opstarten éénmalig gehydrateerd uit /api/state (zie StorageGate); daarna worden
// wijzigingen gebufferd en gebundeld teruggeschreven naar de database. Bij het sluiten
// van het tabblad gaat een laatste flush via navigator.sendBeacon.

const cache = new Map<string, string>()
const dirtyKeys = new Set<string>()
const removedKeys = new Set<string>()

let hydratePromise: Promise<void> | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushChain: Promise<void> = Promise.resolve()

const FLUSH_DELAY_MS = 800
const LEGACY_PREFIX = 'bid-agent-'

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

  try {
    const response = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
  } catch (error) {
    // Terugleggen zodat een volgende flush het opnieuw probeert.
    sentDirty.forEach((key) => dirtyKeys.add(key))
    sentRemoved.forEach((key) => removedKeys.add(key))
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
}

export function getStoredRaw(key: string): string | null {
  return cache.get(key) ?? null
}

export function setStoredRaw(key: string, value: string) {
  cache.set(key, value)
  removedKeys.delete(key)
  dirtyKeys.add(key)
  scheduleFlush()
}

export function removeStored(key: string) {
  cache.delete(key)
  dirtyKeys.delete(key)
  removedKeys.add(key)
  scheduleFlush()
}

export function listStoredKeys(prefix: string): string[] {
  return [...cache.keys()].filter((key) => key.startsWith(prefix))
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
