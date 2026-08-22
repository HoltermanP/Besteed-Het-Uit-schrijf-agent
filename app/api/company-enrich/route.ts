import { handleCompanyEnrichRequest } from '@api-lib/companyEnrich'
import { withUsageContext } from '@api-lib/usageContext'

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    return await withUsageContext(request, () => handleCompanyEnrichRequest(body))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout.'
    return Response.json({ error: message }, { status: 500 })
  }
}
