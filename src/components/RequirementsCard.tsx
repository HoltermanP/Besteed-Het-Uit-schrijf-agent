'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Bot, Check, CheckCircle2, Circle, HelpCircle, ListChecks, Minus, Undo2, UserRound } from 'lucide-react'
import type { RequirementStatus, RequirementStatusEntry, TenderAnalysis } from '../types/tenderAnalysis'
import {
  requirementCategories,
  requirementCategoryLabels,
  resolveRequirementStatuses,
  summarizeRequirements,
  type ResolvedRequirement,
} from '../lib/requirements'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * Eisenregister in de werkruimte: welke eisen uit de analyse al zijn afgedekt, welke nog
 * open staan en wat het bidteam daarvoor moet aanleveren. Schrijfstukken worden automatisch
 * afgevinkt zodra ze geschreven zijn; de AI-reviewer toetst de tekstuele eisen; de rest
 * vinkt de gebruiker zelf af (met optionele toelichting).
 */

type Props = {
  analysis: TenderAnalysis
  statuses: Record<string, RequirementStatusEntry>
  /** Ids van schrijfstukken waarvoor al een concept is geschreven. */
  writtenDocumentIds: Set<string>
  onSetStatus: (id: string, status: RequirementStatus, note?: string) => void
}

type Filter = 'open' | 'alle' | 'voldaan' | 'nvt'

const filterLabels: Record<Filter, string> = {
  open: 'Open',
  alle: 'Alle',
  voldaan: 'Voldaan',
  nvt: 'N.v.t.',
}

const OPEN_PREVIEW_LIMIT = 6

function isOpen(req: ResolvedRequirement) {
  return req.status === 'open' || req.status === 'aandacht'
}

/** Open eisen eerst waar de reviewer iets mist, dan verplichte, dan vragen aan het bidteam. */
function openOrder(a: ResolvedRequirement, b: ResolvedRequirement) {
  if (a.status !== b.status) return a.status === 'aandacht' ? -1 : 1
  if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1
  const aQ = a.checkBy === 'gebruiker' ? 0 : 1
  const bQ = b.checkBy === 'gebruiker' ? 0 : 1
  return aQ - bQ
}

function StatusIcon({ status }: { status: RequirementStatus }) {
  if (status === 'voldaan') return <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
  if (status === 'aandacht') return <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
  if (status === 'nvt') return <Minus size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
  return <Circle size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
}

