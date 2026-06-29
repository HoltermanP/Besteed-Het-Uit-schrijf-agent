import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleSelectLessonsRequest } from './_lib/selectLessons'
import { parseJsonBody, sendWebResponse } from './_lib/vercelHandler'
import type { SelectLessonsRequest } from '../src/types/lessonLearned'

export const config = {
  maxDuration: 90,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = parseJsonBody(req.body) as SelectLessonsRequest
    const response = await handleSelectLessonsRequest(body)
    await sendWebResponse(res, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout bij leerpunt-selectie.'
    res.status(500).json({ error: message })
  }
}
