import { handleWriteDraftRequest } from '../server/writeDraft'

export const config = {
  runtime: 'nodejs',
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON-body.' }, { status: 400 })
  }

  return handleWriteDraftRequest(body)
}
