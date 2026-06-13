import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleCompanyEnrichRequest } from './_lib/companyEnrich'
import { parseJsonBody, sendWebResponse } from './_lib/vercelHandler'

export const config = {
  maxDuration: 60,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const response = await handleCompanyEnrichRequest(parseJsonBody(req.body))
    await sendWebResponse(res, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout bij ophalen van bedrijfsgegevens.'
    res.status(500).json({ error: message })
  }
}
