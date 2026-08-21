import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

// Eigen aanbestedingsdocumenten die een gebruiker in een project uploadt (stukken die
// niet op TenderNed staan, zoals een nota van inlichtingen uit de mail). De tekst wordt
// in de browser uitgelezen; dit endpoint regelt alleen het archiveren van het origineel
// in Vercel Blob. De upload gaat rechtstreeks van browser naar Blob (client upload),
// zodat de 4,5 MB-requestlimiet van serverless functies niet geldt.

const BLOB_PREFIX = 'projectdocumenten'
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export function isProjectArchiveAvailable(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim())
}

export async function handleProjectDocumentsRequest(request: Request): Promise<Response> {
  if (request.method === 'GET') {
    return Response.json({ archiveAvailable: isProjectArchiveAvailable() })
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }
  if (!isProjectArchiveAvailable()) {
    return Response.json(
      { error: 'Documentarchief niet geconfigureerd (BLOB_READ_WRITE_TOKEN ontbreekt).' },
      { status: 503 },
    )
  }

  const body = (await request.json()) as HandleUploadBody
  const result = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (pathname) => {
      if (!pathname.startsWith(`${BLOB_PREFIX}/`) || pathname.includes('..')) {
        throw new Error('Ongeldig uploadpad.')
      }
      return {
        addRandomSuffix: true,
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
      }
    },
    // De blob-URL komt direct terug in de browser; een server-side vervolgstap is niet nodig.
    onUploadCompleted: async () => {},
  })
  return Response.json(result)
}
