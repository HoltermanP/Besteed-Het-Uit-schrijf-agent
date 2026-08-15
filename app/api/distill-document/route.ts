import { handleDistillDocumentRequest } from '@api-lib/distillDocument'
import type { DistillDocumentRequest } from '@/types/distillDocument'

export const maxDuration = 120

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as DistillDocumentRequest
    return await handleDistillDocumentRequest(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout.'
    return Response.json({ error: message }, { status: 500 })
  }
}
