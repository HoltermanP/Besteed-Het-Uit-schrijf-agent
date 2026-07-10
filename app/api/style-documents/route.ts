import { handleStyleDocumentsRequest } from '@api-lib/styleDocuments'

export const maxDuration = 30

async function run(request: Request) {
  try {
    return await handleStyleDocumentsRequest(request)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout.'
    return Response.json({ error: message }, { status: 500 })
  }
}

export const GET = run
export const POST = run
export const PUT = run
export const DELETE = run
