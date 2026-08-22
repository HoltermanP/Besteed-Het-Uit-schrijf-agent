import { prisma, isDatabaseConfigured } from './prisma'
import { currentUsageContext, DEFAULT_COMPANY_ID } from './usageContext'
import { costUsdMicros, costUsdMicrosWithoutCache, DEFAULT_USD_TO_EUR } from '../../src/lib/aiPricing'
import type {
  BudgetStatus,
  UsageBudget,
  UsageCompanyRow,
  UsageDraftRow,
  UsageProjectRow,
  UsageReport,
  UsageTaskRow,
  UsageTotals,
} from '../../src/types/aiUsage'

/*
 * Vastleggen en optellen van AI-verbruik.
 *
 * Elke aanroep van de schrijfagent, reviewer of analysator levert hier één regel op met
 * tokens, model en kosten, gekoppeld aan bedrijf/project/stuk uit de usageContext. Het
 * vastleggen is nadrukkelijk "best effort": een haperende database mag nooit een
 * generatie laten mislukken die de gebruiker minuten heeft gekost.
 */

/** Zonder database (of in de tests) telt een in-memory store mee, net als bij writeJobs. */
type UsageRow = {
  companyId: string
  projectId: string | null
  projectTitle: string | null
  draftId: string | null
  draftTitle: string | null
  task: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
  costUsdMicros: number | null
  cacheRequested: boolean
  month: string
  createdAt: Date
}

const globalForUsage = globalThis as typeof globalThis & {
  aiUsageMemory?: UsageRow[]
  aiBudgetMemory?: Map<string, UsageBudget>
}

function isMemoryStore() {
  return process.env.STATE_MEMORY === '1' || !isDatabaseConfigured()
}

function memoryRows(): UsageRow[] {
  globalForUsage.aiUsageMemory ??= []
  return globalForUsage.aiUsageMemory
}

function memoryBudgets(): Map<string, UsageBudget> {
  globalForUsage.aiBudgetMemory ??= new Map()
  return globalForUsage.aiBudgetMemory
}

/** Maandsleutel 'JJJJ-MM' in lokale tijd — een maandplafond volgt de kalender van de gebruiker. */
export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Vergeet het verbruik van deze sessie. Werkt uitsluitend in de geheugenmodus (tests, of
 * een opzet zonder database): een echte administratie is er juist om te bewaren en wordt
 * hier nooit geleegd.
 */
export function clearMemoryUsage(): void {
  if (!isMemoryStore()) return
  memoryRows().length = 0
  memoryBudgets().clear()
}

export type RecordUsageInput = {
  provider: string
  model: string
  task: string
  inputTokens: number
  outputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
  cacheRequested: boolean
  cacheTtl: '5m' | '1h'
}

/**
 * Leg het verbruik van één aanroep vast. Geeft niets terug en werpt nooit: de aanroeper
 * (aiClient) mag hier geen last van hebben. Bij een lege aanroep — alle tellingen nul —
 * wordt niets weggeschreven; dat zou de verbruikspagina alleen maar vervuilen.
 */
export async function recordAiUsage(input: RecordUsageInput): Promise<void> {
  const tokens = {
    inputTokens: Math.max(0, Math.round(input.inputTokens)),
    outputTokens: Math.max(0, Math.round(input.outputTokens)),
    cacheWriteTokens: Math.max(0, Math.round(input.cacheWriteTokens)),
    cacheReadTokens: Math.max(0, Math.round(input.cacheReadTokens)),
  }
  const total =
    tokens.inputTokens + tokens.outputTokens + tokens.cacheWriteTokens + tokens.cacheReadTokens
  if (!total) return

  const context = currentUsageContext()
  const row: UsageRow = {
    companyId: context?.companyId || DEFAULT_COMPANY_ID,
    projectId: context?.projectId ?? null,
    projectTitle: context?.projectTitle ?? null,
    draftId: context?.draftId ?? null,
    draftTitle: context?.draftTitle ?? null,
    task: input.task || 'onbekend',
    provider: input.provider,
    model: input.model,
    ...tokens,
    costUsdMicros: costUsdMicros(input.model, tokens, input.cacheTtl),
    cacheRequested: input.cacheRequested,
    month: monthKey(),
    createdAt: new Date(),
  }

  if (isMemoryStore()) {
    memoryRows().push(row)
    return
  }

  try {
    await prisma.aiUsage.create({ data: row })
  } catch (error) {
    console.warn('[ai-verbruik] vastleggen mislukt:', error instanceof Error ? error.message : error)
  }
}

