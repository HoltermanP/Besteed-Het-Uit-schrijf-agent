import { extractDocumentText, validateStyleFileName } from './extractDocumentText'

// Vercel-functies accepteren max ~4,5 MB per request; daarboven komt de upload
// nooit aan en krijgt de gebruiker een onduidelijke platformfout.
const MAX_FILE_BYTES = 4 * 1024 * 1024

export async function handleExtractTextRequest(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      throw new Error('Geen bestand ontvangen.')
    }

    validateStyleFileName(file.name)
    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.byteLength > MAX_FILE_BYTES) {
      throw new Error('Bestand is te groot (max. 4 MB). Comprimeer de PDF of splits het document.')
    }

    const text = await extractDocumentText(file.name, buffer)
    return Response.json({
      fileName: file.name,
      text,
      words: text.split(/\s+/).filter(Boolean).length,
      chars: text.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tekstextractie mislukt.'
    return Response.json({ error: message }, { status: 400 })
  }
}
