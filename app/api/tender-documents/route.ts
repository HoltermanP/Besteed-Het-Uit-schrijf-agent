import { handleTenderDocumentsRequest } from '@api-lib/tenderDocuments'

export const maxDuration = 60

export async function GET(request: Request) {
  try {
    return await handleTenderDocumentsRequest(request)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout.'
    return Response.json({ error: message }, { status: 500 })
  }
}
