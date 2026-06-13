import { extractDocumentText, validateStyleFileName } from './extractDocumentText'

const MAX_FILE_BYTES = 12 * 1024 * 1024

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
      throw new Error('Bestand is te groot (max. 12 MB).')
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