// ── Optellen ─────────────────────────────────────────────────────────────────

function emptyTotals(): UsageTotals {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    costUsdMicros: 0,
    costWithoutCacheUsdMicros: 0,
    unpricedCalls: 0,
    cacheRequestedCalls: 0,
    cacheHitCalls: 0,
  }
}

function addRow(totals: UsageTotals, row: UsageRow): UsageTotals {
  totals.calls += 1
  totals.inputTokens += row.inputTokens
  totals.outputTokens += row.outputTokens
  totals.cacheWriteTokens += row.cacheWriteTokens
  totals.cacheReadTokens += row.cacheReadTokens
  if (row.costUsdMicros == null) {
    totals.unpricedCalls += 1
  } else {
    totals.costUsdMicros += row.costUsdMicros
    // Zonder caching zou álle invoer tegen het volle tarief zijn afgerekend; het verschil
    // met de werkelijke kosten is precies wat caching heeft opgeleverd.
    totals.costWithoutCacheUsdMicros += costUsdMicrosWithoutCache(row.model, row) ?? row.costUsdMicros
  }
  if (row.cacheRequested) {
    totals.cacheRequestedCalls += 1
    if (row.cacheReadTokens > 0) totals.cacheHitCalls += 1
  }
  return totals
}

/** Groepeer op een sleutel en tel op; behoudt het eerst gevonden label van een groep. */
function groupBy<T>(rows: UsageRow[], key: (row: UsageRow) => string, make: (row: UsageRow) => T) {
  const groups = new Map<string, { seed: T; totals: UsageTotals; rows: UsageRow[] }>()
  for (const row of rows) {
    const id = key(row)
    let group = groups.get(id)
    if (!group) {
      group = { seed: make(row), totals: emptyTotals(), rows: [] }
      groups.set(id, group)
    }
    addRow(group.totals, row)
    group.rows.push(row)
  }
  return groups
}

function byCostDescending(a: UsageTotals, b: UsageTotals) {
  return b.costUsdMicros - a.costUsdMicros || b.calls - a.calls
}

/**
 * Bovengrens op het aantal regels dat één rapport inleest. Ruim boven wat een maand
 * realistisch oplevert; hij bestaat zodat een uitgelopen maand de pagina niet laat hangen.
 */
const MAX_ROWS = 50_000

async function readRows(month: string): Promise<UsageRow[]> {
  if (isMemoryStore()) return memoryRows().filter((row) => row.month === month)
  const rows = await prisma.aiUsage.findMany({
    where: { month },
    orderBy: { createdAt: 'desc' },
    take: MAX_ROWS,
  })
  return rows as UsageRow[]
}

async function readMonths(): Promise<string[]> {
  if (isMemoryStore()) {
    return [...new Set(memoryRows().map((row) => row.month))].sort().reverse()
  }
  const rows = await prisma.aiUsage.findMany({
    distinct: ['month'],
    select: { month: true },
    orderBy: { month: 'desc' },
    take: 36,
  })
  return rows.map((row) => row.month)
}

export async function readBudget(companyId: string): Promise<UsageBudget> {
  const fallback: UsageBudget = { companyId, monthlyCapEur: 0, usdToEur: DEFAULT_USD_TO_EUR }
  if (isMemoryStore()) return memoryBudgets().get(companyId) ?? fallback
  try {
    const row = await prisma.aiBudget.findUnique({ where: { companyId } })
    if (!row) return fallback
    return { companyId, monthlyCapEur: row.monthlyCapEur, usdToEur: row.usdToEur }
  } catch {
    return fallback
  }
}

export async function saveBudget(input: UsageBudget): Promise<UsageBudget> {
  const budget: UsageBudget = {
    companyId: input.companyId || DEFAULT_COMPANY_ID,
    monthlyCapEur: Number.isFinite(input.monthlyCapEur) ? Math.max(0, input.monthlyCapEur) : 0,
    // Een koers van 0 zou alle kosten op nul zetten; dan liever de standaardkoers.
    usdToEur:
      Number.isFinite(input.usdToEur) && input.usdToEur > 0 ? input.usdToEur : DEFAULT_USD_TO_EUR,
  }

  if (isMemoryStore()) {
    memoryBudgets().set(budget.companyId, budget)
    return budget
  }

  await prisma.aiBudget.upsert({
    where: { companyId: budget.companyId },
    create: budget,
    update: { monthlyCapEur: budget.monthlyCapEur, usdToEur: budget.usdToEur },
  })
  return budget
}

