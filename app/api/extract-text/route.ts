import { handleExtractTextRequest } from '@api-lib/extractText'

export const maxDuration = 30

export async function POST(request: Request) {
  try {
    return await handleExtractTextRequest(request)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout.'
    return Response.json({ error: message }, { status: 500 })
  }
}
