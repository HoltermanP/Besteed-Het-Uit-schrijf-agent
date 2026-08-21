import { get } from '@vercel/blob'
import { accessFromBlobUrl, isBlobConfigured } from './blobStore'

// Origineel document uit de Blob-store doorgeven aan de browser. Nodig voor private
// stores: die URL's zijn niet rechtstreeks te openen, alleen met het servertoken.
// Werkt ook voor public blobs, zodat de UI één soort link kan gebruiken.

function fileNameFromPathname(pathname: string): string {
  const base = pathname.split('/').pop() ?? 'document'
  // addRandomSuffix plakt "-<willekeurig>" vóór de extensie; haal dat weg voor de downloadnaam.
  return base.replace(/-[A-Za-z0-9]{20,}(\.[A-Za-z0-9]+)$/, '$1')
}

export async function handleBlobFileRequest(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }
  if (!isBlobConfigured()) {
    return Response.json({ error: 'Documentarchief niet geconfigureerd.' }, { status: 503 })
  }

  const requestUrl = new URL(request.url)
  const target = requestUrl.searchParams.get('url') ?? ''
  const access = accessFromBlobUrl(target)
  if (!access) {
    return Response.json({ error: 'Ongeldige document-URL.' }, { status: 400 })
  }

  const result = await get(target, { access })
  if (!result || result.statusCode !== 200) {
    return Response.json({ error: 'Document niet gevonden in het archief.' }, { status: 404 })
  }

  const headers = new Headers()
  const contentType = result.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)
  const length = result.headers.get('content-length')
  if (length) headers.set('content-length', length)
  const disposition = requestUrl.searchParams.get('download') ? 'attachment' : 'inline'
  const fileName = fileNameFromPathname(result.blob.pathname)
  headers.set(
    'content-disposition',
    `${disposition}; filename="${fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  )
  headers.set('cache-control', 'private, max-age=3600')
  return new Response(result.stream, { status: 200, headers })
}
