import { unzipSync } from 'fflate'
import { extractDocumentText } from './extractDocumentText'

const TNS_BASE = 'https://www.tenderned.nl'
const TNS_PREFIX = '/papi/tenderned-rs-tns'

// Per-document downloadlimiet: grotere bestanden (vaak tekeningen/CAD in zip) worden overgeslagen.
const MAX_DOC_BYTES = 30 * 1024 * 1024
// Totale tekst die we per aanbesteding bewaren (localStorage-vriendelijk, ruim genoeg voor leidraden).
const MAX_TOTAL_CHARS = 500_000
// Eén document mag het tekstbudget niet volledig opslokken (bv. een grote Excel-NvI-matrix),
// zodat de leidraad én de bijlagen allemaal aan bod komen.
const MAX_PER_DOC_CHARS = 150_000
const MAX_ZIP_ENTRIES = 80
// Veiligheidsmarge onder de serverless maxDuration (60s): stop met nieuwe documenten na 45s.
const EXTRACT_DEADLINE_MS = 45_000

// Extensies waaruit extractDocumentText tekst kan halen.
const TEXT_TYPE_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.txt',
  '.md',
  '.csv',
  '.html',
  '.htm',
  '.json',
])

type RawDoc = {
  documentId?: string
  documentNaam?: string
  typeDocument?: { code?: string; omschrijving?: string }
  publicatieCategorie?: { code?: string; omschrijving?: string }
  grootte?: number
  virusIndicatie?: boolean
  links?: { download?: { href?: string } }
}

type DocStatus = 'ok' | 'leeg' | 'overgeslagen' | 'fout'

type ExtractedDocument = {
  naam: string
  type: string
  categorie: string
  categorieOmschrijving: string
  grootte: number
  chars: number
  status: DocStatus
  note?: string
}

type ExtractResult = { text: string; status: DocStatus; note?: string }

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  return index >= 0 ? fileName.slice(index).toLowerCase() : ''
}

// Verwerkingsvolgorde op relevantie: de leidraad en Nota van Inlichtingen wegen het zwaarst voor
// het schrijven van een plan van aanpak; technische bestekken/tekeningen krijgen lagere prioriteit
// zodat ze het tekstbudget niet opslokken voordat de leidraad aan bod komt.
function documentPriority(naam: string, categorie: string): number {
  const n = naam.toLowerCase()
  if (/leidraad|beschrijvend document|offerteaanvraag|aanbestedingsdocument|aanbestedingsleidraad|selectieleidraad|gunningsleidraad/.test(n)) return 0
  if (categorie === 'NVI' || /nota van inlichtingen|programma van eisen|programma van wensen/.test(n)) return 1
  if (/\bbestek\b|tekening|\braw\b|meetstaat|calculatie|revit|\bdwg\b|\bnlcs\b/.test(n)) return 5
  if (categorie === 'ANK' || /aankondiging/.test(n)) return 3
  return 2
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`
  return `${bytes} B`
}

async function safeExtract(fileName: string, buffer: Buffer): Promise<ExtractResult> {
  if (!TEXT_TYPE_EXTENSIONS.has(extensionOf(fileName))) {
    return { text: '', status: 'overgeslagen', note: 'Geen tekstbestand' }
  }
  try {
    const text = await extractDocumentText(fileName, buffer)
    if (!text.trim()) return { text: '', status: 'leeg', note: 'Geen leesbare tekst' }
    return { text, status: 'ok' }
  } catch (error) {
    return { text: '', status: 'fout', note: error instanceof Error ? error.message : 'Extractie mislukt' }
  }
}

async function extractZip(buffer: Buffer): Promise<ExtractResult> {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(buffer))
  } catch {
    return { text: '', status: 'fout', note: 'Zip kon niet worden uitgepakt' }
  }

  const parts: string[] = []
  let processed = 0
  for (const [innerName, data] of Object.entries(entries)) {
    if (innerName.endsWith('/')) continue
    if (!TEXT_TYPE_EXTENSIONS.has(extensionOf(innerName))) continue
    if (processed >= MAX_ZIP_ENTRIES) break
    processed += 1
    const result = await safeExtract(innerName, Buffer.from(data))
    if (result.text) {
      const label = innerName.split('/').pop() || innerName
      parts.push(`### ${label}\n${result.text}`)
    }
  }

  if (!parts.length) return { text: '', status: 'leeg', note: 'Geen leesbare bestanden in zip' }
  return { text: parts.join('\n\n'), status: 'ok' }
}

