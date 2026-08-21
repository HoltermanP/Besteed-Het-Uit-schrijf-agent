'use client'

import { useMemo } from 'react'
import { AlertTriangle, Brain, Check, HelpCircle, Loader2, Sparkles, Undo2, Wand2, X } from 'lucide-react'
import type { ImprovementProposal, ImprovementRound, InformationRequest, Stage } from '../types/dossier'
import { nextStageFor, summarizeRound } from '../lib/improvementRound'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/**
 * De verbeterronde tussen twee stadia: wat de AI-review aan informatie vraagt en wat ze
 * voorstelt om de volgende versie beter te maken of de uitvraag te overtreffen. De gebruiker
 * beantwoordt, keurt goed of wijst af; daarna verwerkt de schrijfagent uitsluitend wat is
 * goedgekeurd en beantwoord — nooit aannames.
 */

const stageLabel: Record<Stage, string> = { brons: 'Brons', zilver: 'Zilver', goud: 'Goud' }

const priorityClass: Record<InformationRequest['priority'], string> = {
  kritiek: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300',
  hoog: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  normaal: 'bg-muted text-muted-foreground',
}

type Props = {
  round: ImprovementRound
  currentStage: Stage
  busy: boolean
  onChange: (round: ImprovementRound) => void
  onApply: () => void
  onReview: () => void
}

