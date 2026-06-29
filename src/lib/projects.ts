import { dossierStorageKey, loadDossier, saveDossier } from './dossier'
import { loadStored, saveStored } from './storage'

// Eén gezamenlijk register van alle opgeslagen projecten (zowel blanco gestart als
// uit een gedownloade aanbesteding). De volledige werkruimte-snapshot blijft in de
// bestaande dossier-opslag staan (key per id); dit register houdt alleen de
// zichtbare lijst bij zodat je elk project kunt terugvinden en heropenen.

const INDEX_KEY = 'bid-agent-projects'
const DOSSIER_PREFIX = 'bid-agent-dossier-'

export type ProjectSource = 'blank' | 'tender'

export type ProjectMeta = {
  id: string
  title: string
  buyer: string
  updatedAt: string
  source: ProjectSource
}

type StoredSnapshot = {
  project?: { title?: string; buyer?: string }
  updatedAt?: string
}

export function makeProjectId() {
  return `prj-${Math.random().toString(36).slice(2, 10)}`
}

function readIndex(): ProjectMeta[] {
  return loadStored<ProjectMeta[]>(INDEX_KEY, [])
}

function writeIndex(list: ProjectMeta[]) {
  saveStored(INDEX_KEY, list)
}

function inferSource(id: string): ProjectSource {
  return id.startsWith('prj-') ? 'blank' : 'tender'
}

// Vul het register aan met dossiers die al in de opslag staan maar er nog niet in zijn
// opgenomen (bv. aanbestedingen die vóór deze functie zijn aangemaakt).
function reconcile(index: ProjectMeta[]): ProjectMeta[] {
  const known = new Set(index.map((p) => p.id))
  const merged = [...index]
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(DOSSIER_PREFIX)) continue
    const id = key.slice(DOSSIER_PREFIX.length)
    if (known.has(id)) continue
    const snapshot = loadDossier<StoredSnapshot>(id)
    if (!snapshot) continue
    merged.push({
      id,
      title: snapshot.project?.title || 'Naamloos project',
      buyer: snapshot.project?.buyer || '',
      updatedAt: snapshot.updatedAt || '',
      source: inferSource(id),
    })
    known.add(id)
  }
  return merged
}

export function listProjects(): ProjectMeta[] {
  return reconcile(readIndex()).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
}

export function upsertProject(meta: ProjectMeta) {
  const list = readIndex().filter((p) => p.id !== meta.id)
  list.push(meta)
  writeIndex(list)
}

export function renameProject(id: string, title: string) {
  const trimmed = title.trim() || 'Naamloos project'
  const list = reconcile(readIndex()).map((p) => (p.id === id ? { ...p, title: trimmed } : p))
  writeIndex(list)
  const snapshot = loadDossier<Record<string, unknown>>(id)
  if (snapshot) {
    saveDossier(id, {
      ...snapshot,
      project: { ...(snapshot.project as Record<string, unknown>), title: trimmed },
    })
  }
}

export function removeProject(id: string) {
  writeIndex(readIndex().filter((p) => p.id !== id))
  localStorage.removeItem(dossierStorageKey(id))
}
