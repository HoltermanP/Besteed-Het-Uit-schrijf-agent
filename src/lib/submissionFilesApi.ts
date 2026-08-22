import type { SubmissionFile } from '../types/dossier'
import { archiveFileInBlob, fetchProjectArchiveAvailability } from './projectDocumentsApi'

// Definitieve bestanden bij de indiening (het ondertekende UEA, de referentie-pdf, het
// geëxporteerde plan van aanpak). Het origineel gaat naar Vercel Blob zodat het bidteam
// het vanaf elk apparaat kan openen; zonder Blob-configuratie worden alleen de
// bestandsgegevens (naam, grootte, moment) vastgelegd.

const BLOB_PREFIX = 'indiening'

function safePathSegment(name: string): string {
  return name.replace(/[\\/]+/g, '_').replace(/[\u0000-\u001f]/g, '').trim() || 'document'
}

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  return index >= 0 ? fileName.slice(index + 1).toLowerCase() : ''
}

export async function storeSubmissionFile(projectId: string, itemId: string, file: File): Promise<SubmissionFile> {
  const archive = await fetchProjectArchiveAvailability()
  const url = archive
    ? await archiveFileInBlob(
        `${BLOB_PREFIX}/${safePathSegment(projectId)}/${safePathSegment(itemId)}/${safePathSegment(file.name)}`,
        file,
      )
    : undefined
  return {
    name: file.name,
    size: file.size,
    type: extensionOf(file.name) || 'bestand',
    url,
    uploadedAt: new Date().toISOString(),
  }
}
