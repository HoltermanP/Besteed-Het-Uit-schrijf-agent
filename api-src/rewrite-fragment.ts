import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleRewriteFragmentRequest } from './_lib/rewriteFragment'
import { parseJsonBody, sendWebResponse } from './_lib/vercelHandler'

export const config = {
  maxDuration: 120,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const response = await handleRewriteFragmentRequest(parseJsonBody(req.body))
    await sendWebResponse(res, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout bij herschrijven.'
    res.status(500).json({ error: message })
  }
}
