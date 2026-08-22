import type { SourceDocument } from '../types/dossier'
import type { SavedTenderDocument } from '../types/tenderNed'
import { readFileContent } from './extractTextApi'
import { assessSourceContent } from './sourceQuality'

// Eigen aanbestedingsdocumenten per project: bestanden die niet via TenderNed binnenkomen
// (nota van inlichtingen per mail, bijlagen van een onderhandse uitvraag, eigen
// aantekeningen). Ze krijgen dezelfde behandeling als TenderNed-documenten: de tekst
// wordt ingelezen als aanbestedingsbron en het origineel wordt (indien Vercel Blob is
// geconfigureerd) gearchiveerd zodat je het later nog kunt openen.

const BLOB_PREFIX = 'projectdocumenten'
const HANDLE_UPLOAD_URL = '/api/project-documents'
// Zelfde plafond als bij TenderNed-documenten: één stuk mag het dossier niet opslokken.
export const MAX_PROJECT_DOCUMENT_CHARS = 150_000
const MULTIPART_FROM_BYTES = 8 * 1024 * 1024

export type ProjectDocumentImport = {
  /** Vermelding in de documentenlijst van het project (altijd aanwezig, ook bij fouten). */
  document: SavedTenderDocument
  /** Ingelezen tekstbron; ontbreekt als er geen leesbare tekst uit het bestand kwam. */
  source: SourceDocument | null
}

type BlobAccess = 'public' | 'private'
type ArchiveStatus = { available: boolean; access: BlobAccess | null }

let archiveStatus: Promise<ArchiveStatus> | null = null

// Archiefstatus (geconfigureerd? public of private store?). Eénmalig opgevraagd; een
// mislukte aanvraag wordt niet gecachet zodat een volgende upload het opnieuw probeert.
function fetchArchiveStatus(): Promise<ArchiveStatus> {
  if (!archiveStatus) {
    archiveStatus = fetch(HANDLE_UPLOAD_URL)
      .then(async (response): Promise<ArchiveStatus> => {
        if (!response.ok) throw new Error(`status ${response.status}`)
        const data = (await response.json()) as { archiveAvailable?: boolean; access?: BlobAccess | null }
        const access = data.access === 'public' || data.access === 'private' ? data.access : null
        return { available: Boolean(data.archiveAvailable) && access !== null, access }
      })
      .catch(() => {
        archiveStatus = null
        return { available: false, access: null }
      })
  }
  return archiveStatus
}

/** Of originelen gearchiveerd kunnen worden (Vercel Blob geconfigureerd en bereikbaar). */
export function fetchProjectArchiveAvailability(): Promise<boolean> {
  return fetchArchiveStatus().then((status) => status.available)
}

// Vangnet tegen eindeloos wachten: de Blob-SDK retryt onbekende fouten tot 10× met
// exponentiële backoff. Ruim genoeg voor grote bestanden op een trage verbinding.
function uploadTimeoutMs(bytes: number): number {
  return 2 * 60_000 + Math.ceil(bytes / (5 * 1024 * 1024)) * 60_000
}

const makeId = () => Math.random().toString(36).slice(2, 10)

function importedLabel(date: Date) {
  return date.toLocaleString('nl-NL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  return index >= 0 ? fileName.slice(index + 1).toLowerCase() : ''
}

function safePathSegment(name: string): string {
  return name.replace(/[\\/]+/g, '_').replace(/[\u0000-\u001f]/g, '').trim() || 'document'
}

/**
 * Bestand rechtstreeks vanuit de browser naar Vercel Blob zetten (client upload, dus
 * zonder de requestlimiet van serverless functies). Geeft de blob-URL terug, of
 * undefined als er geen archief is of de upload mislukt — het bestand blijft dan
 * bruikbaar, alleen zonder "Openen"-link. Ook gebruikt voor indieningsbestanden.
 */
export async function archiveFileInBlob(pathname: string, file: File): Promise<string | undefined> {
  try {
    const status = await fetchArchiveStatus()
    if (!status.available || !status.access) return undefined
    const { upload } = await import('@vercel/blob/client')
    const blob = await upload(pathname, file, {
      access: status.access,
      handleUploadUrl: HANDLE_UPLOAD_URL,
      contentType: file.type || undefined,
      multipart: file.size > MULTIPART_FROM_BYTES,
      abortSignal: AbortSignal.timeout(uploadTimeoutMs(file.size)),
    })
    return blob.url
  } catch {
    return undefined
  }
}

function archiveOriginal(projectId: string, file: File): Promise<string | undefined> {
  return archiveFileInBlob(`${BLOB_PREFIX}/${safePathSegment(projectId)}/${safePathSegment(file.name)}`, file)
}

type TextResult = { text: string; error?: string }

async function extractText(file: File): Promise<TextResult> {
  try {
    const extracted = await readFileContent(file)
    return { text: extracted.text }
  } catch (error) {
    return { text: '', error: error instanceof Error ? error.message : 'kon niet worden gelezen' }
  }
}

/**
 * Lees één geüpload bestand in als projectdocument: tekstextractie en archivering lopen
 * parallel. Levert altijd een documentvermelding op (met status), plus een tekstbron
 * wanneer er bruikbare tekst uit kwam.
 */
export async function importProjectDocument(
  projectId: string,
  file: File,
  options: { archive: boolean },
): Promise<ProjectDocumentImport> {
  const now = new Date()
  const id = makeId()
  const [textResult, fileUrl] = await Promise.all([
    extractText(file),
    options.archive ? archiveOriginal(projectId, file) : Promise.resolve(undefined),
  ])

  const base: SavedTenderDocument = {
    id,
    source: 'upload',
    uploadedAt: now.toISOString(),
    naam: file.name,
    type: extensionOf(file.name) || 'bestand',
    categorie: 'UPLOAD',
    categorieOmschrijving: 'Eigen upload',
    grootte: file.size,
    chars: 0,
    status: 'fout',
    fileUrl,
  }

  if (textResult.error !== undefined) {
    return { document: { ...base, status: 'fout', note: textResult.error }, source: null }
  }

  const quality = assessSourceContent(textResult.text)
  if (quality.quality === 'error') {
    return { document: { ...base, status: 'leeg', note: quality.label }, source: null }
  }

  const truncated = textResult.text.length > MAX_PROJECT_DOCUMENT_CHARS
  const text = truncated ? textResult.text.slice(0, MAX_PROJECT_DOCUMENT_CHARS) : textResult.text
  const document: SavedTenderDocument = {
    ...base,
    chars: text.length,
    status: 'ok',
    note: truncated
      ? `Ingekort tot ${MAX_PROJECT_DOCUMENT_CHARS.toLocaleString('nl-NL')} tekens`
      : quality.quality === 'warning'
        ? quality.label
        : undefined,
  }
  const source: SourceDocument = {
    id: makeId(),
    name: file.name,
    type: 'tender',
    content: text,
    importedAt: importedLabel(now),
    tenderDocumentId: id,
  }
  return { document, source }
}
