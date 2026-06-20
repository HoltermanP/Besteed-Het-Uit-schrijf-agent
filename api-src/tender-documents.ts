import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleTenderDocumentsRequest } from './_lib/tenderDocuments'
import { createRequestFromVercel, sendWebResponse } from './_lib/vercelHandler'

export const config = {
  maxDuration: 60,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const request = await createRequestFromVercel(req)
    const response = await handleTenderDocumentsRequest(request)
    await sendWebResponse(res, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout bij documenten ophalen.'
    res.status(500).json({ error: message })
  }
}
