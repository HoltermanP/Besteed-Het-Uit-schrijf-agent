import { handleExtractRequirementsRequest } from '@api-lib/extractRequirements'
import type { ExtractRequirementsRequest } from '@/types/extractRequirements'

export const maxDuration = 120

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as ExtractRequirementsRequest
    return await handleExtractRequirementsRequest(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout.'
    return Response.json({ error: message }, { status: 500 })
  }
}
