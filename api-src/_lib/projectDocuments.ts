import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { detectBlobAccess, isBlobConfigured } from './blobStore'

// Eigen aanbestedingsdocumenten die een gebruiker in een project uploadt (stukken die
// niet op TenderNed staan, zoals een nota van inlichtingen uit de mail) en definitieve
// indieningsbestanden (ondertekend UEA, referenties, geëxporteerde stukken). De tekst
// wordt in de browser uitgelezen; dit endpoint regelt alleen het archiveren van het
// origineel in Vercel Blob. De upload gaat rechtstreeks van browser naar Blob (client upload),
// zodat de 4,5 MB-requestlimiet van serverless functies niet geldt.

/** Toegestane mappen: eigen aanbestedingsdocumenten en definitieve indieningsbestanden. */
const BLOB_PREFIXES = ['projectdocumenten/', 'indiening/']
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export async function handleProjectDocumentsRequest(request: Request): Promise<Response> {
  if (request.method === 'GET') {
    // De browser moet de access-modus van de store kennen: een client-upload met de
    // verkeerde modus wordt geweigerd (en bleef door SDK-retries minutenlang hangen).
    if (!isBlobConfigured()) {
      return Response.json({ archiveAvailable: false, access: null })
    }
    try {
      return Response.json({ archiveAvailable: true, access: await detectBlobAccess() })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Store-modus kon niet worden bepaald.'
      return Response.json({ archiveAvailable: false, access: null, error: message })
    }
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }
  if (!isBlobConfigured()) {
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
      if (!BLOB_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || pathname.includes('..')) {
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
