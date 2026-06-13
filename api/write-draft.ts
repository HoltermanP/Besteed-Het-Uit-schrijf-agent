import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleWriteDraftRequest } from '../server/writeDraft'
import { sendWebResponse } from '../server/vercelHandler'

export const config = {
  maxDuration: 60,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const response = await handleWriteDraftRequest(req.body ?? {})
    await sendWebResponse(res, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout bij genereren.'
    res.status(500).json({ error: message })
  }
}
