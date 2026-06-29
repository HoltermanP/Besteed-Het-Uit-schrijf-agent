import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleLessonsLearnedRequest } from './_lib/lessonsLearned'
import { createRequestFromVercel, sendWebResponse } from './_lib/vercelHandler'

export const config = {
  maxDuration: 30,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const request = await createRequestFromVercel(req)
    const response = await handleLessonsLearnedRequest(request)
    await sendWebResponse(res, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout bij lessons learned.'
    res.status(500).json({ error: message })
  }
}
