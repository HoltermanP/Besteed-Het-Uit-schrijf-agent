import { tryOcrPdf } from './ocrPdf'

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

// Oud binair Word-formaat (.doc, Word 97-2003).
async function extractLegacyWordText(buffer: Buffer): Promise<string> {
  const WordExtractor = (await import('word-extractor')).default
  const extractor = new WordExtractor()
  const doc = await extractor.extract(buffer)
  const parts = [doc.getBody(), doc.getFootnotes(), doc.getEndnotes(), doc.getTextboxes?.()]
  return normalizeText(parts.filter(Boolean).join('\n'))
}

// Excel: leest zowel oud .xls (BIFF) als .xlsx; elke sheet als CSV-tekst.
async function extractExcelText(buffer: Buffer): Promise<string> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  return normalizeText(
    workbook.SheetNames.map(
      (name) => `# ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`,
    ).join('\n\n'),
  )
}

// Oud binair PowerPoint-formaat (.ppt, PowerPoint 97-2003): loop de recordstructuur
// van de "PowerPoint Document"-stream af en verzamel de tekst-atoms.
async function extractLegacyPptText(buffer: Buffer): Promise<string> {
  const CFB = await import('cfb')
  const container = CFB.read(buffer, { type: 'buffer' })
  const entry = CFB.find(container, 'PowerPoint Document')
  if (!entry?.content) throw new Error('Geen PowerPoint-inhoud gevonden.')
  const data = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content as ArrayLike<number>)

  const texts: string[] = []
  let offset = 0
  while (offset + 8 <= data.length) {
    const verInstance = data.readUInt16LE(offset)
    const recType = data.readUInt16LE(offset + 2)
    const recLen = data.readUInt32LE(offset + 4)
    const isContainer = (verInstance & 0x0f) === 0x0f

    if (isContainer) {
      // Containerrecord: kinderen volgen direct na de header.
      offset += 8
      continue
    }

    const end = Math.min(offset + 8 + recLen, data.length)
    if (recType === 0x0fa0) {
      // TextCharsAtom (UTF-16LE)
      texts.push(data.subarray(offset + 8, end).toString('utf16le'))
    } else if (recType === 0x0fa8) {
      // TextBytesAtom (latin1)
      texts.push(data.subarray(offset + 8, end).toString('latin1'))
    }
    offset = end
  }

  return normalizeText(texts.join('\n'))
}

export async function extractDocumentText(fileName: string, buffer: Buffer): Promise<string> {
  const extension = extensionOf(fileName)

  if (TEXT_EXTENSIONS.has(extension)) {
    const text = normalizeText(buffer.toString('utf8'))
    if (!text) throw new Error('Bestand bevat geen leesbare tekst.')
    return text
  }

  if (extension === '.doc') {
    try {
      const text = await extractLegacyWordText(buffer)
      if (text.length >= 20) return text
    } catch {
      // valt door naar de foutmelding hieronder
    }
    throw new Error(
      `Kon "${fileName}" (oud Word-formaat) niet uitlezen. Sla het bestand op als .docx of PDF en probeer opnieuw.`,
    )
  }

  if (extension === '.xls' || extension === '.xlsx') {
    try {
      const text = await extractExcelText(buffer)
      if (text.length >= 5) return text
    } catch {
      // .xlsx krijgt hieronder nog een kans via officeparser
    }
    if (extension === '.xls') {
      throw new Error(`Kon "${fileName}" (Excel) niet uitlezen. Sla het bestand op als .xlsx en probeer opnieuw.`)
    }
  }

  if (extension === '.ppt') {
    try {
      const text = await extractLegacyPptText(buffer)
      if (text.length >= 20) return text
    } catch {
      // valt door naar de foutmelding hieronder
    }
    throw new Error(
      `Kon "${fileName}" (oud PowerPoint-formaat) niet uitlezen. Sla het bestand op als .pptx of PDF en probeer opnieuw.`,
    )
  }

  if (extension === '.pdf') {
    let text = ''
    try {
      text = await extractPdfText(buffer)
    } catch {
      text = ''
    }
    if (text.length >= 20) return text

    // Weinig of geen tekstlaag: waarschijnlijk een gescande PDF — probeer OCR via AI.
    const ocr = await tryOcrPdf(buffer)
    if (ocr === null) {
      throw new Error(
        `"${fileName}" lijkt een gescande PDF zonder tekstlaag. OCR vereist een geconfigureerde AI-sleutel op de server (ANTHROPIC_API_KEY).`,
      )
    }
    if (ocr.length >= 20) return normalizeText(ocr)
    throw new Error(
      `Kon PDF "${fileName}" niet uitlezen, ook niet via OCR. Controleer of het bestand niet beveiligd of leeg is.`,
    )
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
