import { handleRewriteFragmentRequest } from '@api-lib/rewriteFragment'

export const maxDuration = 120

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    return await handleRewriteFragmentRequest(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout.'
    return Response.json({ error: message }, { status: 500 })
  }
}