async function downloadAndExtract(doc: RawDoc): Promise<ExtractedDocument> {
  const naam = doc.documentNaam?.trim() || doc.documentId || 'Document'
  const type = (doc.typeDocument?.code || extensionOf(naam).replace('.', '') || 'onbekend').toLowerCase()
  const categorie = doc.publicatieCategorie?.code ?? ''
  const categorieOmschrijving = doc.publicatieCategorie?.omschrijving ?? ''
  const grootte = doc.grootte ?? 0
  const base: ExtractedDocument = { naam, type, categorie, categorieOmschrijving, grootte, chars: 0, status: 'ok' }

  // documentNaam mist vaak een extensie of bevat punten in kenmerken (bv. "...GDD.1").
  // typeDocument.code is daarom de betrouwbare bron voor het bestandstype.
  const ext = type !== 'onbekend' ? `.${type}` : extensionOf(naam)
  const fileName = ext && !naam.toLowerCase().endsWith(ext) ? `${naam}${ext}` : naam

  if (doc.virusIndicatie) return { ...base, status: 'overgeslagen', note: 'Virusindicatie' }

  const href = doc.links?.download?.href
  if (!href) return { ...base, status: 'fout', note: 'Geen downloadlink' }

  if (grootte > MAX_DOC_BYTES) {
    return { ...base, status: 'overgeslagen', note: `Te groot (${formatBytes(grootte)})` }
  }

  let buffer: Buffer
  try {
    const url = `${TNS_BASE}${href.startsWith('/') ? href : `/${href}`}`
    const response = await fetch(url)
    if (!response.ok) return { ...base, status: 'fout', note: `Download mislukt (${response.status})` }
    buffer = Buffer.from(await response.arrayBuffer())
  } catch {
    return { ...base, status: 'fout', note: 'Download mislukt' }
  }

  const isZip = type === 'zip' || ext === '.zip'
  const result = isZip ? await extractZip(buffer) : await safeExtract(fileName, buffer)
  return { ...base, status: result.status, note: result.note, chars: result.text.length, text: result.text } as ExtractedDocument & {
    text?: string
  }
}

/** Haalt alle documenten bij een publicatie op, downloadt ze en extraheert tekst (incl. zip-inhoud). */
export async function handleTenderDocumentsRequest(request: Request): Promise<Response> {
  try {
    if (request.method !== 'GET') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 })
    }

    const url = new URL(request.url)
    const publicatieId = url.searchParams.get('publicatieId')?.trim() ?? ''
    if (!/^\d+$/.test(publicatieId)) {
      return Response.json({ error: 'Ongeldige publicatieId.' }, { status: 400 })
    }

    const listResponse = await fetch(`${TNS_BASE}${TNS_PREFIX}/v2/publicaties/${publicatieId}/documenten`, {
      headers: { Accept: 'application/json' },
    })
    if (!listResponse.ok) {
      return Response.json({ error: `Documentenlijst laden mislukt (${listResponse.status}).` }, { status: 502 })
    }

    const data = (await listResponse.json()) as { documenten?: RawDoc[] }

    // Dubbele documenten (zelfde naam + type, bv. herhaalde aankondiging) één keer verwerken.
    const seen = new Set<string>()
    const rawDocs = (data.documenten ?? [])
      .filter((doc) => {
        const key = `${(doc.documentNaam ?? '').toLowerCase().trim()}|${doc.typeDocument?.code ?? ''}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map((doc, index) => ({ doc, index }))
      .sort((a, b) => {
        const pa = documentPriority(a.doc.documentNaam ?? '', a.doc.publicatieCategorie?.code ?? '')
        const pb = documentPriority(b.doc.documentNaam ?? '', b.doc.publicatieCategorie?.code ?? '')
        return pa - pb || a.index - b.index
      })
      .map((entry) => entry.doc)

    const documents: ExtractedDocument[] = []
    const textParts: string[] = []
    let totalChars = 0
    const startedAt = Date.now()

    for (const raw of rawDocs) {
      // Aanbestedingen kunnen tientallen documenten bevatten; stop met downloaden zodra het
      // tekstbudget vol is of de tijdslimiet nadert, zodat de serverless-functie binnen de
      // tijd blijft. De belangrijkste documenten zijn door de prioritering al verwerkt.
      const budgetReached = totalChars >= MAX_TOTAL_CHARS
      const deadlineReached = Date.now() - startedAt > EXTRACT_DEADLINE_MS
      if (budgetReached || deadlineReached) {
        documents.push({
          naam: raw.documentNaam?.trim() || raw.documentId || 'Document',
          type: (raw.typeDocument?.code || 'onbekend').toLowerCase(),
          categorie: raw.publicatieCategorie?.code ?? '',
          categorieOmschrijving: raw.publicatieCategorie?.omschrijving ?? '',
          grootte: raw.grootte ?? 0,
          chars: 0,
          status: 'overgeslagen',
          note: budgetReached ? 'Tekstbudget bereikt' : 'Tijdslimiet bereikt',
        })
        continue
      }

      const extracted = (await downloadAndExtract(raw)) as ExtractedDocument & { text?: string }
      const { text = '', ...meta } = extracted

      if (text) {
        const docLimit = Math.min(MAX_TOTAL_CHARS - totalChars, MAX_PER_DOC_CHARS)
        const slice = text.length > docLimit ? text.slice(0, docLimit) : text
        const header = meta.categorieOmschrijving ? `${meta.naam} — ${meta.categorieOmschrijving}` : meta.naam
        textParts.push(`## ${header}\n${slice}`)
        totalChars += slice.length
        meta.chars = slice.length
        if (slice.length < text.length) meta.note = meta.note ?? `Ingekort tot ${slice.length.toLocaleString('nl-NL')} tekens`
      }

      documents.push(meta)
    }

    return Response.json({
      publicatieId,
      documents,
      combinedText: textParts.join('\n\n'),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Documenten ophalen mislukt.'
    return Response.json({ error: message }, { status: 500 })
  }
}
