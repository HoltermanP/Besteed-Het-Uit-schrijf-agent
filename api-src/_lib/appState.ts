import { prisma, isDatabaseConfigured } from './prisma'

// Werkruimte-opslag (key-value) in Neon. Zonder DATABASE_URL (of met STATE_MEMORY=1,
// zoals in de Playwright-tests) draait een in-memory store, net als bij styleDocuments.

export type StateWriteRequest = {
  set?: Record<string, string>
  remove?: string[]
}

const globalForState = globalThis as typeof globalThis & {
  appStateMemory?: Map<string, string>
}

function isMemoryStore() {
  return process.env.STATE_MEMORY === '1' || !isDatabaseConfigured()
}

function memoryStore(): Map<string, string> {
  globalForState.appStateMemory ??= new Map()
  return globalForState.appStateMemory
}

export async function readAllState(): Promise<Record<string, string>> {
  if (isMemoryStore()) {
    return Object.fromEntries(memoryStore())
  }
  const rows = await prisma.appState.findMany()
  return Object.fromEntries(rows.map((row) => [row.key, row.value]))
}

export async function writeState(request: StateWriteRequest): Promise<void> {
  const set = request.set ?? {}
  const remove = request.remove ?? []

  if (isMemoryStore()) {
    const store = memoryStore()
    for (const [key, value] of Object.entries(set)) store.set(key, value)
    for (const key of remove) store.delete(key)
    return
  }

  await prisma.$transaction([
    ...Object.entries(set).map(([key, value]) =>
      prisma.appState.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      }),
    ),
    ...(remove.length ? [prisma.appState.deleteMany({ where: { key: { in: remove } } })] : []),
  ])
}

export async function clearState(): Promise<void> {
  if (isMemoryStore()) {
    memoryStore().clear()
    return
  }
  await prisma.appState.deleteMany()
}
