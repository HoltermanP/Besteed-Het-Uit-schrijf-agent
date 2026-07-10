import { handleReviewDraftRequest } from '@api-lib/reviewDraft'
import type { ReviewDraftRequest } from '@/types/reviewDraft'

export const maxDuration = 120

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as ReviewDraftRequest
    return await handleReviewDraftRequest(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout.'
    return Response.json({ error: message }, { status: 500 })
  }
}
