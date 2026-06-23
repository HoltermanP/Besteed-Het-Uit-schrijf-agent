import { loadStored, saveStored } from './storage'

// Per-aanbesteding ("dossier") werkruimte-opslag. Elke gedownloade aanbesteding krijgt
// een eigen snapshot van project, bronnen, concept, analyse en opmerkingen, zodat je
// tussen aanbestedingen kunt wisselen en verder kunt waar je gebleven was.

const ACTIVE_KEY = 'bid-agent-active-dossier'
const PREFIX = 'bid-agent-dossier-'

export function dossierStorageKey(id: string) {
  return `${PREFIX}${id}`
}

export function getActiveDossierId(): string {
  return loadStored<string>(ACTIVE_KEY, '')
}

export function setActiveDossierId(id: string) {
  saveStored(ACTIVE_KEY, id)
}

export function loadDossier<T>(id: string): T | null {
  if (!id) return null
  return loadStored<T | null>(dossierStorageKey(id), null)
}

export function saveDossier<T>(id: string, snapshot: T) {
  if (!id) return
  saveStored(dossierStorageKey(id), snapshot)
}

export function hasDossier(id: string): boolean {
  if (!id) return false
  return localStorage.getItem(dossierStorageKey(id)) != null
}

export function getDossierUpdatedAt(id: string): string | null {
  const raw = loadDossier<{ updatedAt?: string }>(id)
  return raw?.updatedAt ?? null
}
