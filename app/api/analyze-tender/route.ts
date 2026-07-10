import { handleAnalyzeTenderRequest } from '@api-lib/analyzeTender'
import type { AnalyzeTenderRequest } from '@/types/analyzeTender'

export const maxDuration = 120

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as AnalyzeTenderRequest
    return await handleAnalyzeTenderRequest(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout.'
    return Response.json({ error: message }, { status: 500 })
  }
}
