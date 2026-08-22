import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  LessonLearned,
  LessonLearnedInput,
  LessonOutcome,
} from '../../src/types/lessonLearned'
import { isDatabaseConfigured, prisma } from './prisma'

const DEV_STORE_PATH = path.join(process.cwd(), '.data', 'lessons-learned.json')
const MAX_TEXT_CHARS = 8_000
const DEFAULT_COMPANY_ID = 'default'

type StoredLessonLearned = LessonLearned & { companyId?: string }

type DevStore = {
  lessons: StoredLessonLearned[]
}

let devStoreCache: DevStore | null = null
let memoryStore: DevStore = { lessons: [] }

function memoryStoreEnabled() {
  return process.env.LESSONS_MEMORY === '1'
}


const VALID_OUTCOMES: LessonOutcome[] = ['gewonnen', 'verloren', 'ingetrokken', 'onbekend']

function normalizeOutcome(value: unknown): LessonOutcome {
  return VALID_OUTCOMES.includes(value as LessonOutcome) ? (value as LessonOutcome) : 'onbekend'
}

function trimText(value: string, max = MAX_TEXT_CHARS): string {
  const normalized = value.trim()
  return normalized.length > max ? `${normalized.slice(0, max).trim()}…` : normalized
}

function normalizeScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.max(0, Math.min(100, Math.round(num)))
}

