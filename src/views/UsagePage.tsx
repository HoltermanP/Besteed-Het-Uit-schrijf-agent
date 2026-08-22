'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Coins,
  Database,
  Loader2,
  RefreshCw,
  Save,
  Zap,
} from 'lucide-react'
import { fetchUsageReport, saveUsageBudget } from '../lib/aiUsageApi'
import { getCompanies, getActiveCompanyId } from '../lib/companies'
import { formatEur, formatTokens, microsToEur } from '../lib/aiPricing'
import type { UsageProjectRow, UsageReport, UsageTotals } from '../types/aiUsage'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ModeToggle } from '@/components/mode-toggle'

/*
 * Wat heeft de AI gekost?
 *
 * Elke AI-aanroep wordt vastgelegd met tokens, model en kosten en gekoppeld aan bedrijf,
 * project en stuk (zie api-src/_lib/aiUsage.ts). Deze pagina telt dat op tot iets waarmee
 * een beheerder de uitgaven kan verantwoorden: per project, per stuk en per taak.
 *
 * Daarnaast maakt hij zichtbaar of prompt caching zijn werk doet. Dat is niet vanzelf-
 * sprekend: caching werkt alleen als de prefix van een aanroep byte-identiek terugkomt, en
 * één wijziging in de bronnen breekt dat stilletjes. Een taak die om caching vraagt maar
 * nooit uit de cache leest, betaalt zelfs méér (een cache-write kost 1,25× invoer). De
 * kolom "caching" laat dat verschil zien in plaats van het te verstoppen.
 */

/** Waarschuwen vanaf vier vijfde van het plafond; daaronder is het gewoon informatie. */
const WARN_RATIO = 0.8

