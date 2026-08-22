import { buildUsageReport, monthKey, readBudgetStatus, saveBudget } from '@api-lib/aiUsage'
import { DEFAULT_COMPANY_ID } from '@api-lib/usageContext'
import type { UsageBudget } from '@/types/aiUsage'

/*
 * Verbruiksadministratie: wat de AI heeft gekost, per bedrijf, project en stuk.
 *
 * GET                       → volledig maandrapport (?companyId, ?month=JJJJ-MM)
 * GET ?action=status        → alleen de plafondstand; klein genoeg om vaak op te vragen
 * PUT                       → maandplafond en koers van één bedrijf opslaan
 */
export const maxDuration = 30

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const companyId = params.get('companyId')?.trim() || DEFAULT_COMPANY_ID

    if (params.get('action') === 'status') {
      return Response.json(await readBudgetStatus(companyId))
    }

    const requested = params.get('month')?.trim()
    // Een onzinnige maand levert liever de huidige maand op dan een lege pagina.
    const month = requested && MONTH_PATTERN.test(requested) ? requested : monthKey()
    return Response.json(await buildUsageReport(companyId, month))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interne serverfout bij het verbruik.'
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Partial<UsageBudget>
    const saved = await saveBudget({
      companyId: body.companyId?.trim() || DEFAULT_COMPANY_ID,
      monthlyCapEur: Number(body.monthlyCapEur ?? 0),
      usdToEur: Number(body.usdToEur ?? 0),
    })
    return Response.json(saved)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Het plafond kon niet worden opgeslagen.'
    return Response.json({ error: message }, { status: 500 })
  }
}
