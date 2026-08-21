import { del, list, put } from '@vercel/blob'

// Gedeelde toegang tot de Vercel Blob-store waarin originele documenten worden bewaard.
//
// Een Blob-store is bij aanmaak óf public óf private; een put/upload met de verkeerde
// access-modus wordt geweigerd ("Cannot use public access on a private store"). De SDK
// classificeert die fout als "unknown_error" en retryt standaard 10× met exponentiële
// backoff — minutenlang — waardoor uploads leken te hangen. Daarom: (1) retries
// server-side begrenzen en (2) de modus van de store automatisch bepalen.

export type BlobAccess = 'public' | 'private'

if (!process.env.VERCEL_BLOB_RETRIES) {
  process.env.VERCEL_BLOB_RETRIES = '2'
}

const PROBE_PATHNAME = '_systeem/store-probe.txt'

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim())
}

function parseAccess(value: string | undefined): BlobAccess | null {
  const normalized = value?.trim().toLowerCase()
  return normalized === 'public' || normalized === 'private' ? normalized : null
}

/** Leid de access-modus af uit een blob-URL (`<store>.public.blob…` of `<store>.private.blob…`). */
export function accessFromBlobUrl(url: string): BlobAccess | null {
  try {
    const host = new URL(url).hostname
    const match = /^[a-z0-9]+\.(public|private)\.blob\.vercel-storage\.com$/.exec(host)
    return match ? (match[1] as BlobAccess) : null
  } catch {
    return null
  }
}

function isWrongAccessError(error: unknown, attempted: BlobAccess): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const other = attempted === 'public' ? 'private' : 'public'
  return new RegExp(`${other} store`, 'i').test(message)
}

let detected: Promise<BlobAccess> | null = null

async function detect(): Promise<BlobAccess> {
  // 1. Expliciete configuratie wint altijd.
  const configured = parseAccess(process.env.BLOB_ACCESS)
  if (configured) return configured

  // 2. Bestaande blobs verraden de modus via hun hostnaam.
  const existing = await list({ limit: 1 })
  const fromUrl = existing.blobs[0] ? accessFromBlobUrl(existing.blobs[0].url) : null
  if (fromUrl) return fromUrl

  // 3. Lege store: één kleine proef-upload, daarna weer opgeruimd.
  try {
    const probe = await put(PROBE_PATHNAME, 'probe', { access: 'public', addRandomSuffix: true })
    await del(probe.url).catch(() => undefined)
    return 'public'
  } catch (error) {
    if (isWrongAccessError(error, 'public')) return 'private'
    throw error
  }
}

/** Access-modus van de geconfigureerde store; eenmalig bepaald per serverinstantie. */
export function detectBlobAccess(): Promise<BlobAccess> {
  if (!detected) {
    detected = detect().catch((error: unknown) => {
      // Mislukte detectie niet cachen, zodat een volgend verzoek het opnieuw probeert.
      detected = null
      throw error
    })
  }
  return detected
}

/**
 * Bewaar een origineel in de store. Geeft de blob-URL terug, of undefined als er geen
 * store is geconfigureerd of de upload mislukt — het document blijft dan bruikbaar,
 * alleen zonder "Openen"-link.
 */
export async function archiveToBlob(
  pathname: string,
  body: Buffer | Blob | string,
  contentType?: string,
): Promise<string | undefined> {
  if (!isBlobConfigured()) return undefined
  try {
    const access = await detectBlobAccess()
    const blob = await put(pathname, body, {
      access,
      addRandomSuffix: true,
      ...(contentType ? { contentType } : {}),
    })
    return blob.url
  } catch {
    return undefined
  }
}
