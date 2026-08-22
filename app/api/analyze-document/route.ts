import { handleAnalyzeDocumentRequest } from '@api-lib/analyzeDocument'
import type { AnalyzeDocumentRequest } from '@/types/analyzeDocument'
import { withUsageContext } from '@api-lib/usageContext'

export const maxDuration = 120

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as AnalyzeDocumentRequest
    return await withUsageContext(request, () => handleAnalyzeDocumentRequest(body))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout.'
    return Response.json({ error: message }, { status: 500 })
  }
}
