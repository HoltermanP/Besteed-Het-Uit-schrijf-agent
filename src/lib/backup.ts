import { strToU8, zipSync } from 'fflate'
import { saveAs } from 'file-saver'
import { proposalDocumentCss } from '../styles/proposalDocument'
import { slugForFile } from './draftHtml'
import { TRASH_RETENTION_DAYS } from './projectTrash'
import { scopedStorageKey, splitStorageKey } from './storage'
import { countWords } from './volumeLimits'
import { BACKUP_FORMAT, type BackupBundle } from '../types/backup'
import type { DossierSnapshot, Stage } from '../types/dossier'
import type { ProjectMeta } from './projects'

/**
 * Volledige export van de werkruimte als zip-bestand.
 *
 * De zip bevat twee dingen naast elkaar:
 * - `back-up.json`: alles wat de server heeft (alle bedrijven, alle projecten met hun
 *   concepten, bronnen en versies, plus de bibliotheken). Dit is het bestand waarmee een
 *   werkruimte teruggezet kan worden.
 * - `projecten/…`: dezelfde inhoud leesbaar — per project een overzicht van de bronnen en
 *   bestanden en elk concept als HTML dat je zonder de applicatie kunt openen.
 *
 * Zo is een back-up ook nuttig als de applicatie zelf er niet meer is.
 */

const PROJECT_INDEX_KEY = 'bid-agent-projects'
const DOSSIER_PREFIX = 'bid-agent-dossier-'
const COMPANIES_KEY = 'bid-agent-companies'

export type BackupSummary = {
  projects: number
  drafts: number
  documents: number
  bytes: number
  fileName: string
}

/** Wat de export van één stuk nodig heeft; ouder dossiers leveren minder dan een DraftDocument. */
type ExportedDraft = {
  id: string
  title: string
  stage: Stage
  html: string
  updatedAt: string
}

type ProjectExport = {
  companyId: string
  companyName: string
  id: string
  meta: ProjectMeta | null
  snapshot: DossierSnapshot | null
}

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return (JSON.parse(raw) as T) ?? fallback
  } catch {
    return fallback
  }
}

function companiesFrom(bundle: BackupBundle): Array<{ id: string; name: string }> {
  const stored = parseJson<Array<{ id?: string; name?: string }>>(bundle.werkruimte[COMPANIES_KEY], [])
  const companies = stored
    .filter((company) => typeof company?.id === 'string' && company.id)
    .map((company) => ({ id: company.id as string, name: company.name?.trim() || (company.id as string) }))
  if (companies.length) return companies
  // Nog nooit een bedrijf aangemaakt: alle data hoort bij de standaardwerkruimte.
  return [{ id: 'default', name: bundle.bibliotheek[0]?.name || 'Besteed Het Uit' }]
}

/** Alle projecten uit de back-up, ook dossiers die (nog) niet in het projectregister staan. */
function collectProjects(bundle: BackupBundle): ProjectExport[] {
  const companies = companiesFrom(bundle)
  const nameById = new Map(companies.map((company) => [company.id, company.name]))
  const indexByCompany = new Map(
    companies.map((company) => [
      company.id,
      parseJson<ProjectMeta[]>(bundle.werkruimte[scopedStorageKey(PROJECT_INDEX_KEY, company.id)], []),
    ]),
  )

  const projects: ProjectExport[] = []
  const seen = new Set<string>()

  const add = (companyId: string, id: string, meta: ProjectMeta | null) => {
    const marker = `${companyId}/${id}`
    if (seen.has(marker)) return
    seen.add(marker)
    projects.push({
      companyId,
      companyName: nameById.get(companyId) ?? companyId,
      id,
      meta,
      snapshot: parseJson<DossierSnapshot | null>(
        bundle.werkruimte[scopedStorageKey(`${DOSSIER_PREFIX}${id}`, companyId)],
        null,
      ),
    })
  }

  for (const [companyId, index] of indexByCompany) {
    for (const meta of index) add(companyId, meta.id, meta)
  }
  for (const storedKey of Object.keys(bundle.werkruimte)) {
    const { key, companyId } = splitStorageKey(storedKey)
    if (!key.startsWith(DOSSIER_PREFIX)) continue
    const index = indexByCompany.get(companyId) ?? []
    const id = key.slice(DOSSIER_PREFIX.length)
    add(companyId, id, index.find((meta) => meta.id === id) ?? null)
  }

  return projects
}