export default function ImprovementRoundPanel({ round, currentStage, busy, onChange, onApply, onReview }: Props) {
  const summary = useMemo(() => summarizeRound(round), [round])
  const target = nextStageFor(currentStage)
  const targetLabel = currentStage === 'goud' ? 'Verwerk in Goud-versie' : `Verwerk naar ${stageLabel[target]}`

  const updateRequest = (id: string, patch: Partial<InformationRequest>) =>
    onChange({
      ...round,
      informationRequests: round.informationRequests.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })

  const updateProposal = (id: string, patch: Partial<ImprovementProposal>) =>
    onChange({
      ...round,
      proposals: round.proposals.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })

  const saveAnswer = (item: InformationRequest, value: string) => {
    const answer = value.trim()
    if (answer === (item.answer ?? '').trim() && (answer ? item.status === 'beantwoord' : item.status !== 'beantwoord')) return
    updateRequest(item.id, { answer: answer || undefined, status: answer ? 'beantwoord' : 'open' })
  }

  const openRequests = round.informationRequests.filter((item) => item.status === 'open')
  const settledRequests = round.informationRequests.filter((item) => item.status !== 'open')
  const pendingProposals = round.proposals.filter((item) => item.status === 'voorgesteld')
  const decidedProposals = round.proposals.filter((item) => item.status !== 'voorgesteld')

  if (summary.isEmpty) return null

  return (
    <section
      className="mb-[14px] rounded-md border border-primary/30 bg-card p-3"
      aria-label="Verbeterronde"
      data-testid="improvement-round"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Wand2 size={17} /> Verbeterronde naar {stageLabel[target]}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {summary.openQuestions ? <Badge variant="secondary">{summary.openQuestions} vragen open</Badge> : null}
          {summary.pendingProposals ? <Badge variant="secondary">{summary.pendingProposals} voorstellen te beoordelen</Badge> : null}
          {summary.approved ? <Badge>{summary.approved} goedgekeurd</Badge> : null}
        </div>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        AI-review van de {stageLabel[round.stage]}-versie{round.model ? ` (${round.model})` : ''}. Beantwoord wat het
        bidteam weet en keur voorstellen goed; de schrijfagent verwerkt alleen wat is goedgekeurd en beantwoord en vult
        niets in met aannames.
      </p>

      {openRequests.length ? (
        <div className="mt-3 space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
            <HelpCircle size={14} /> Informatie gevraagd ({openRequests.length})
          </h3>
          <ul className="grid gap-2">
            {openRequests.map((item) => (
              <li key={item.id} data-testid="info-request" className="rounded-md border bg-background p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', priorityClass[item.priority])}>
                    {item.priority}
                  </span>
                  {item.section ? <span className="text-[11px] text-muted-foreground">Sectie: {item.section}</span> : null}
                </div>
                <p className="mt-1 text-sm font-medium leading-snug">{item.question}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.reason}</p>
                <Textarea
                  key={item.answer ?? ''}
                  defaultValue={item.answer ?? ''}
                  placeholder="Antwoord van het bidteam (feiten, cijfers, bron)…"
                  aria-label={`Antwoord op: ${item.question}`}
                  className="mt-2 min-h-[64px] text-sm"
                  onBlur={(event) => saveAnswer(item, event.target.value)}
                />
                <div className="mt-1.5 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => updateRequest(item.id, { status: 'overgeslagen' })}
                    title="Deze informatie is er niet — de agent laat dit punt weg"
                  >
                    <X size={13} /> Overslaan
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pendingProposals.length ? (
        <div className="mt-3 space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
            <Sparkles size={14} /> Voorstellen ({pendingProposals.length})
          </h3>
          <ul className="grid gap-2">
            {pendingProposals.map((item) => (
              <ProposalCard key={item.id} item={item} onUpdate={updateProposal} />
            ))}
          </ul>
        </div>
      ) : null}

      {decidedProposals.some((item) => item.status === 'goedgekeurd' && item.needsInput) ? (
        <div className="mt-3 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">Goedgekeurd — input nodig</h3>
          <ul className="grid gap-2">
            {decidedProposals
              .filter((item) => item.status === 'goedgekeurd' && item.needsInput)
              .map((item) => (
                <ProposalCard key={item.id} item={item} onUpdate={updateProposal} />
              ))}
          </ul>
        </div>
      ) : null}

      {settledRequests.length || decidedProposals.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Afgehandeld: {summary.answered} beantwoord, {settledRequests.length - summary.answered} overgeslagen,{' '}
            {decidedProposals.length} voorstellen beoordeeld
          </summary>
          <ul className="mt-2 grid gap-1.5">
            {settledRequests.map((item) => (
              <li key={item.id} className="flex items-start gap-2 rounded-md border bg-background p-2 text-xs">
                {item.status === 'beantwoord' ? (
                  <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                ) : (
                  <X size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{item.question}</span>
                  {item.answer ? <span className="block text-muted-foreground">{item.answer}</span> : null}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px] text-muted-foreground"
                  aria-label={`Heropen vraag: ${item.question}`}
                  onClick={() => updateRequest(item.id, { status: 'open' })}
                >
                  <Undo2 size={12} /> Heropen
                </Button>
              </li>
            ))}
            {decidedProposals.map((item) => (
              <li key={item.id} className="flex items-start gap-2 rounded-md border bg-background p-2 text-xs">
                {item.status === 'afgewezen' ? (
                  <X size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{item.title}</span>
                  <span className="text-muted-foreground"> — {item.status}</span>
                </span>
                {item.status !== 'verwerkt' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[11px] text-muted-foreground"
                    aria-label={`Heroverweeg voorstel: ${item.title}`}
                    onClick={() => updateProposal(item.id, { status: 'voorgesteld' })}
                  >
                    <Undo2 size={12} /> Heroverweeg
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <Button onClick={onApply} disabled={busy || !summary.hasWork} title="Schrijft de volgende versie met de goedgekeurde voorstellen en antwoorden">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />} {targetLabel}
        </Button>
        <Button variant="outline" size="sm" onClick={onReview} disabled={busy}>
          <Brain size={15} /> Nieuwe AI-review
        </Button>
        {summary.approvedMissingInput ? (
          <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle size={13} /> {summary.approvedMissingInput} goedgekeurd voorstel
            {summary.approvedMissingInput === 1 ? ' mist' : 'len missen'} nog de gevraagde feiten — zonder input schrijft de
            agent daarover niets.
          </span>
        ) : !summary.hasWork ? (
          <span className="text-xs text-muted-foreground">Beantwoord een vraag of keur een voorstel goed om te kunnen verwerken.</span>
        ) : null}
      </div>
    </section>
  )
}

function ProposalCard({
  item,
  onUpdate,
}: {
  item: ImprovementProposal
  onUpdate: (id: string, patch: Partial<ImprovementProposal>) => void
}) {
  const approved = item.status === 'goedgekeurd'
  return (
    <li
      data-testid="proposal"
      className={cn(
        'rounded-md border bg-background p-2.5',
        item.kind === 'overtreffen' && 'border-violet-300 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/20',
        approved && 'border-emerald-300',
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={item.kind === 'overtreffen' ? 'default' : 'outline'} className="text-[10px] uppercase">
          {item.kind === 'overtreffen' ? 'Overtreffen' : 'Verbeteren'}
        </Badge>
        {item.criterion ? <span className="text-[11px] text-muted-foreground">{item.criterion}</span> : null}
        {item.section ? <span className="text-[11px] text-muted-foreground">· {item.section}</span> : null}
        {approved ? <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">goedgekeurd</span> : null}
      </div>
      <p className="mt-1 text-sm font-medium leading-snug">{item.title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-foreground">{item.detail}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
        <strong>Waarom:</strong> {item.rationale}
      </p>
      {item.needsInput ? (
        <div className="mt-2 rounded-md border border-dashed border-amber-300 bg-amber-50/60 p-2 dark:border-amber-900 dark:bg-amber-950/20">
          <p className="flex gap-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
            <HelpCircle size={13} className="mt-0.5 shrink-0" /> Nodig van het bidteam: {item.needsInput}
          </p>
          <Textarea
            key={item.input ?? ''}
            defaultValue={item.input ?? ''}
            placeholder="Feitelijke input (zonder deze input wordt dit niet geschreven)…"
            aria-label={`Input voor voorstel: ${item.title}`}
            className="mt-1.5 min-h-[56px] text-sm"
            onBlur={(event) => {
              const value = event.target.value.trim()
              if (value !== (item.input ?? '').trim()) onUpdate(item.id, { input: value || undefined })
            }}
          />
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap justify-end gap-1.5">
        {approved ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            aria-label={`Trek goedkeuring in: ${item.title}`}
            onClick={() => onUpdate(item.id, { status: 'voorgesteld' })}
          >
            <Undo2 size={13} /> Intrekken
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground"
              aria-label={`Wijs af: ${item.title}`}
              onClick={() => onUpdate(item.id, { status: 'afgewezen' })}
            >
              <X size={13} /> Afwijzen
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-2 text-xs"
              aria-label={`Keur goed: ${item.title}`}
              onClick={() => onUpdate(item.id, { status: 'goedgekeurd' })}
            >
              <Check size={13} /> Goedkeuren
            </Button>
          </>
        )}
      </div>
    </li>
  )
}
