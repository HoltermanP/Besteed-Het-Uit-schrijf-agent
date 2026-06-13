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

export async function readFileContent(file: File): Promise<ExtractTextResponse> {
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
  const data = (await response.json()) as ExtractTextResponse | ExtractTextError
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : `Kon "${file.name}" niet uitlezen.`)
  }
  return data
}
