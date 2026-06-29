import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleCompareProjectsRequest } from './_lib/compareProjects'
import { parseJsonBody, sendWebResponse } from './_lib/vercelHandler'
import type { CompareProjectsRequest } from '../src/types/compareProjects'

export const config = {
  maxDuration: 120,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = parseJsonBody(req.body) as CompareProjectsRequest
    const response = await handleCompareProjectsRequest(body)
    await sendWebResponse(res, response)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Interne serverfout bij projectvergelijking.'
    res.status(500).json({ error: message })
  }
}
