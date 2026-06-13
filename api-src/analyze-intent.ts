import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleAnalyzeIntentRequest } from './_lib/analyzeIntent'
import { parseJsonBody, sendWebResponse } from './_lib/vercelHandler'
import type { AnalyzeIntentRequest } from '../src/types/analyzeIntent'

export const config = {
  maxDuration: 120,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const response = await handleAnalyzeIntentRequest(parseJsonBody(req.body) as AnalyzeIntentRequest)
    await sendWebResponse(res, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout bij intent-analyse.'
    res.status(500).json({ error: message })
  }
}
