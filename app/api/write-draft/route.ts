import { handleWriteDraftRequest } from '@api-lib/writeDraft'
import type { WriteDraftRequest } from '@/types/writeDraft'

export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as WriteDraftRequest
    // Bij body.stream levert de handler een SSE-stream; die kan hier direct terug.
    return await handleWriteDraftRequest(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout bij genereren.'
    return Response.json({ error: message }, { status: 500 })
  }
}
