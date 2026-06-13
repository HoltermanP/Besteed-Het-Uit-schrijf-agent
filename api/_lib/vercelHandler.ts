import { buffer } from 'node:stream/consumers'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export function parseJsonBody(body: unknown): unknown {
  if (body === undefined || body === null) return {}
  if (typeof body === 'string') {
    const trimmed = body.trim()
    if (!trimmed) return {}
    return JSON.parse(trimmed)
  }
  return body
}

function headersFromReq(req: VercelRequest): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue
    headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }
  return headers
}

export async function createRequestFromVercel(req: VercelRequest): Promise<Request> {
  const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'
  const host = req.headers.host ?? 'localhost'
  const url = `${protocol}://${host}${req.url ?? ''}`

  if (req.method === 'GET' || req.method === 'HEAD') {
    return new Request(url, { method: req.method, headers: headersFromReq(req) })
  }

  const rawBody = await buffer(req)
  return new Request(url, {
    method: req.method,
    headers: headersFromReq(req),
    body: rawBody.length ? rawBody : undefined,
  })
}

export async function sendWebResponse(res: VercelResponse, response: Response) {
  const body = await response.text()
  res.status(response.status)
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'content-encoding') return
    res.setHeader(key, value)
  })
  res.send(body)
}

export async function runWebHandler(req: VercelRequest, res: VercelResponse, handler: (request: Request) => Promise<Response>) {
  try {
    const request = await createRequestFromVercel(req)
    const response = await handler(request)
    await sendWebResponse(res, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout.'
    res.status(500).json({ error: message })
  }
}