function draftsOf(project: ProjectExport): ExportedDraft[] {
  const snapshot = project.snapshot
  if (!snapshot) return []
  if (Array.isArray(snapshot.drafts) && snapshot.drafts.length) {
    return snapshot.drafts.map((draft) => ({
      id: draft.id,
      title: draft.title || draft.id,
      stage: draft.stage ?? 'brons',
      html: draft.html ?? '',
      updatedAt: draft.updatedAt ?? '',
    }))
  }
  // Ouder dossier met één concept: dat telt hier gewoon als één stuk.
  if (!snapshot.draft) return []
  return [
    {
      id: 'concept',
      title: snapshot.project?.title || 'Concept',
      stage: snapshot.stage ?? 'brons',
      html: snapshot.draft,
      updatedAt: snapshot.updatedAt ?? '',
    },
  ]
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Eén concept als los te openen HTML-bestand, met de opmaak van de werkplek erin. */
function conceptDocument(title: string, project: ProjectExport, draft: ExportedDraft): string {
  const heading = `${project.meta?.title || project.snapshot?.project?.title || project.id} — ${title}`
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(heading)}</title>
<style>
body { margin: 0; padding: 24px; background: #eef2f1; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
.export-header { max-width: 820px; margin: 0 auto 16px; color: #475569; font-size: 13px; }
.document-editor { max-width: 820px; margin: 0 auto; }
${proposalDocumentCss}
</style>
</head>
<body>
<div class="export-header">
  <strong>${escapeHtml(heading)}</strong><br>
  Stadium: ${escapeHtml(draft.stage)} · ${countWords(draft.html).toLocaleString('nl-NL')} woorden · laatst gewijzigd ${escapeHtml(draft.updatedAt || 'onbekend')}
</div>
<div class="document-editor">
${draft.html}
</div>
</body>
</html>
`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Leesbaar overzicht per project: kerngegevens, stukken, bronnen en bestanden. */
function projectOverview(project: ProjectExport, drafts: ExportedDraft[]): string {
  const snapshot = project.snapshot
  const title = project.meta?.title || snapshot?.project?.title || project.id
  const lines = [
    `# ${title}`,
    '',
    `- Bedrijf: ${project.companyName}`,
    `- Opdrachtgever: ${project.meta?.buyer || snapshot?.project?.buyer || '—'}`,
    `- TenderNed-id: ${snapshot?.project?.tendernedId || '—'}`,
    `- Deadline: ${snapshot?.project?.deadline || '—'}`,
    `- Laatst gewijzigd: ${project.meta?.updatedAt || snapshot?.updatedAt || '—'}`,
    `- Project-id: ${project.id}`,
    '',
    `## Stukken (${drafts.length})`,
    '',
  ]
  if (drafts.length) {
    for (const draft of drafts) {
      lines.push(`- ${draft.title} — ${draft.stage}, ${countWords(draft.html).toLocaleString('nl-NL')} woorden`)
    }
  } else {
    lines.push('- (geen concepten)')
  }

  const sources = snapshot?.documents ?? []
  lines.push('', `## Bronnen (${sources.length})`, '')
  if (sources.length) {
    for (const source of sources) {
      lines.push(`- ${source.name} — ${source.type}, ${source.content.length.toLocaleString('nl-NL')} tekens (${source.importedAt})`)
    }
  } else {
    lines.push('- (geen bronnen)')
  }

  const files = snapshot?.tenderDocuments ?? []
  lines.push('', `## Bestanden (${files.length})`, '')
  if (files.length) {
    for (const file of files) {
      const link = file.fileUrl ? ` — ${file.fileUrl}` : ' — geen archieflink'
      lines.push(`- ${file.naam} (${file.type}, ${formatBytes(file.grootte ?? 0)}, status ${file.status})${link}`)
    }
    lines.push(
      '',
      'De originele bestanden staan in het documentarchief (Vercel Blob) en zitten niet in deze zip;',
      'de links hierboven blijven werken zolang het archief bestaat. De uitgelezen tekst staat wél in',
      'deze back-up, als bron hierboven en in back-up.json.',
    )
  } else {
    lines.push('- (geen bestanden)')
  }

  return `${lines.join('\n')}\n`
}

function readme(bundle: BackupBundle, summary: Omit<BackupSummary, 'bytes' | 'fileName'>): string {
  return `Volledige back-up — AI Schrijfagent (Besteed Het Uit)
Gemaakt op: ${bundle.gemaaktOp}

Inhoud
------
back-up.json          Alles wat de applicatie bewaart, machineleesbaar: alle bedrijven,
                      projecten, concepten, bronnen, versiegeschiedenis, prullenbak,
                      schrijfkader, stijldocumenten, leerpunten en bewijsbouwstenen.
                      Dit is het bestand waarmee een werkruimte teruggezet wordt.
projecten/            Dezelfde inhoud leesbaar, per bedrijf en per project:
                      project.md met de kerngegevens, bronnen en bestanden, en
                      elk concept als HTML dat je zonder de applicatie kunt openen.

Deze back-up bevat
------------------
Projecten: ${summary.projects}
Concepten: ${summary.drafts}
Documenten (bronnen en bestanden): ${summary.documents}

Let op
------
- API-sleutels en de database-connection string zijn bewust leeggemaakt. Vul ze na een
  herstel opnieuw in via API-beheer.
- De originele geüploade bestanden staan in het documentarchief (Vercel Blob), niet in
  deze zip. De uitgelezen tekst zit er wel in.
- Verwijderde projecten staan nog ${TRASH_RETENTION_DAYS} dagen in de prullenbak en zitten in back-up.json.
`
}

/** Zet de back-up om in een zip-bestand. Zonder browser-API's, zodat dit los te testen is. */
export function buildBackupZip(bundle: BackupBundle): { bytes: Uint8Array; summary: Omit<BackupSummary, 'bytes' | 'fileName'> } {
  const projects = collectProjects(bundle)
  const files: Record<string, Uint8Array> = {}
  let draftCount = 0
  let documentCount = 0

  for (const project of projects) {
    const drafts = draftsOf(project)
    draftCount += drafts.length
    documentCount += (project.snapshot?.documents?.length ?? 0) + (project.snapshot?.tenderDocuments?.length ?? 0)

    const folder = `projecten/${slugForFile(project.companyName)}/${slugForFile(
      project.meta?.title || project.snapshot?.project?.title || project.id,
    )}-${project.id}`
    files[`${folder}/project.md`] = strToU8(projectOverview(project, drafts))

    const used = new Set<string>()
    for (const draft of drafts) {
      let name = slugForFile(draft.title || draft.id)
      // Twee stukken met dezelfde naam mogen elkaar niet overschrijven.
      let counter = 2
      while (used.has(name)) name = `${slugForFile(draft.title || draft.id)}-${counter++}`
      used.add(name)
      files[`${folder}/concepten/${name}.html`] = strToU8(conceptDocument(draft.title || draft.id, project, draft))
    }
  }

  const summary = { projects: projects.length, drafts: draftCount, documents: documentCount }
  files['back-up.json'] = strToU8(JSON.stringify(bundle, null, 2))
  files['LEESMIJ.txt'] = strToU8(readme(bundle, summary))

  return { bytes: zipSync(files, { level: 6 }), summary }
}

export function backupFileName(gemaaktOp: string): string {
  const date = new Date(gemaaktOp)
  const stamp = Number.isNaN(date.getTime()) ? 'onbekend' : date.toISOString().slice(0, 10)
  return `back-up-besteed-het-uit-${stamp}.zip`
}

async function fetchBackupBundle(): Promise<BackupBundle> {
  const response = await fetch('/api/backup', { cache: 'no-store' })
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new Error((detail as { error?: string } | null)?.error || `Back-up mislukt (HTTP ${response.status}).`)
  }
  const bundle = (await response.json()) as BackupBundle
  if (bundle?.formaat !== BACKUP_FORMAT) throw new Error('Onverwacht antwoord van de back-up-service.')
  return bundle
}

/** Haalt de volledige back-up op en biedt hem als zip-bestand aan de browser aan. */
export async function downloadBackup(): Promise<BackupSummary> {
  const bundle = await fetchBackupBundle()
  const { bytes, summary } = buildBackupZip(bundle)
  const fileName = backupFileName(bundle.gemaaktOp)
  // Kopie in een eigen ArrayBuffer: de Blob-constructor accepteert geen SharedArrayBuffer-view.
  saveAs(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/zip' }), fileName)
  return { ...summary, bytes: bytes.length, fileName }
}
