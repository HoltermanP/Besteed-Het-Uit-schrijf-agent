const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json', '.html', '.htm'])

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  return index >= 0 ? fileName.slice(index).toLowerCase() : ''
}

function normalizeText(text: string): string {
  return text.replace(/\u0000/g, '').replace(/\r/g, '').trim()
}

// De parsers worden lazy geladen: ze staan in serverExternalPackages (bundelen breekt
// de pdfjs-assets van pdf-parse) en een import-probleem mag nooit de hele route
// platleggen — dan faalt alleen de extractie met een nette foutmelding.
async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return normalizeText(result.text)
  } finally {
    await parser.destroy()
  }
}

async function extractOfficeText(buffer: Buffer): Promise<string> {
  const { OfficeParser } = await import('officeparser')
  const ast = await OfficeParser.parseOffice(buffer)
  return normalizeText(ast.toText())
}

const LEGACY_EXTENSIONS: Record<string, string> = {
  '.doc': '.docx',
  '.xls': '.xlsx',
  '.ppt': '.pptx',
}

export async function extractDocumentText(fileName: string, buffer: Buffer): Promise<string> {
  const extension = extensionOf(fileName)

  if (LEGACY_EXTENSIONS[extension]) {
    throw new Error(
      `"${fileName}" gebruikt het oude Office-formaat (${extension}). Open het bestand en sla het op als ${LEGACY_EXTENSIONS[extension]} (of PDF) en upload opnieuw.`,
    )
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    const text = normalizeText(buffer.toString('utf8'))
    if (!text) throw new Error('Bestand bevat geen leesbare tekst.')
    return text
  }

  if (extension === '.pdf') {
    try {
      const text = await extractPdfText(buffer)
      if (text.length >= 20) return text
      throw new Error(
        `PDF "${fileName}" bevat te weinig leesbare tekst. Gebruik een doorzoekbare PDF, of exporteer als Word/txt.`,
      )
    } catch (error) {
      if (error instanceof Error && error.message.includes('te weinig')) throw error
      throw new Error(
        `Kon PDF "${fileName}" niet uitlezen. Controleer of het bestand niet beveiligd is en probeer opnieuw.`,
      )
    }
  }

  try {
    const text = await extractOfficeText(buffer)
    if (text.length >= 20) return text
  } catch {
    // fallback below
  }

  throw new Error(
    `Kon geen tekst uit "${fileName}" halen. Ondersteund: PDF, Word, PowerPoint, Excel en platte tekst.`,
  )
}

export function validateStyleFileName(fileName: string): void {
  const extension = extensionOf(fileName)
  const allowed = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.md', '.csv', '.html', '.htm']
  if (!allowed.includes(extension)) {
    throw new Error(`Bestandstype ${extension || 'onbekend'} wordt niet ondersteund.`)
  }
}
