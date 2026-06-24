import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { handleAnalyzeIntentRequest } from './api-src/_lib/analyzeIntent'
import { handleAnalyzeTenderRequest } from './api-src/_lib/analyzeTender'
import { handleCompanyEnrichRequest } from './api-src/_lib/companyEnrich'
import { applyDevApiEnv } from './api-src/_lib/devApiEnv'
import { handleExtractTextRequest } from './api-src/_lib/extractText'
import { handleStyleDocumentsRequest } from './api-src/_lib/styleDocuments'
import { handleTenderDocumentsRequest } from './api-src/_lib/tenderDocuments'
import { handleWriteDraftRequest } from './api-src/_lib/writeDraft'
import { handleReviewDraftRequest } from './api-src/_lib/reviewDraft'
import { handleRewriteFragmentRequest } from './api-src/_lib/rewriteFragment'
import { getWriterStatusPayload } from './api-src/_lib/writerStatus'
import type { AnalyzeIntentRequest } from './src/types/analyzeIntent'
import type { AnalyzeTenderRequest } from './src/types/analyzeTender'
import type { ReviewDraftRequest } from './src/types/reviewDraft'

const jsonApiRoutes: Record<string, (body: unknown) => Promise<Response>> = {
  '/api/analyze-intent': (body) => handleAnalyzeIntentRequest(body as AnalyzeIntentRequest),
  '/api/analyze-tender': (body) => handleAnalyzeTenderRequest(body as AnalyzeTenderRequest),
  '/api/company-enrich': handleCompanyEnrichRequest,
  '/api/write-draft': handleWriteDraftRequest,
  '/api/review-draft': (body) => handleReviewDraftRequest(body as ReviewDraftRequest),
  '/api/rewrite-fragment': handleRewriteFragmentRequest,
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
        const isExtractRoute = req.url === '/api/extract-text' && req.method === 'POST'
        const isTenderDocsRoute = req.url.startsWith('/api/tender-documents') && req.method === 'GET'
        const isWriterStatusRoute = req.url === '/api/writer-status' && req.method === 'GET'

        if (!isJsonRoute && !isStyleRoute && !isExtractRoute && !isTenderDocsRoute && !isWriterStatusRoute) {
          next()
          return
        }

        const restoreEnv = applyDevApiEnv(env)
        try {
          if (isWriterStatusRoute) {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(getWriterStatusPayload()))
            return
          }

          if (isStyleRoute) {
            const response = await handleStyleDocumentsRequest(await toWebRequest(req, req.url))
            await sendWebResponse(res, response)
            return
          }

          if (isExtractRoute) {
            const response = await handleExtractTextRequest(await toWebRequest(req, req.url))
            await sendWebResponse(res, response)
            return
          }

          if (isTenderDocsRoute) {
            const response = await handleTenderDocumentsRequest(await toWebRequest(req, req.url))
            await sendWebResponse(res, response)
            return
          }

          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
          const response = await jsonApiRoutes[req.url!](body)
          await sendWebResponse(res, response)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Interne serverfout.'
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: message }))
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
    // De docx-library (en jszip) verwijzen naar Node-globals (global, Buffer, process)
    // die in de productiebuild ontbreken — daardoor reageerde de Word-export niet in
    // productie. nodePolyfills levert die globals voor de browser.
    plugins: [
      react(),
      tailwindcss(),
      nodePolyfills({ globals: { Buffer: true, global: true, process: true } }),
      serverDevApi(env),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
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
