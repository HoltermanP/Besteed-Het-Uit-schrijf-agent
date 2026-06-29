import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleLessonsLearnedRequest } from './_lib/lessonsLearned'
import { handleEvaluateProjectRequest } from './_lib/evaluateProject'
import { handleSelectLessonsRequest } from './_lib/selectLessons'
import { handleCompareProjectsRequest } from './_lib/compareProjects'
import { createRequestFromVercel, parseJsonBody, sendWebResponse } from './_lib/vercelHandler'
import type { EvaluateProjectRequest, SelectLessonsRequest } from '../src/types/lessonLearned'
import type { CompareProjectsRequest } from '../src/types/compareProjects'

// Gecombineerde "insights"-functie: bundelt lessons-learned (CRUD), projectevaluatie,
// leerpunt-selectie en projectvergelijking in één serverless function. Zo blijven we
// onder de functielimiet van het Vercel Hobby-plan. De AI-acties worden gekozen via
// ?action=evaluate|select|compare; zonder action draait de lessons-learned-CRUD.
export const config = {
  maxDuration: 120,
}

function readAction(req: VercelRequest): string {
  const value = req.query.action
  if (Array.isArray(value)) return value[0] ?? ''
  return typeof value === 'string' ? value : ''
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = readAction(req)

  try {
    if (action === 'evaluate' || action === 'select' || action === 'compare') {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
      }
      const body = parseJsonBody(req.body)
      let response: Response
      if (action === 'evaluate') {
        response = await handleEvaluateProjectRequest(body as EvaluateProjectRequest)
      } else if (action === 'select') {
        response = await handleSelectLessonsRequest(body as SelectLessonsRequest)
      } else {
        response = await handleCompareProjectsRequest(body as CompareProjectsRequest)
      }
      await sendWebResponse(res, response)
      return
    }

    // Standaard: lessons-learned CRUD (GET / POST / PUT / DELETE).
    const request = await createRequestFromVercel(req)
    const response = await handleLessonsLearnedRequest(request)
    await sendWebResponse(res, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout bij insights.'
    res.status(500).json({ error: message })
  }
}
