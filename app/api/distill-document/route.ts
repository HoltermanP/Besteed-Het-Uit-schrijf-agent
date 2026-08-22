import { handleDistillDocumentRequest } from '@api-lib/distillDocument'
import type { DistillDocumentRequest } from '@/types/distillDocument'
import { withUsageContext } from '@api-lib/usageContext'

export const maxDuration = 120

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as DistillDocumentRequest
    return await withUsageContext(request, () => handleDistillDocumentRequest(body))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout.'
    return Response.json({ error: message }, { status: 500 })
  }
}
