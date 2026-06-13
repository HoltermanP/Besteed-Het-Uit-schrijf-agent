import { OfficeParser } from 'officeparser'

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json'])

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  return index >= 0 ? fileName.slice(index).toLowerCase() : ''
}

function normalizeText(text: string): string {
  return text.replace(/\u0000/g, '').replace(/\r/g, '').trim()
}

export async function extractDocumentText(fileName: string, buffer: Buffer): Promise<string> {
  const extension = extensionOf(fileName)

  if (TEXT_EXTENSIONS.has(extension)) {
    const text = normalizeText(buffer.toString('utf8'))
    if (!text) throw new Error('Bestand bevat geen leesbare tekst.')
    return text
  }

  try {
    const ast = await OfficeParser.parseOffice(buffer)
    const text = normalizeText(ast.toText())
    if (text.length >= 20) return text
  } catch {
    // fallback below
  }

  throw new Error(
    `Kon geen tekst uit ${fileName} halen. Ondersteund: PDF, Word, PowerPoint, Excel en platte tekst.`,
  )
}

export function validateStyleFileName(fileName: string): void {
  const extension = extensionOf(fileName)
  const allowed = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.md', '.csv']
  if (!allowed.includes(extension)) {
    throw new Error(`Bestandstype ${extension || 'onbekend'} wordt niet ondersteund.`)
  }
}
