import { handleExtractTextRequest } from '@api-lib/extractText'

// Ruim genomen: OCR van een gescande PDF via de AI kan enkele minuten duren.
export const maxDuration = 180

export async function POST(request: Request) {
  try {
    return await handleExtractTextRequest(request)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout.'
    return Response.json({ error: message }, { status: 500 })
  }
}
