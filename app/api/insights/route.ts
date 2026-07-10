import { handleLessonsLearnedRequest } from '@api-lib/lessonsLearned'
import { handleEvaluateProjectRequest } from '@api-lib/evaluateProject'
import { handleSelectLessonsRequest } from '@api-lib/selectLessons'
import { handleCompareProjectsRequest } from '@api-lib/compareProjects'
import type { EvaluateProjectRequest, SelectLessonsRequest } from '@/types/lessonLearned'
import type { CompareProjectsRequest } from '@/types/compareProjects'

// Gecombineerde "insights"-route: bundelt lessons-learned (CRUD), projectevaluatie,
// leerpunt-selectie en projectvergelijking. De AI-acties worden gekozen via
// ?action=evaluate|select|compare; zonder action draait de lessons-learned-CRUD.
export const maxDuration = 120

async function handle(request: Request): Promise<Response> {
  const action = new URL(request.url).searchParams.get('action') ?? ''

  if (action === 'evaluate' || action === 'select' || action === 'compare') {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 })
    }
    const body = await request.json().catch(() => ({}))
    if (action === 'evaluate') return handleEvaluateProjectRequest(body as EvaluateProjectRequest)
    if (action === 'select') return handleSelectLessonsRequest(body as SelectLessonsRequest)
    return handleCompareProjectsRequest(body as CompareProjectsRequest)
  }

  // Standaard: lessons-learned CRUD (GET / POST / PUT / DELETE).
  return handleLessonsLearnedRequest(request)
}

async function run(request: Request) {
  try {
    return await handle(request)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout bij insights.'
    return Response.json({ error: message }, { status: 500 })
  }
}

export const GET = run
export const POST = run
export const PUT = run
export const DELETE = run
