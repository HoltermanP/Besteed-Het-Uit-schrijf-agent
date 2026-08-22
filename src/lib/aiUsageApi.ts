import { getActiveCompanyId } from './companies'
import type { BudgetStatus, UsageBudget, UsageReport } from '../types/aiUsage'

/** Haalt het maandrapport op; `month` als 'JJJJ-MM', standaard de lopende maand. */
export async function fetchUsageReport(month?: string, companyId = getActiveCompanyId()): Promise<UsageReport> {
  const params = new URLSearchParams({ companyId })
  if (month) params.set('month', month)
  const response = await fetch(`/api/verbruik?${params.toString()}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Het verbruik kon niet worden opgehaald.')
  return (await response.json()) as UsageReport
}

/**
 * Alleen de plafondstand. Faalt stil met `null`: de waarschuwing in de werkplek is
 * nuttig, maar mag het werken nooit in de weg zitten als de server even niet meewerkt.
 */
export async function fetchBudgetStatus(companyId = getActiveCompanyId()): Promise<BudgetStatus | null> {
  try {
    const params = new URLSearchParams({ companyId, action: 'status' })
    const response = await fetch(`/api/verbruik?${params.toString()}`, { cache: 'no-store' })
    if (!response.ok) return null
    return (await response.json()) as BudgetStatus
  } catch {
    return null
  }
}

export async function saveUsageBudget(budget: UsageBudget): Promise<UsageBudget> {
  const response = await fetch('/api/verbruik', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(budget),
  })
  if (!response.ok) throw new Error('Het maandplafond kon niet worden opgeslagen.')
  return (await response.json()) as UsageBudget
}
