import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleWriteDraftRequest } from './_lib/writeDraft'
import { parseJsonBody, sendWebResponse } from './_lib/vercelHandler'
import type { WriteDraftRequest } from '../src/types/writeDraft'

export const config = {
  maxDuration: 300,
}

async function pipeWebStream(res: VercelResponse, response: Response) {
  res.status(response.status)
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'content-encoding') return
    res.setHeader(key, value)
  })

  if (!response.body) {
    res.end()
    return
  }

  const reader = response.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    res.write(Buffer.from(value))
  }
  res.end()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = parseJsonBody(req.body) as WriteDraftRequest
    const response = await handleWriteDraftRequest(body)

    if (body.stream) {
      await pipeWebStream(res, response)
      return
    }

    await sendWebResponse(res, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout bij genereren.'
    res.status(500).json({ error: message })
  }
}
