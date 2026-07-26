type ExtractTextResponse = {
  fileName: string
  text: string
  words: number
  chars: number
}

type ExtractTextError = {
  error: string
}

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json', '.html', '.htm'])

// Uploads naar de server zijn op Vercel begrensd (~4,5 MB per request). PDF's lezen
// we daarom eerst in de browser zelf uit (geen limiet); alleen gescande PDF's gaan
// alsnog naar de server voor OCR.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const MAX_PDF_BYTES = 50 * 1024 * 1024

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  return index >= 0 ? fileName.slice(index).toLowerCase() : ''
}

function toResponse(fileName: string, text: string): ExtractTextResponse {
  return {
    fileName,
    text,
    words: text.split(/\s+/).filter(Boolean).length,
    chars: text.length,
  }
}

// PDF lokaal uitlezen met pdfjs (zelfde engine als de server gebruikt).
async function extractPdfInBrowser(file: File): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  try {
    const parts: string[] = []
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber)
      const content = await page.getTextContent()
      parts.push(
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .trim(),
      )
    }
    return { text: parts.join('\n\n').replace(/\u0000/g, '').trim(), pages: doc.numPages }
  } finally {
    await doc.destroy()
  }
}

async function extractViaServer(file: File): Promise<ExtractTextResponse> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch('/api/extract-text', { method: 'POST', body: formData })
  // Bij platformfouten (413 te groot, HTML-foutpagina) is de response geen JSON.
  let data: ExtractTextResponse | ExtractTextError | null = null
  try {
    data = (await response.json()) as ExtractTextResponse | ExtractTextError
  } catch {
    data = null
  }
  if (!response.ok || !data || 'error' in data) {
    if (response.status === 413) {
      throw new Error('is te groot voor de server (max. 4 MB) — comprimeer of splits het document')
    }
    throw new Error(
      data && 'error' in data ? data.error : `kon niet worden uitgelezen (serverfout ${response.status})`,
    )
  }
  return data
}

export async function readFileContent(file: File): Promise<ExtractTextResponse> {
  const extension = extensionOf(file.name)

  if (TEXT_EXTENSIONS.has(extension)) {
    const text = (await file.text()).trim()
    if (!text) throw new Error(`"${file.name}" bevat geen leesbare tekst.`)
    return toResponse(file.name, text)
  }

  if (extension === '.pdf') {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error('is te groot (max. 50 MB voor PDF) — splits het document')
    }
    let browserResult: { text: string; pages: number } | null = null
    try {
      browserResult = await extractPdfInBrowser(file)
    } catch {
      browserResult = null
    }
    // Genoeg tekst per pagina → tekstlaag aanwezig, klaar zonder server.
    if (browserResult && browserResult.text.length >= Math.max(200, browserResult.pages * 30)) {
      return toResponse(file.name, browserResult.text)
    }
    // Weinig tekst: waarschijnlijk gescand → server-OCR (alleen mogelijk ≤ 4 MB).
    if (file.size > MAX_UPLOAD_BYTES) {
      if (browserResult && browserResult.text.length >= 20) {
        // Beter iets dan niets: geef de gevonden tekst terug.
        return toResponse(file.name, browserResult.text)
      }
      throw new Error(
        'lijkt een gescande PDF en is te groot voor OCR via de server (max. 4 MB) — comprimeer het bestand',
      )
    }
    return extractViaServer(file)
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
    throw new Error(`is te groot (${sizeMb} MB, max. 4 MB) — sla op als PDF of splits het document`)
  }

  return extractViaServer(file)
}
