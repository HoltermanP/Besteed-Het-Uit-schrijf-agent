import { OfficeParser } from 'officeparser'
import { PDFParse } from 'pdf-parse'

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json', '.html', '.htm'])

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  return index >= 0 ? fileName.slice(index).toLowerCase() : ''
}

function normalizeText(text: string): string {
  return text.replace(/\u0000/g, '').replace(/\r/g, '').trim()
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return normalizeText(result.text)
  } finally {
    await parser.destroy()
  }
}

async function extractOfficeText(buffer: Buffer): Promise<string> {
  const ast = await OfficeParser.parseOffice(buffer)
  return normalizeText(ast.toText())
}

export async function extractDocumentText(fileName: string, buffer: Buffer): Promise<string> {
  const extension = extensionOf(fileName)

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
