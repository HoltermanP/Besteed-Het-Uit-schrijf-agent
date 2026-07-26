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

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  return index >= 0 ? fileName.slice(index).toLowerCase() : ''
}

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

export async function readFileContent(file: File): Promise<ExtractTextResponse> {
  if (file.size > MAX_UPLOAD_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
    throw new Error(`is te groot (${sizeMb} MB, max. 4 MB) — comprimeer de PDF of splits het document`)
  }

  if (TEXT_EXTENSIONS.has(extensionOf(file.name))) {
    const text = (await file.text()).trim()
    if (!text) throw new Error(`"${file.name}" bevat geen leesbare tekst.`)
    return {
      fileName: file.name,
      text,
      words: text.split(/\s+/).filter(Boolean).length,
      chars: text.length,
    }
  }

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
