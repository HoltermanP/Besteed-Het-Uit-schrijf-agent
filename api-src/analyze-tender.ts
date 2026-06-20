import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleAnalyzeTenderRequest } from './_lib/analyzeTender'
import { parseJsonBody, sendWebResponse } from './_lib/vercelHandler'
import type { AnalyzeTenderRequest } from '../src/types/analyzeTender'

export const config = {
  maxDuration: 120,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const response = await handleAnalyzeTenderRequest(parseJsonBody(req.body) as AnalyzeTenderRequest)
    await sendWebResponse(res, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout bij uitvraag-analyse.'
    res.status(500).json({ error: message })
  }
}
