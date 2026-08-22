'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { fetchBudgetStatus } from '../lib/aiUsageApi'
import { formatEur } from '../lib/aiPricing'
import type { BudgetStatus } from '../types/aiUsage'

/*
 * Waarschuwing bij het maandplafond.
 *
 * Het plafond blokkeert niets — werk dat loopt mag altijd afmaken. Dan moet de melding
 * wél opvallen op de plek waar de kosten ontstaan: in de werkplek, niet alleen op een
 * beheerderspagina die niemand uit zichzelf opent.
 *
 * Onder de drempel rendert dit niets. Mislukt het ophalen, dan ook niets: een storing in
 * de verbruiksadministratie mag nooit een schrijfsessie in de weg zitten.
 */

/** Zo vaak opnieuw kijken; het plafond beweegt in de orde van generaties, niet seconden. */
const REFRESH_MS = 5 * 60 * 1000

export default function BudgetWarning() {
  const [status, setStatus] = useState<BudgetStatus | null>(null)

  useEffect(() => {
    let active = true

    const check = () => {
      void fetchBudgetStatus().then((next) => {
        if (active) setStatus(next)
      })
    }

    check()
    const timer = setInterval(check, REFRESH_MS)
    // Na terugkomst op een tabblad dat lang open stond kan er intussen veel zijn verbruikt.
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      active = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!status?.warning && !status?.exceeded) return null

  const over = status.spentEur - status.monthlyCapEur
  const left = status.monthlyCapEur - status.spentEur

  return (
    <div
      data-testid="budget-warning"
      className={`mb-4 flex items-start gap-2.5 rounded-md border p-3 text-sm ${
        status.exceeded
          ? 'border-destructive bg-destructive/5 text-destructive'
          : 'border-amber-500/60 bg-amber-500/5 text-amber-700 dark:text-amber-400'
      }`}
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium">
          {status.exceeded
            ? `Maandplafond overschreden met ${formatEur(over)}`
            : `Nog ${formatEur(left)} tot het maandplafond`}
        </p>
        <p className="opacity-90">
          Deze maand ging er {formatEur(status.spentEur)} naar AI, van een plafond van{' '}
          {formatEur(status.monthlyCapEur)}. Het werk gaat door — dit plafond waarschuwt, het blokkeert niet.{' '}
          <Link href="/verbruik" className="underline underline-offset-2">
            Bekijk het verbruik
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
