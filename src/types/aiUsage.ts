/*
 * Wat de verbruikspagina van de server terugkrijgt. Bedragen staan in micro-dollars
 * (zie aiPricing.ts); de omrekening naar euro's gebeurt in de UI met de koers uit het
 * bedrijfsbudget, zodat één ingestelde koers overal tegelijk doorwerkt.
 */

/** Tokentellingen en kosten van een groep aanroepen (een project, een stuk, een taak). */
export type UsageTotals = {
  calls: number
  inputTokens: number
  outputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
  /** Werkelijke kosten in micro-dollars; telt alleen aanroepen met een bekend tarief mee. */
  costUsdMicros: number
  /** Wat dezelfde aanroepen zonder prompt caching hadden gekost. */
  costWithoutCacheUsdMicros: number
  /** Aantal aanroepen waarvan het modeltarief niet bekend is (niet meegeteld in de kosten). */
  unpricedCalls: number
  /** Aanroepen die om caching vroegen — de noemer voor "werkt caching?". */
  cacheRequestedCalls: number
  /** Aanroepen die om caching vroegen én daadwerkelijk uit de cache lazen. */
  cacheHitCalls: number
}

export type UsageTaskRow = UsageTotals & {
  task: string
  model: string
}

/** Eén stuk binnen een project. */
export type UsageDraftRow = UsageTotals & {
  draftId: string
  draftTitle: string
}

export type UsageProjectRow = UsageTotals & {
  projectId: string
  projectTitle: string
  drafts: UsageDraftRow[]
}

export type UsageCompanyRow = UsageTotals & {
  companyId: string
}

/** Verbruik van één maand voor één bedrijf. */
export type UsageReport = {
  /** Maand als 'JJJJ-MM'. */
  month: string
  companyId: string
  totals: UsageTotals
  projects: UsageProjectRow[]
  /** Verbruik per taak (schrijfagent, ai-review, eisen-extractie, …), over het hele bedrijf. */
  tasks: UsageTaskRow[]
  /** Maanden waarvoor verbruik is vastgelegd, nieuwste eerst. */
  availableMonths: string[]
  budget: UsageBudget
  /** Verbruik per bedrijf in dezelfde maand, zodat een beheerder alles in één blik ziet. */
  companies: UsageCompanyRow[]
  /** De database staat uit; er wordt niets vastgelegd. */
  unavailable?: boolean
}

/** Maandplafond en koers van één bedrijf. */
export type UsageBudget = {
  companyId: string
  /** Maandplafond in euro's; 0 betekent: geen plafond ingesteld. */
  monthlyCapEur: number
  /** Koers voor het omrekenen van dollars naar euro's. */
  usdToEur: number
}

/** Beknopte plafondstand, voor de waarschuwing in de werkplek. */
export type BudgetStatus = {
  companyId: string
  month: string
  spentEur: number
  monthlyCapEur: number
  /** Aandeel van het plafond dat op is (0–…); 0 als er geen plafond staat. */
  ratio: number
  /** Vanaf 80% van het plafond. */
  warning: boolean
  /** Boven het plafond. */
  exceeded: boolean
}