function monthLabel(month: string): string {
  const [year, index] = month.split('-')
  const date = new Date(Number(year), Number(index) - 1, 1)
  if (Number.isNaN(date.getTime())) return month
  const formatted = date.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

/** Aandeel van de invoer dat uit de cache kwam — de kern van "werkt caching?". */
function cacheReadShare(totals: UsageTotals): number {
  const input = totals.inputTokens + totals.cacheWriteTokens + totals.cacheReadTokens
  return input > 0 ? totals.cacheReadTokens / input : 0
}

function savingsEur(totals: UsageTotals, rate: number): number {
  return microsToEur(totals.costWithoutCacheUsdMicros - totals.costUsdMicros, rate)
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

/** Kosten van één regel, plus het aantal aanroepen eronder. */
function CostCell({ totals, rate }: { totals: UsageTotals; rate: number }) {
  return (
    <div className="text-right">
      <div className="font-medium tabular-nums">{formatEur(microsToEur(totals.costUsdMicros, rate))}</div>
      <div className="text-xs text-muted-foreground">
        {totals.calls} {totals.calls === 1 ? 'aanroep' : 'aanroepen'}
        {totals.unpricedCalls > 0 ? ` · ${totals.unpricedCalls} zonder tarief` : ''}
      </div>
    </div>
  )
}

/**
 * De cachingstand van een regel. Vroeg deze taak niet om caching, dan is er niets te
 * melden; vroeg hij er wel om maar leverde het niets op, dan is dat juist het signaal
 * waar deze pagina voor bestaat.
 */
function CacheCell({ totals, rate }: { totals: UsageTotals; rate: number }) {
  if (!totals.cacheRequestedCalls) {
    return <span className="text-xs text-muted-foreground">niet gebruikt</span>
  }

  const hits = totals.cacheHitCalls
  const share = cacheReadShare(totals)
  const saved = savingsEur(totals, rate)

  if (!hits) {
    return (
      <div className="text-xs">
        <Badge variant="destructive" className="mb-0.5">geen hits</Badge>
        <div className="text-muted-foreground">
          {totals.cacheRequestedCalls} aanroepen vroegen erom
        </div>
      </div>
    )
  }

  return (
    <div className="text-xs">
      <div className="font-medium tabular-nums">{percent(share)} uit cache</div>
      <div className="text-muted-foreground">
        {hits}/{totals.cacheRequestedCalls} raak · {saved > 0 ? `${formatEur(saved)} bespaard` : 'geen besparing'}
      </div>
    </div>
  )
}

function ProjectBlock({ project, rate }: { project: UsageProjectRow; rate: number }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
      >
        <ChevronRight size={16} className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{project.projectTitle}</div>
          <div className="text-xs text-muted-foreground">
            {project.drafts.length} {project.drafts.length === 1 ? 'stuk' : 'stukken'} ·{' '}
            {formatTokens(project.inputTokens + project.cacheReadTokens + project.cacheWriteTokens)} in ·{' '}
            {formatTokens(project.outputTokens)} uit
          </div>
        </div>
        <div className="hidden w-40 shrink-0 sm:block">
          <CacheCell totals={project} rate={rate} />
        </div>
        <div className="w-28 shrink-0">
          <CostCell totals={project} rate={rate} />
        </div>
      </button>

      {open && (
        <div className="bg-muted/30 px-4 pb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2 font-normal">Stuk</th>
                <th className="py-2 text-right font-normal">Tokens in / uit</th>
                <th className="hidden py-2 font-normal sm:table-cell">Caching</th>
                <th className="py-2 text-right font-normal">Kosten</th>
              </tr>
            </thead>
            <tbody>
              {project.drafts.map((draft) => (
                <tr key={draft.draftId || 'projectbreed'} className="border-t">
                  <td className="py-2 pr-3">{draft.draftTitle}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {formatTokens(draft.inputTokens + draft.cacheReadTokens + draft.cacheWriteTokens)} /{' '}
                    {formatTokens(draft.outputTokens)}
                  </td>
                  <td className="hidden py-2 sm:table-cell">
                    <CacheCell totals={draft} rate={rate} />
                  </td>
                  <td className="py-2">
                    <CostCell totals={draft} rate={rate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function UsagePage() {
  const companies = useMemo(() => getCompanies(), [])
  const [companyId, setCompanyId] = useState(() => getActiveCompanyId())
  const [month, setMonth] = useState<string>('')
  const [report, setReport] = useState<UsageReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [capInput, setCapInput] = useState('')
  const [rateInput, setRateInput] = useState('')
  const [savingBudget, setSavingBudget] = useState(false)
  const [budgetSaved, setBudgetSaved] = useState(false)

  const load = useCallback(
    async (nextMonth?: string) => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchUsageReport(nextMonth || undefined, companyId)
        setReport(data)
        setMonth(data.month)
        setCapInput(data.budget.monthlyCapEur ? String(data.budget.monthlyCapEur) : '')
        setRateInput(String(data.budget.usdToEur))
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Het verbruik kon niet worden opgehaald.')
      } finally {
        setLoading(false)
      }
    },
    [companyId],
  )

  useEffect(() => {
    void load()
  }, [load])

  const companyName = (id: string) => companies.find((company) => company.id === id)?.name ?? id
  const rate = report?.budget.usdToEur ?? 0

  const spentEur = report ? microsToEur(report.totals.costUsdMicros, rate) : 0
  const cap = report?.budget.monthlyCapEur ?? 0
  const ratio = cap > 0 ? spentEur / cap : 0
  const exceeded = cap > 0 && ratio >= 1
  const warning = cap > 0 && ratio >= WARN_RATIO && !exceeded
  const savedEur = report ? savingsEur(report.totals, rate) : 0

  const handleSaveBudget = async () => {
    if (!report) return
    setSavingBudget(true)
    setBudgetSaved(false)
    try {
      await saveUsageBudget({
        companyId,
        monthlyCapEur: Number(capInput.replace(',', '.')) || 0,
        usdToEur: Number(rateInput.replace(',', '.')) || 0,
      })
      setBudgetSaved(true)
      await load(month)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Opslaan mislukt.')
    } finally {
      setSavingBudget(false)
    }
  }

  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Coins size={18} />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-semibold">AI-verbruik</div>
            <div className="truncate text-sm text-muted-foreground">Kosten per project en per stuk</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={() => void load(month)} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="sr-only sm:not-sr-only">Vernieuwen</span>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft size={16} /> <span className="sr-only sm:not-sr-only">Terug naar werkplek</span>
            </Link>
          </Button>
          <ModeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-[1040px] space-y-4">
        <div>
          <h1 className="mb-1.5 text-2xl font-semibold">Wat de AI heeft gekost</h1>
          <p className="max-w-[760px] text-sm text-muted-foreground">
            Elke aanroep van de schrijfagent, de reviewer en de analyses wordt vastgelegd met tokens, model en kosten.
            Hieronder telt dat op per project en per stuk, zodat te verantwoorden is waar het geld heen ging. De kolom
            <span className="font-medium text-foreground"> caching</span> laat zien of herhaald werk daadwerkelijk uit
            de cache komt: dat scheelt tot negentig procent op de invoer, maar een taak die erom vraagt en niets terugleest,
            betaalt juist extra.
          </p>
        </div>

        {/* Bedrijf en maand */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="verbruik-bedrijf">Bedrijf</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger id="verbruik-bedrijf" className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="verbruik-maand">Maand</Label>
            <Select value={month} onValueChange={(value) => void load(value)}>
              <SelectTrigger id="verbruik-maand" className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(report?.availableMonths ?? [month]).filter(Boolean).map((key) => (
                  <SelectItem key={key} value={key}>{monthLabel(key)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <Card className="border-destructive">
            <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {report?.unavailable && (
          <Card className="border-amber-500/60">
            <CardContent className="flex items-start gap-2.5 py-3 text-sm">
              <Database size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <span>
                De database staat uit, dus er wordt geen verbruik vastgelegd. Zet de Neon-koppeling aan in API-beheer om
                kosten te kunnen verantwoorden.
              </span>
            </CardContent>
          </Card>
        )}

        {loading && !report && (
          <Card>
            <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" /> Verbruik ophalen…
            </CardContent>
          </Card>
        )}

        {report && (
          <>
            {/* Maandplafond */}
            <Card className={exceeded ? 'border-destructive' : warning ? 'border-amber-500/60' : undefined}>
              <CardContent className="space-y-3 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      {monthLabel(report.month)} · {companyName(companyId)}
                    </div>
                    <div className="text-3xl font-semibold tabular-nums">{formatEur(spentEur)}</div>
                  </div>
                  <div className="text-right text-sm">
                    {cap > 0 ? (
                      <>
                        <div className="text-muted-foreground">van {formatEur(cap)} maandplafond</div>
                        <div className="tabular-nums">{percent(ratio)} verbruikt</div>
                      </>
                    ) : (
                      <div className="text-muted-foreground">geen maandplafond ingesteld</div>
                    )}
                  </div>
                </div>

                {cap > 0 && <Progress value={Math.min(100, ratio * 100)} />}

                {(exceeded || warning) && (
                  <div
                    className={`flex items-start gap-2.5 rounded-md border p-3 text-sm ${
                      exceeded ? 'border-destructive text-destructive' : 'border-amber-500/60 text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <span>
                      {exceeded
                        ? `Het maandplafond is overschreden met ${formatEur(spentEur - cap)}. Het werk gaat gewoon door — dit plafond waarschuwt, het blokkeert niet.`
                        : `Nog ${formatEur(cap - spentEur)} tot het maandplafond.`}
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap items-end gap-3 border-t pt-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="verbruik-plafond">Maandplafond (€)</Label>
                    <Input
                      id="verbruik-plafond"
                      inputMode="decimal"
                      className="w-[140px]"
                      value={capInput}
                      onChange={(event) => {
                        setCapInput(event.target.value)
                        setBudgetSaved(false)
                      }}
                      placeholder="0 = geen"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="verbruik-koers">Koers (€ per $)</Label>
                    <Input
                      id="verbruik-koers"
                      inputMode="decimal"
                      className="w-[140px]"
                      value={rateInput}
                      onChange={(event) => {
                        setRateInput(event.target.value)
                        setBudgetSaved(false)
                      }}
                      placeholder="0,92"
                    />
                  </div>
                  <Button type="button" onClick={() => void handleSaveBudget()} disabled={savingBudget}>
                    {savingBudget ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Opslaan
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {budgetSaved
                      ? 'Opgeslagen.'
                      : 'Anthropic factureert in dollars; de koers rekent dat om naar euro’s voor de hele historie.'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Cachingstand over de hele maand */}
            <Card>
              <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 py-4">
                <div className="flex items-center gap-2.5">
                  <Zap size={18} className="shrink-0 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">Prompt caching</div>
                    <div className="text-xs text-muted-foreground">
                      {report.totals.cacheRequestedCalls
                        ? `${report.totals.cacheHitCalls} van ${report.totals.cacheRequestedCalls} aanroepen lazen uit cache`
                        : 'Geen enkele aanroep vroeg om caching'}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-xl font-semibold tabular-nums">{percent(cacheReadShare(report.totals))}</div>
                  <div className="text-xs text-muted-foreground">van de invoer uit cache</div>
                </div>
                <div>
                  <div className="text-xl font-semibold tabular-nums">{formatEur(savedEur)}</div>
                  <div className="text-xs text-muted-foreground">bespaard t.o.v. zonder caching</div>
                </div>
                <div>
                  <div className="text-xl font-semibold tabular-nums">{formatTokens(report.totals.outputTokens)}</div>
                  <div className="text-xs text-muted-foreground">uitvoertokens geschreven</div>
                </div>
              </CardContent>
            </Card>

            {/* Per project en stuk */}
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center gap-3 border-b px-4 py-2.5 text-xs text-muted-foreground">
                  <span className="w-4" />
                  <span className="flex-1">Project</span>
                  <span className="hidden w-40 sm:block">Caching</span>
                  <span className="w-28 text-right">Kosten</span>
                </div>
                {report.projects.length ? (
                  report.projects.map((project) => (
                    <ProjectBlock key={project.projectId || 'buiten-project'} project={project} rate={rate} />
                  ))
                ) : (
                  <p className="px-4 py-6 text-sm text-muted-foreground">
                    In deze maand is nog geen AI-verbruik vastgelegd voor dit bedrijf.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Per taak: waar zit het geld in het proces */}
            {report.tasks.length > 0 && (
              <Card>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-4 py-2.5 font-normal">Taak</th>
                        <th className="px-4 py-2.5 font-normal">Model</th>
                        <th className="hidden px-4 py-2.5 font-normal sm:table-cell">Caching</th>
                        <th className="px-4 py-2.5 text-right font-normal">Kosten</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.tasks.map((task) => (
                        <tr key={`${task.task}-${task.model}`} className="border-b last:border-b-0">
                          <td className="px-4 py-2.5">{task.task}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{task.model}</td>
                          <td className="hidden px-4 py-2.5 sm:table-cell">
                            <CacheCell totals={task} rate={rate} />
                          </td>
                          <td className="px-4 py-2.5">
                            <CostCell totals={task} rate={rate} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {/* Alle bedrijven, zodat een beheerder niet per bedrijf hoeft te klikken */}
            {report.companies.length > 1 && (
              <Card>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-4 py-2.5 font-normal">Bedrijf ({monthLabel(report.month)})</th>
                        <th className="px-4 py-2.5 text-right font-normal">Kosten</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.companies.map((company) => (
                        <tr key={company.companyId} className="border-b last:border-b-0">
                          <td className="px-4 py-2.5">
                            {companyName(company.companyId)}
                            {company.companyId === companyId && (
                              <Badge variant="secondary" className="ml-2">dit bedrijf</Badge>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <CostCell totals={company} rate={rate} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {report.totals.unpricedCalls > 0 && (
              <p className="text-xs text-muted-foreground">
                {report.totals.unpricedCalls} aanroepen draaiden op een model waarvan het tarief hier niet bekend is
                (bijvoorbeeld een eigen endpoint). De tokens tellen mee, het bedrag niet — zo blijft het getal eerlijk in
                plaats van geschat.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  )
}
