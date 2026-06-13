import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handleCompanyEnrichRequest } from './api-src/_lib/companyEnrich'
import { applyDevApiEnv } from './api-src/_lib/devApiEnv'
import { handleStyleDocumentsRequest } from './api-src/_lib/styleDocuments'
import { handleWriteDraftRequest } from './api-src/_lib/writeDraft'

const jsonApiRoutes: Record<string, (body: unknown) => Promise<Response>> = {
  '/api/company-enrich': handleCompanyEnrichRequest,
  '/api/write-draft': handleWriteDraftRequest,
}

async function readNodeBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return chunks.length ? Buffer.concat(chunks) : undefined
}

async function toWebRequest(req: IncomingMessage, url: string): Promise<Request> {
  const body = await readNodeBody(req)
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue
    headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }
  return new Request(`http://localhost${url}`, {
    method: req.method,
    headers,
    body,
  })
}

async function sendWebResponse(res: ServerResponse, response: Response) {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('text/event-stream') && response.body) {
    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'content-encoding') return
      res.setHeader(key, value)
    })
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(Buffer.from(value))
    }
    res.end()
    return
  }

  const payload = await response.text()
  res.statusCode = response.status
  res.setHeader('Content-Type', 'application/json')
  res.end(payload)
}

function serverDevApi(env: Record<string, string>): Plugin {
  return {
    name: 'server-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || req.method === 'OPTIONS') {
          next()
          return
        }

        const isJsonRoute = req.method === 'POST' && jsonApiRoutes[req.url]
        const isStyleRoute = req.url.startsWith('/api/style-documents')

        if (!isJsonRoute && !isStyleRoute) {
          next()
          return
        }

        const restoreEnv = applyDevApiEnv(env)
        try {
          if (isStyleRoute) {
            const response = await handleStyleDocumentsRequest(await toWebRequest(req, req.url))
            await sendWebResponse(res, response)
            return
          }

          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
          const response = await jsonApiRoutes[req.url!](body)
          await sendWebResponse(res, response)
        } catch {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Interne serverfout.' }))
        } finally {
          restoreEnv()
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  return {
    plugins: [react(), serverDevApi(env)],
    envDir: '.',
    server: {
      proxy: {
        '/api/tenderned': {
          target: 'https://www.tenderned.nl',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/tenderned/, '/papi/tenderned-rs-tns'),
        },
      },
    },
    preview: {
      proxy: {
        '/api/tenderned': {
          target: 'https://www.tenderned.nl',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/tenderned/, '/papi/tenderned-rs-tns'),
        },
      },
    },
  }
})
