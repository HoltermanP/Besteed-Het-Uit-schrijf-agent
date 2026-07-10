import { handleCompanyEnrichRequest } from '@api-lib/companyEnrich'

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    return await handleCompanyEnrichRequest(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout.'
    return Response.json({ error: message }, { status: 500 })
  }
}