/**
 * Volledig maandrapport voor één bedrijf: totalen, per project met de stukken eronder,
 * per taak, plus de stand van alle bedrijven zodat een beheerder in één blik ziet waar
 * het geld heen gaat.
 */
export async function buildUsageReport(companyId: string, month = monthKey()): Promise<UsageReport> {
  const budget = await readBudget(companyId)
  const base: UsageReport = {
    month,
    companyId,
    totals: emptyTotals(),
    projects: [],
    tasks: [],
    availableMonths: [],
    budget,
    companies: [],
  }

  let rows: UsageRow[]
  try {
    rows = await readRows(month)
    base.availableMonths = await readMonths()
  } catch (error) {
    console.warn('[ai-verbruik] rapport lezen mislukt:', error instanceof Error ? error.message : error)
    return { ...base, unavailable: true }
  }

  if (!base.availableMonths.includes(month)) base.availableMonths = [month, ...base.availableMonths]

  // Alle bedrijven in deze maand — het overzicht waarop plafonds worden bewaakt.
  base.companies = [...groupBy(rows, (row) => row.companyId, (row) => row.companyId)]
    .map(([id, group]): UsageCompanyRow => ({ companyId: id, ...group.totals }))
    .sort(byCostDescending)

  const own = rows.filter((row) => row.companyId === companyId)
  own.forEach((row) => addRow(base.totals, row))

  base.projects = [...groupBy(own, (row) => row.projectId ?? '', (row) => row)]
    .map(([projectId, group]): UsageProjectRow => ({
      projectId,
      // Werk buiten een project (aanbestedingen scoren, bedrijfsverrijking) hoort ook
      // in het overzicht; het krijgt een eigen regel in plaats van te verdwijnen.
      projectTitle: group.seed.projectTitle ?? (projectId ? projectId : 'Buiten een project'),
      ...group.totals,
      drafts: [...groupBy(group.rows, (row) => row.draftId ?? '', (row) => row)]
        .map(([draftId, sub]): UsageDraftRow => ({
          draftId,
          draftTitle: sub.seed.draftTitle ?? (draftId ? draftId : 'Projectbreed'),
          ...sub.totals,
        }))
        .sort(byCostDescending),
    }))
    .sort(byCostDescending)

  base.tasks = [...groupBy(own, (row) => `${row.task}::${row.model}`, (row) => row)]
    .map(([, group]): UsageTaskRow => ({
      task: group.seed.task,
      model: group.seed.model,
      ...group.totals,
    }))
    .sort(byCostDescending)

  return base
}

/**
 * Alleen de plafondstand van dit moment — klein en snel genoeg om de werkplek er
 * regelmatig naar te laten vragen zonder het hele rapport op te bouwen.
 */
export async function readBudgetStatus(companyId: string): Promise<BudgetStatus> {
  const month = monthKey()
  const budget = await readBudget(companyId)
  let spentMicros = 0

  try {
    if (isMemoryStore()) {
      spentMicros = memoryRows()
        .filter((row) => row.companyId === companyId && row.month === month)
        .reduce((sum, row) => sum + (row.costUsdMicros ?? 0), 0)
    } else {
      const result = await prisma.aiUsage.aggregate({
        where: { companyId, month },
        _sum: { costUsdMicros: true },
      })
      spentMicros = result._sum.costUsdMicros ?? 0
    }
  } catch (error) {
    console.warn('[ai-verbruik] plafondstand lezen mislukt:', error instanceof Error ? error.message : error)
  }

  const spentEur = (spentMicros / 1_000_000) * budget.usdToEur
  const ratio = budget.monthlyCapEur > 0 ? spentEur / budget.monthlyCapEur : 0
  return {
    companyId,
    month,
    spentEur,
    monthlyCapEur: budget.monthlyCapEur,
    ratio,
    warning: budget.monthlyCapEur > 0 && ratio >= 0.8,
    exceeded: budget.monthlyCapEur > 0 && ratio >= 1,
  }
}
