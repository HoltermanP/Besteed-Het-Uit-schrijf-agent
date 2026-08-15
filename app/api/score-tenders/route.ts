import { handleScoreTendersRequest } from '@api-lib/scoreTenders'

export const maxDuration = 90

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    return await handleScoreTendersRequest(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout.'
    return Response.json({ error: message }, { status: 500 })
  }
}
