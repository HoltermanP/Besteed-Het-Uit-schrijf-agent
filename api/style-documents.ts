import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleStyleDocumentsRequest } from '../server/styleDocuments'
import { createRequestFromVercel, sendWebResponse } from '../server/vercelHandler'

export const config = {
  maxDuration: 30,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const request = await createRequestFromVercel(req)
    const response = await handleStyleDocumentsRequest(request)
    await sendWebResponse(res, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout bij stijlbibliotheek.'
    res.status(500).json({ error: message })
  }
}
