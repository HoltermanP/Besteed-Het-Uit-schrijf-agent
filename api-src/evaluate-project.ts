import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleEvaluateProjectRequest } from './_lib/evaluateProject'
import { parseJsonBody, sendWebResponse } from './_lib/vercelHandler'
import type { EvaluateProjectRequest } from '../src/types/lessonLearned'

export const config = {
  maxDuration: 120,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = parseJsonBody(req.body) as EvaluateProjectRequest
    const response = await handleEvaluateProjectRequest(body)
    await sendWebResponse(res, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout bij projectevaluatie.'
    res.status(500).json({ error: message })
  }
}
