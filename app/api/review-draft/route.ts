import { handleReviewDraftRequest } from '@api-lib/reviewDraft'
import type { ReviewDraftRequest } from '@/types/reviewDraft'
import { withUsageContext } from '@api-lib/usageContext'

export const maxDuration = 120

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as ReviewDraftRequest
    return await withUsageContext(request, () => handleReviewDraftRequest(body))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout.'
    return Response.json({ error: message }, { status: 500 })
  }
}
