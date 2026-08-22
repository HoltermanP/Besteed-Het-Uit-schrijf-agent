import { handleAnalyzeIntentRequest } from '@api-lib/analyzeIntent'
import type { AnalyzeIntentRequest } from '@/types/analyzeIntent'
import { withUsageContext } from '@api-lib/usageContext'

export const maxDuration = 120

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as AnalyzeIntentRequest
    return await withUsageContext(request, () => handleAnalyzeIntentRequest(body))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout.'
    return Response.json({ error: message }, { status: 500 })
  }
}
