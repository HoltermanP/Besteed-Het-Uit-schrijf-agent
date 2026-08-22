import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  EvidenceBlock,
  EvidenceBlockInput,
  EvidenceBlockPatch,
  EvidenceKind,
} from '../../src/types/evidenceBlock'
import { isDatabaseConfigured, prisma } from './prisma'

/*
 * Opslag van de bewijsbibliotheek. Zelfde opzet als lessons learned: Neon wanneer er een
 * DATABASE_URL is, anders een dev-store op schijf (of in het geheugen tijdens tests).
 */

const DEV_STORE_PATH = path.join(process.cwd(), '.data', 'evidence-blocks.json')
const MAX_TEXT_CHARS = 8_000
const DEFAULT_COMPANY_ID = 'default'

type StoredEvidenceBlock = EvidenceBlock & { companyId?: string }

type DevStore = {
  blocks: StoredEvidenceBlock[]
}

let devStoreCache: DevStore | null = null
let memoryStore: DevStore = { blocks: [] }

function memoryStoreEnabled() {
  return process.env.EVIDENCE_MEMORY === '1'
}

const VALID_KINDS: EvidenceKind[] = ['referentie', 'case', 'cijfer']

function normalizeKind(value: unknown): EvidenceKind {
  return VALID_KINDS.includes(value as EvidenceKind) ? (value as EvidenceKind) : 'referentie'
}

function trimText(value: string, max = MAX_TEXT_CHARS): string {
  const normalized = value.trim()
  return normalized.length > max ? `${normalized.slice(0, max).trim()}…` : normalized
}

/** Datums worden als YYYY-MM-DD bewaard; alles wat daar niet op lijkt vervalt naar null. */
function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null
}

function optional(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimText(trimmed, max) : null
}

