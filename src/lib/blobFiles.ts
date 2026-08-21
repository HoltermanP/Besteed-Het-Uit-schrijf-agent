// Links naar originele documenten in de Blob-store. Public blobs zijn rechtstreeks te
// openen; private blobs alleen via de server (/api/blob-file), die het token toevoegt.

const PRIVATE_HOST = /^[a-z0-9]+\.private\.blob\.vercel-storage\.com$/

export function blobViewUrl(fileUrl: string): string {
  try {
    if (PRIVATE_HOST.test(new URL(fileUrl).hostname)) {
      return `/api/blob-file?url=${encodeURIComponent(fileUrl)}`
    }
  } catch {
    // Geen geldige URL: geef door zoals die is.
  }
  return fileUrl
}
