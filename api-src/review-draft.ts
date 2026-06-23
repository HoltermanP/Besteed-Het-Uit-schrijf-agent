import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleReviewDraftRequest } from './_lib/reviewDraft'
import { parseJsonBody, sendWebResponse } from './_lib/vercelHandler'
import type { ReviewDraftRequest } from '../src/types/reviewDraft'

export const config = {
  maxDuration: 120,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const response = await handleReviewDraftRequest(parseJsonBody(req.body) as ReviewDraftRequest)
    await sendWebResponse(res, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout bij review.'
    res.status(500).json({ error: message })
  }
}