function RequirementRow({
  req,
  onSetStatus,
  withNote,
}: {
  req: ResolvedRequirement
  onSetStatus: Props['onSetStatus']
  withNote?: boolean
}) {
  const open = isOpen(req)
  const short = req.text.length > 70 ? `${req.text.slice(0, 67)}…` : req.text
  return (
    <li
      data-testid="requirement-row"
      data-status={req.status}
      className={cn(
        'rounded-md border bg-card p-2',
        req.status === 'voldaan' && 'opacity-75',
        req.status === 'nvt' && 'opacity-55',
        req.status === 'aandacht' && 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30',
      )}
    >
      <div className="flex items-start gap-2">
        <StatusIcon status={req.status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant="outline" className="text-[10px] uppercase">
              {requirementCategoryLabels[req.category]}
            </Badge>
            {req.mandatory ? <span className="text-[10px] font-semibold uppercase text-destructive">verplicht</span> : null}
            <span
              className="inline-flex items-center text-muted-foreground"
              title={req.checkBy === 'agent' ? 'Toetsbaar door de schrijf-/reviewagent' : 'Af te dekken door het bidteam'}
            >
              {req.checkBy === 'agent' ? <Bot size={12} /> : <UserRound size={12} />}
            </span>
          </div>
          <p className="mt-0.5 break-words text-xs leading-relaxed text-foreground">{req.text}</p>
          {open && req.question ? (
            <p className="mt-1 flex gap-1 break-words text-xs italic leading-relaxed text-primary">
              <HelpCircle size={12} className="mt-0.5 shrink-0" /> {req.question}
            </p>
          ) : null}
          {req.entry?.note ? (
            <p className="mt-1 break-words text-[11px] leading-relaxed text-muted-foreground">
              <strong>{req.entry.by === 'agent' ? 'Reviewer' : 'Notitie'}:</strong> {req.entry.note}
            </p>
          ) : null}
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {req.source}
            {req.reference ? ` · ${req.reference}` : ''}
            {req.status === 'voldaan' && req.auto ? (req.entry ? ' · bevestigd door reviewer' : ' · automatisch afgevinkt') : ''}
          </p>
          {withNote ? (
            <Input
              key={req.entry?.note ?? ''}
              defaultValue={req.entry?.note ?? ''}
              placeholder="Toelichting of bewijs (optioneel)"
              aria-label={`Toelichting bij: ${short}`}
              className="mt-1.5 h-7 text-xs"
              onBlur={(event) => {
                const value = event.target.value.trim()
                if (value !== (req.entry?.note ?? '')) onSetStatus(req.id, req.status, value)
              }}
            />
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {open ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
                aria-label={`Markeer voldaan: ${short}`}
                title="Markeer als voldaan"
                onClick={() => onSetStatus(req.id, 'voldaan')}
              >
                <Check size={14} /> Voldaan
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground"
                aria-label={`Markeer niet van toepassing: ${short}`}
                title="Niet van toepassing op deze inschrijving"
                onClick={() => onSetStatus(req.id, 'nvt')}
              >
                <Minus size={14} /> N.v.t.
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground"
              aria-label={`Heropen: ${short}`}
              title="Terug naar open"
              onClick={() => onSetStatus(req.id, 'open')}
            >
              <Undo2 size={14} /> Heropen
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

export default function RequirementsCard({ analysis, statuses, writtenDocumentIds, onSetStatus }: Props) {
  const [filter, setFilter] = useState<Filter>('open')

  const resolved = useMemo(
    () => resolveRequirementStatuses(analysis.requirements ?? [], statuses, writtenDocumentIds),
    [analysis.requirements, statuses, writtenDocumentIds],
  )
  const summary = useMemo(() => summarizeRequirements(resolved), [resolved])
  const openItems = useMemo(() => resolved.filter(isOpen).sort(openOrder), [resolved])

  if (!resolved.length) return null

  const percent = summary.total ? Math.round((summary.done / summary.total) * 100) : 0

  const filtered = resolved.filter((req) =>
    filter === 'alle' ? true : filter === 'open' ? isOpen(req) : req.status === filter,
  )
  const grouped = requirementCategories
    .map((category) => ({ category, items: filtered.filter((req) => req.category === category) }))
    .filter((group) => group.items.length)

  return (
    <Card>
      <CardContent className="space-y-3">
        <section aria-label="Eisen aan de inschrijving" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-primary">
              <ListChecks size={17} />
              <h2 className="text-sm font-semibold">Eisen aan de inschrijving</h2>
            </div>
            <Badge variant={summary.open ? 'secondary' : 'default'} data-testid="requirements-progress">
              {summary.done}/{summary.total} afgedekt
            </Badge>
          </div>
          <Progress value={percent} aria-label={`${percent}% van de eisen afgedekt`} />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {summary.open ? (
              <>
                Nog <strong className="text-foreground">{summary.open}</strong> open
                {summary.openMandatory ? (
                  <>
                    , waarvan <strong className="text-destructive">{summary.openMandatory} verplicht</strong>
                  </>
                ) : null}
                {summary.questions ? <> · {summary.questions} vraag{summary.questions === 1 ? '' : 'en'} aan het bidteam</> : null}
                {summary.attention ? <> · {summary.attention} door de reviewer gemist</> : null}.
              </>
            ) : (
              'Alle eisen uit de analyse zijn afgedekt of niet van toepassing.'
            )}
          </p>

          {openItems.length ? (
            <ul className="grid gap-1.5">
              {openItems.slice(0, OPEN_PREVIEW_LIMIT).map((req) => (
                <RequirementRow key={req.id} req={req} onSetStatus={onSetStatus} />
              ))}
            </ul>
          ) : null}

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                <ListChecks size={15} /> Alle eisen ({resolved.length})
                {openItems.length > OPEN_PREVIEW_LIMIT ? ` · nog ${openItems.length - OPEN_PREVIEW_LIMIT} open` : ''}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] gap-3 overflow-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-primary">
                  <ListChecks size={18} /> Eisenregister
                </DialogTitle>
              </DialogHeader>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Alle eisen die de analyse uit de aanbestedingsstukken heeft gehaald. <Bot size={12} className="inline" /> = toetst
                de schrijf-/reviewagent aan de tekst; <UserRound size={12} className="inline" /> = moet het bidteam zelf
                aanleveren of bevestigen. Vink af wat geregeld is en noteer waar het bewijs staat.
              </p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter eisen">
                {(Object.keys(filterLabels) as Filter[]).map((key) => {
                  const count =
                    key === 'alle'
                      ? resolved.length
                      : key === 'open'
                        ? openItems.length
                        : resolved.filter((req) => req.status === key).length
                  return (
                    <Button
                      key={key}
                      size="sm"
                      variant={filter === key ? 'default' : 'outline'}
                      aria-pressed={filter === key}
                      onClick={() => setFilter(key)}
                    >
                      {filterLabels[key]} ({count})
                    </Button>
                  )
                })}
              </div>
              {grouped.length ? (
                <div className="space-y-3">
                  {grouped.map((group) => (
                    <div key={group.category} className="space-y-1.5">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">
                        {requirementCategoryLabels[group.category]} <span className="text-muted-foreground">({group.items.length})</span>
                      </h3>
                      <ul className="grid gap-1.5">
                        {group.items.map((req) => (
                          <RequirementRow key={req.id} req={req} onSetStatus={onSetStatus} withNote />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Geen eisen in deze selectie.</p>
              )}
            </DialogContent>
          </Dialog>
        </section>
      </CardContent>
    </Card>
  )
}
