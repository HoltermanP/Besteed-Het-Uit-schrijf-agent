import { handleAnalyzeTenderRequest } from '@api-lib/analyzeTender'
import type { AnalyzeTenderRequest } from '@/types/analyzeTender'
import { withUsageContext } from '@api-lib/usageContext'

export const maxDuration = 120

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as AnalyzeTenderRequest
    return await withUsageContext(request, () => handleAnalyzeTenderRequest(body))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout.'
    return Response.json({ error: message }, { status: 500 })
  }
}
