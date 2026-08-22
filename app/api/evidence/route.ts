import { handleEvidenceBlocksRequest } from '@api-lib/evidenceBlocks'
import { handleSelectEvidenceRequest } from '@api-lib/selectEvidence'
import type { SelectEvidenceRequest } from '@/types/evidenceBlock'
import { withUsageContext } from '@api-lib/usageContext'

// Bewijsbibliotheek: CRUD op de bouwstenen (referenties, cases, cijfers) plus de
// AI-voorselectie via ?action=select, die bepaalt welke bouwstenen bij een stuk horen.
export const maxDuration = 120

async function handle(request: Request): Promise<Response> {
  if (new URL(request.url).searchParams.get('action') === 'select') {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 })
    }
    const body = await request.json().catch(() => ({}))
    return handleSelectEvidenceRequest(body as SelectEvidenceRequest)
  }

  return handleEvidenceBlocksRequest(request)
}

async function run(request: Request) {
  try {
    return await withUsageContext(request, () => handle(request))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout bij de bewijsbibliotheek.'
    return Response.json({ error: message }, { status: 500 })
  }
}

export const GET = run
export const POST = run
export const PUT = run
export const DELETE = run