function mapRecord(record: {
  id: string
  kind: string
  title: string
  client: string | null
  period: string | null
  category: string | null
  situation: string
  claim: string
  result: string
  value: string | null
  unit: string | null
  proof: string
  verifiedOn: string | null
  validUntil: string | null
  createdAt: Date
  updatedAt: Date
}): EvidenceBlock {
  return {
    id: record.id,
    kind: normalizeKind(record.kind),
    title: record.title,
    client: record.client,
    period: record.period,
    category: record.category,
    situation: record.situation,
    claim: record.claim,
    result: record.result,
    value: record.value,
    unit: record.unit,
    proof: record.proof,
    verifiedOn: record.verifiedOn,
    validUntil: record.validUntil,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

async function readDevStore(): Promise<DevStore> {
  if (memoryStoreEnabled()) return memoryStore
  if (devStoreCache) return devStoreCache
  try {
    const raw = await readFile(DEV_STORE_PATH, 'utf8')
    devStoreCache = JSON.parse(raw) as DevStore
    return devStoreCache
  } catch {
    devStoreCache = { blocks: [] }
    return devStoreCache
  }
}

async function writeDevStore(store: DevStore) {
  if (memoryStoreEnabled()) {
    memoryStore = store
    return
  }
  devStoreCache = store
  await mkdir(path.dirname(DEV_STORE_PATH), { recursive: true })
  await writeFile(DEV_STORE_PATH, JSON.stringify(store, null, 2), 'utf8')
}

function sanitizeInput(input: EvidenceBlockInput) {
  const title = input.title?.trim()
  const claim = input.claim?.trim()
  if (!title) throw new Error('Een bouwsteen heeft een titel nodig.')
  if (!claim) throw new Error('Leg vast welk feit deze bouwsteen bewijst.')

  return {
    kind: normalizeKind(input.kind),
    title: trimText(title, 300),
    client: optional(input.client, 300),
    period: optional(input.period, 120),
    category: optional(input.category, 120),
    situation: trimText(input.situation ?? ''),
    claim: trimText(claim),
    result: trimText(input.result ?? ''),
    value: optional(input.value, 60),
    unit: optional(input.unit, 40),
    proof: trimText(input.proof ?? ''),
    verifiedOn: normalizeDate(input.verifiedOn),
    validUntil: normalizeDate(input.validUntil),
  }
}

export async function listEvidenceBlocks(companyId = DEFAULT_COMPANY_ID): Promise<EvidenceBlock[]> {
  if (isDatabaseConfigured()) {
    const records = await prisma.evidenceBlock.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    })
    return records.map(mapRecord)
  }

  const store = await readDevStore()
  return store.blocks
    .filter((item) => (item.companyId ?? DEFAULT_COMPANY_ID) === companyId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function createEvidenceBlock(
  rawInput: EvidenceBlockInput,
  companyId = DEFAULT_COMPANY_ID,
): Promise<EvidenceBlock> {
  const input = sanitizeInput(rawInput)

  if (isDatabaseConfigured()) {
    const record = await prisma.evidenceBlock.create({ data: { companyId, ...input } })
    return mapRecord(record)
  }

  const now = new Date().toISOString()
  const block: StoredEvidenceBlock = {
    id: crypto.randomUUID(),
    companyId,
    ...input,
    createdAt: now,
    updatedAt: now,
  }
  const store = await readDevStore()
  store.blocks.unshift(block)
  await writeDevStore(store)
  return block
}

export async function updateEvidenceBlock(
  input: EvidenceBlockPatch & { companyId?: string },
): Promise<EvidenceBlock> {
  if (!input.id?.trim()) throw new Error('Bouwsteen-id ontbreekt.')
  const companyId = input.companyId || DEFAULT_COMPANY_ID

  const data = {
    ...(input.kind ? { kind: normalizeKind(input.kind) } : {}),
    ...(input.title?.trim() ? { title: trimText(input.title, 300) } : {}),
    ...(input.client !== undefined ? { client: optional(input.client, 300) } : {}),
    ...(input.period !== undefined ? { period: optional(input.period, 120) } : {}),
    ...(input.category !== undefined ? { category: optional(input.category, 120) } : {}),
    ...(input.situation !== undefined ? { situation: trimText(input.situation) } : {}),
    ...(input.claim?.trim() ? { claim: trimText(input.claim) } : {}),
    ...(input.result !== undefined ? { result: trimText(input.result) } : {}),
    ...(input.value !== undefined ? { value: optional(input.value, 60) } : {}),
    ...(input.unit !== undefined ? { unit: optional(input.unit, 40) } : {}),
    ...(input.proof !== undefined ? { proof: trimText(input.proof) } : {}),
    ...(input.verifiedOn !== undefined ? { verifiedOn: normalizeDate(input.verifiedOn) } : {}),
    ...(input.validUntil !== undefined ? { validUntil: normalizeDate(input.validUntil) } : {}),
  }

  if (isDatabaseConfigured()) {
    const existing = await prisma.evidenceBlock.findFirst({ where: { id: input.id, companyId } })
    if (!existing) throw new Error('Bouwsteen niet gevonden.')
    const record = await prisma.evidenceBlock.update({ where: { id: input.id }, data })
    return mapRecord(record)
  }

  const store = await readDevStore()
  const index = store.blocks.findIndex(
    (item) => item.id === input.id && (item.companyId ?? DEFAULT_COMPANY_ID) === companyId,
  )
  if (index < 0) throw new Error('Bouwsteen niet gevonden.')
  const updated: StoredEvidenceBlock = {
    ...store.blocks[index],
    ...data,
    updatedAt: new Date().toISOString(),
  }
  store.blocks[index] = updated
  await writeDevStore(store)
  return updated
}

export async function deleteEvidenceBlock(id: string, companyId = DEFAULT_COMPANY_ID): Promise<void> {
  if (!id?.trim()) throw new Error('Bouwsteen-id ontbreekt.')

  if (isDatabaseConfigured()) {
    const { count } = await prisma.evidenceBlock.deleteMany({ where: { id, companyId } })
    if (!count) throw new Error('Bouwsteen niet gevonden.')
    return
  }

  const store = await readDevStore()
  const next = store.blocks.filter(
    (item) => !(item.id === id && (item.companyId ?? DEFAULT_COMPANY_ID) === companyId),
  )
  if (next.length === store.blocks.length) throw new Error('Bouwsteen niet gevonden.')
  store.blocks = next
  await writeDevStore(store)
}

export async function handleEvidenceBlocksRequest(request: Request): Promise<Response> {
  try {
    if (request.method === 'GET') {
      const companyId = new URL(request.url).searchParams.get('companyId') || DEFAULT_COMPANY_ID
      const blocks = await listEvidenceBlocks(companyId)
      return Response.json({ blocks })
    }

    if (request.method === 'POST') {
      const body = (await request.json()) as EvidenceBlockInput & { companyId?: string }
      const { companyId, ...input } = body
      const block = await createEvidenceBlock(input, companyId || DEFAULT_COMPANY_ID)
      return Response.json({ block }, { status: 201 })
    }

    if (request.method === 'PUT') {
      const body = (await request.json()) as EvidenceBlockPatch & { companyId?: string }
      const block = await updateEvidenceBlock(body)
      return Response.json({ block })
    }

    if (request.method === 'DELETE') {
      const url = new URL(request.url)
      const id = url.searchParams.get('id')
      const companyId = url.searchParams.get('companyId') || DEFAULT_COMPANY_ID
      if (!id) throw new Error('Bouwsteen-id ontbreekt.')
      await deleteEvidenceBlock(id, companyId)
      return Response.json({ ok: true })
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout bij de bewijsbibliotheek.'
    const status = message.includes('niet gevonden') ? 404 : 400
    return Response.json({ error: message }, { status })
  }
}
