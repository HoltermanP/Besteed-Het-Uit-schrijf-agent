import { handleProjectDocumentsRequest } from '@api-lib/projectDocuments'

async function handle(request: Request) {
  try {
    return await handleProjectDocumentsRequest(request)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout.'
    return Response.json({ error: message }, { status: 400 })
  }
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