function mapRecord(record: {
  id: string
  projectTitle: string
  buyer: string | null
  outcome: string
  score: number | null
  category: string | null
  situation: string
  lesson: string
  recommendation: string
  sourceTenderId: string | null
  createdAt: Date
  updatedAt: Date
}): LessonLearned {
  return {
    id: record.id,
    projectTitle: record.projectTitle,
    buyer: record.buyer,
    outcome: normalizeOutcome(record.outcome),
    score: record.score,
    category: record.category,
    situation: record.situation,
    lesson: record.lesson,
    recommendation: record.recommendation,
    sourceTenderId: record.sourceTenderId,
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
    devStoreCache = { lessons: [] }
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

function sanitizeInput(input: LessonLearnedInput): LessonLearnedInput {
  const projectTitle = input.projectTitle?.trim()
  const lesson = input.lesson?.trim()
  if (!projectTitle) throw new Error('Projecttitel is verplicht.')
  if (!lesson) throw new Error('Het leerpunt mag niet leeg zijn.')

  const category = input.category?.trim()
  const buyer = input.buyer?.trim()

  return {
    projectTitle: trimText(projectTitle, 300),
    buyer: buyer ? trimText(buyer, 300) : null,
    outcome: normalizeOutcome(input.outcome),
    score: normalizeScore(input.score),
    category: category ? trimText(category, 120) : null,
    situation: trimText(input.situation ?? ''),
    lesson: trimText(lesson),
    recommendation: trimText(input.recommendation ?? ''),
    sourceTenderId: input.sourceTenderId?.trim() || null,
  }
}

export async function listLessons(companyId = DEFAULT_COMPANY_ID): Promise<LessonLearned[]> {
  if (isDatabaseConfigured()) {
    const records = await prisma.lessonLearned.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    })
    return records.map(mapRecord)
  }

  const store = await readDevStore()
  return store.lessons
    .filter((item) => (item.companyId ?? DEFAULT_COMPANY_ID) === companyId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function createLesson(
  rawInput: LessonLearnedInput,
  companyId = DEFAULT_COMPANY_ID,
): Promise<LessonLearned> {
  const input = sanitizeInput(rawInput)

  if (isDatabaseConfigured()) {
    const record = await prisma.lessonLearned.create({
      data: {
        companyId,
        projectTitle: input.projectTitle,
        buyer: input.buyer ?? null,
        outcome: input.outcome,
        score: input.score ?? null,
        category: input.category ?? null,
        situation: input.situation,
        lesson: input.lesson,
        recommendation: input.recommendation,
        sourceTenderId: input.sourceTenderId ?? null,
      },
    })
    return mapRecord(record)
  }

  const now = new Date().toISOString()
  const lesson: StoredLessonLearned = {
    id: crypto.randomUUID(),
    companyId,
    projectTitle: input.projectTitle,
    buyer: input.buyer ?? null,
    outcome: input.outcome,
    score: input.score ?? null,
    category: input.category ?? null,
    situation: input.situation,
    lesson: input.lesson,
    recommendation: input.recommendation,
    sourceTenderId: input.sourceTenderId ?? null,
    createdAt: now,
    updatedAt: now,
  }
  const store = await readDevStore()
  store.lessons.unshift(lesson)
  await writeDevStore(store)
  return lesson
}

export async function updateLesson(input: {
  id: string
  companyId?: string
  projectTitle?: string
  buyer?: string | null
  outcome?: LessonOutcome
  score?: number | null
  category?: string | null
  situation?: string
  lesson?: string
  recommendation?: string
}): Promise<LessonLearned> {
  if (!input.id?.trim()) throw new Error('Leerpunt-id ontbreekt.')
  const companyId = input.companyId || DEFAULT_COMPANY_ID

  const data = {
    ...(input.projectTitle?.trim() ? { projectTitle: trimText(input.projectTitle, 300) } : {}),
    ...(input.buyer !== undefined ? { buyer: input.buyer?.trim() ? trimText(input.buyer, 300) : null } : {}),
    ...(input.outcome ? { outcome: normalizeOutcome(input.outcome) } : {}),
    ...(input.score !== undefined ? { score: normalizeScore(input.score) } : {}),
    ...(input.category !== undefined ? { category: input.category?.trim() ? trimText(input.category, 120) : null } : {}),
    ...(input.situation !== undefined ? { situation: trimText(input.situation) } : {}),
    ...(input.lesson?.trim() ? { lesson: trimText(input.lesson) } : {}),
    ...(input.recommendation !== undefined ? { recommendation: trimText(input.recommendation) } : {}),
  }

  if (isDatabaseConfigured()) {
    const existing = await prisma.lessonLearned.findFirst({ where: { id: input.id, companyId } })
    if (!existing) throw new Error('Leerpunt niet gevonden.')
    const record = await prisma.lessonLearned.update({ where: { id: input.id }, data })
    return mapRecord(record)
  }

  const store = await readDevStore()
  const index = store.lessons.findIndex(
    (item) => item.id === input.id && (item.companyId ?? DEFAULT_COMPANY_ID) === companyId,
  )
  if (index < 0) throw new Error('Leerpunt niet gevonden.')
  const updated: StoredLessonLearned = {
    ...store.lessons[index],
    ...data,
    updatedAt: new Date().toISOString(),
  }
  store.lessons[index] = updated
  await writeDevStore(store)
  return updated
}

export async function deleteLesson(id: string, companyId = DEFAULT_COMPANY_ID): Promise<void> {
  if (!id?.trim()) throw new Error('Leerpunt-id ontbreekt.')

  if (isDatabaseConfigured()) {
    const { count } = await prisma.lessonLearned.deleteMany({ where: { id, companyId } })
    if (!count) throw new Error('Leerpunt niet gevonden.')
    return
  }

  const store = await readDevStore()
  const next = store.lessons.filter(
    (item) => !(item.id === id && (item.companyId ?? DEFAULT_COMPANY_ID) === companyId),
  )
  if (next.length === store.lessons.length) throw new Error('Leerpunt niet gevonden.')
  store.lessons = next
  await writeDevStore(store)
}

export async function handleLessonsLearnedRequest(request: Request): Promise<Response> {
  try {
    if (request.method === 'GET') {
      const companyId = new URL(request.url).searchParams.get('companyId') || DEFAULT_COMPANY_ID
      const lessons = await listLessons(companyId)
      return Response.json({ lessons })
    }

    if (request.method === 'POST') {
      const body = (await request.json()) as LessonLearnedInput & { companyId?: string }
      const { companyId, ...input } = body
      const lesson = await createLesson(input, companyId || DEFAULT_COMPANY_ID)
      return Response.json({ lesson }, { status: 201 })
    }

    if (request.method === 'PUT') {
      const body = (await request.json()) as Parameters<typeof updateLesson>[0]
      if (!body.id?.trim()) throw new Error('Leerpunt-id ontbreekt.')
      const lesson = await updateLesson(body)
      return Response.json({ lesson })
    }

    if (request.method === 'DELETE') {
      const url = new URL(request.url)
      const id = url.searchParams.get('id')
      const companyId = url.searchParams.get('companyId') || DEFAULT_COMPANY_ID
      if (!id) throw new Error('Leerpunt-id ontbreekt.')
      await deleteLesson(id, companyId)
      return Response.json({ ok: true })
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout bij lessons learned.'
    const status = message.includes('niet gevonden') ? 404 : 400
    return Response.json({ error: message }, { status })
  }
}
