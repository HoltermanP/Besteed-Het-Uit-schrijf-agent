import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { StyleDocument, StyleDocumentCategory, StyleDocumentPromptType } from '../../src/types/styleDocument'
import { extractDocumentText, validateStyleFileName } from './extractDocumentText'
import { isDatabaseConfigured, prisma } from './prisma'

const DEV_STORE_PATH = path.join(process.cwd(), '.data', 'style-documents.json')
const MAX_CONTENT_CHARS = 120_000
const MAX_FILE_BYTES = 12 * 1024 * 1024

type StoredStyleDocument = StyleDocument

type DevStore = {
  documents: StoredStyleDocument[]
}

let devStoreCache: DevStore | null = null
let memoryStore: DevStore = { documents: [] }

function useMemoryStore() {
  return process.env.STYLE_DOCS_MEMORY === '1'
}

function mapRecord(record: {
  id: string
  name: string
  fileName: string
  mimeType: string
  category: string
  promptType: string
  content: string
  createdAt: Date
  updatedAt: Date
}): StyleDocument {
  return {
    id: record.id,
    name: record.name,
    fileName: record.fileName,
    mimeType: record.mimeType,
    category: record.category as StyleDocumentCategory,
    promptType: record.promptType as StyleDocumentPromptType,
    content: record.content,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

async function readDevStore(): Promise<DevStore> {
  if (useMemoryStore()) return memoryStore
  if (devStoreCache) return devStoreCache
  try {
    const raw = await readFile(DEV_STORE_PATH, 'utf8')
    devStoreCache = JSON.parse(raw) as DevStore
    return devStoreCache
  } catch {
    devStoreCache = { documents: [] }
    return devStoreCache
  }
}

async function writeDevStore(store: DevStore) {
  if (useMemoryStore()) {
    memoryStore = store
    return
  }
  devStoreCache = store
  await mkdir(path.dirname(DEV_STORE_PATH), { recursive: true })
  await writeFile(DEV_STORE_PATH, JSON.stringify(store, null, 2), 'utf8')
}

function trimContent(content: string): string {
  const normalized = content.trim()
  if (normalized.length <= MAX_CONTENT_CHARS) return normalized
  return `${normalized.slice(0, MAX_CONTENT_CHARS)}\n\n[tekst ingekort voor opslag]`
}

export async function listStyleDocuments(): Promise<StyleDocument[]> {
  if (isDatabaseConfigured()) {
    const records = await prisma.styleDocument.findMany({ orderBy: { createdAt: 'desc' } })
    return records.map(mapRecord)
  }

  const store = await readDevStore()
  return store.documents.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

export async function createStyleDocument(input: {
  name: string
  category: StyleDocumentCategory
  promptType: StyleDocumentPromptType
  fileName: string
  mimeType: string
  buffer: Buffer
}): Promise<StyleDocument> {
  validateStyleFileName(input.fileName)
  if (input.buffer.byteLength > MAX_FILE_BYTES) {
    throw new Error('Bestand is te groot (max. 12 MB).')
  }

  const extracted = trimContent(await extractDocumentText(input.fileName, input.buffer))
  return persistStyleDocument({
    name: input.name.trim() || input.fileName,
    fileName: input.fileName,
    mimeType: input.mimeType || 'application/octet-stream',
    category: input.category,
    promptType: input.promptType,
    content: extracted,
  })
}

export async function createStyleDocumentFromText(input: {
  name: string
  category: StyleDocumentCategory
  promptType: StyleDocumentPromptType
  content: string
}): Promise<StyleDocument> {
  const name = input.name.trim()
  const content = input.content.trim()
  if (!name) throw new Error('Naam is verplicht.')
  if (!content) throw new Error('Inhoud is verplicht.')

  const fileName = `${name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'regel'}.txt`
  validateStyleFileName(fileName)

  return persistStyleDocument({
    name,
    fileName,
    mimeType: 'text/plain',
    category: input.category,
    promptType: input.promptType,
    content: trimContent(content),
  })
}

async function persistStyleDocument(input: {
  name: string
  fileName: string
  mimeType: string
  category: StyleDocumentCategory
  promptType: StyleDocumentPromptType
  content: string
}): Promise<StyleDocument> {
  const now = new Date()

  if (isDatabaseConfigured()) {
    const record = await prisma.styleDocument.create({
      data: {
        name: input.name,
        fileName: input.fileName,
        mimeType: input.mimeType,
        category: input.category,
        promptType: input.promptType,
        content: input.content,
      },
    })
    return mapRecord(record)
  }

  const document: StyleDocument = {
    id: crypto.randomUUID(),
    name: input.name,
    fileName: input.fileName,
    mimeType: input.mimeType,
    category: input.category,
    promptType: input.promptType,
    content: input.content,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }

  const store = await readDevStore()
  store.documents.unshift(document)
  await writeDevStore(store)
  return document
}

export async function updateStyleDocument(input: {
  id: string
  name?: string
  category?: StyleDocumentCategory
  content?: string
}): Promise<StyleDocument> {
  if (!input.id.trim()) throw new Error('Document-id ontbreekt.')

  if (isDatabaseConfigured()) {
    const existing = await prisma.styleDocument.findUnique({ where: { id: input.id } })
    if (!existing) throw new Error('Document niet gevonden.')

    const record = await prisma.styleDocument.update({
      where: { id: input.id },
      data: {
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        ...(input.category ? { category: input.category } : {}),
        ...(input.content !== undefined ? { content: trimContent(input.content) } : {}),
      },
    })
    return mapRecord(record)
  }

  const store = await readDevStore()
  const index = store.documents.findIndex((doc) => doc.id === input.id)
  if (index < 0) throw new Error('Document niet gevonden.')

  const current = store.documents[index]
  const updated: StyleDocument = {
    ...current,
    ...(input.name?.trim() ? { name: input.name.trim() } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(input.content !== undefined ? { content: trimContent(input.content) } : {}),
    updatedAt: new Date().toISOString(),
  }
  store.documents[index] = updated
  await writeDevStore(store)
  return updated
}

export async function deleteStyleDocument(id: string): Promise<void> {
  if (!id.trim()) throw new Error('Document-id ontbreekt.')

  if (isDatabaseConfigured()) {
    await prisma.styleDocument.delete({ where: { id } })
    return
  }

  const store = await readDevStore()
  const next = store.documents.filter((doc) => doc.id !== id)
  if (next.length === store.documents.length) {
    throw new Error('Document niet gevonden.')
  }
  store.documents = next
  await writeDevStore(store)
}

export async function handleStyleDocumentsRequest(request: Request): Promise<Response> {
  try {
    if (request.method === 'GET') {
      const documents = await listStyleDocuments()
      return Response.json({ documents })
    }

    if (request.method === 'POST') {
      const formData = await request.formData()
      const file = formData.get('file')
      const category = String(formData.get('category') ?? 'richtlijnen') as StyleDocumentCategory
      const promptType = String(formData.get('promptType') ?? 'rules') as StyleDocumentPromptType
      const name = String(formData.get('name') ?? '')
      const content = String(formData.get('content') ?? '')

      if (file instanceof File) {
        const buffer = Buffer.from(await file.arrayBuffer())
        const document = await createStyleDocument({
          name: name || file.name,
          category,
          promptType,
          fileName: file.name,
          mimeType: file.type,
          buffer,
        })
        return Response.json({ document }, { status: 201 })
      }

      if (content.trim()) {
        const document = await createStyleDocumentFromText({
          name: name || 'Schrijfregel',
          category,
          promptType,
          content,
        })
        return Response.json({ document }, { status: 201 })
      }

      throw new Error('Geen bestand of tekst ontvangen.')
    }

    if (request.method === 'PUT') {
      const body = (await request.json()) as {
        id?: string
        name?: string
        category?: StyleDocumentCategory
        content?: string
      }
      if (!body.id?.trim()) throw new Error('Document-id ontbreekt.')
      const document = await updateStyleDocument({
        id: body.id,
        name: body.name,
        category: body.category,
        content: body.content,
      })
      return Response.json({ document })
    }

    if (request.method === 'DELETE') {
      const url = new URL(request.url)
      const id = url.searchParams.get('id')
      if (!id) throw new Error('Document-id ontbreekt.')
      await deleteStyleDocument(id)
      return Response.json({ ok: true })
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout bij schrijfstijl-documenten.'
    const status = message.includes('niet gevonden') ? 404 : 400
    return Response.json({ error: message }, { status })
  }
}
