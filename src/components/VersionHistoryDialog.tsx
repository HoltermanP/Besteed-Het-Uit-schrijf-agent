'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Bot, History, PenLine, RotateCcw, Sparkles, Wand2 } from 'lucide-react'
import type { DraftVersion, DraftVersionKind, Stage } from '../types/dossier'
import { formatVersionMoment, versionKindLabels } from '../lib/draftVersions'
import { diffDraftHtml, type DiffRow } from '../lib/draftDiff'
import { countWords } from '../lib/tenderAnalysis'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

/**
 * Versiegeschiedenis van één stuk: alles wat de schrijfagent genereerde of verwerkte en
 * elke eigen bewerkingsronde. Je legt twee versies naast elkaar (met de verschillen per
 * blok) en herstelt een oudere versie; de huidige tekst wordt daarbij eerst als versie
 * bewaard, zodat er nooit werk verdwijnt.
 */

const LIVE_ID = 'huidig'

const stageLabel: Record<Stage, string> = { brons: 'Brons', zilver: 'Zilver', goud: 'Goud' }

const kindIcon: Record<DraftVersionKind, typeof Sparkles> = {
  generatie: Sparkles,
  verwerking: Wand2,
  bewerking: PenLine,
  herstel: RotateCcw,
}

const statusMeta: Record<DiffRow['status'], { label: string; className: string }> = {
  gelijk: { label: 'Ongewijzigd', className: 'bg-muted text-muted-foreground' },
  gewijzigd: { label: 'Gewijzigd', className: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300' },
  toegevoegd: { label: 'Toegevoegd', className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300' },
  verwijderd: { label: 'Verwijderd', className: 'bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-300' },
}

type Entry = {
  id: string
  kind: DraftVersionKind | 'huidig'
  label: string
  stage: Stage
  html: string
  words: number
  createdAt: string | null
  provider?: string
  model?: string
  /** Ontbreekt bij de huidige tekst in de editor: die is er al. */
  version: DraftVersion | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  draftTitle: string
  versions: DraftVersion[]
  currentHtml: string
  currentStage: Stage
  busy: boolean
  onRestore: (version: DraftVersion) => void
}

function paneClass(status: DiffRow['status'], side: 'left' | 'right') {
  if (status === 'gelijk') return ''
  if (status === 'toegevoegd') return side === 'right' ? 'is-added' : 'is-empty'
  if (status === 'verwijderd') return side === 'left' ? 'is-removed' : 'is-empty'
  return 'is-changed'
}

export default function VersionHistoryDialog({
  open,
  onOpenChange,
  draftTitle,
  versions,
  currentHtml,
  currentStage,
  busy,
  onRestore,
}: Props) {
  const entries = useMemo<Entry[]>(() => {
    const live: Entry = {
      id: LIVE_ID,
      kind: 'huidig',
      label: 'Huidige tekst in de editor',
      stage: currentStage,
      html: currentHtml,
      words: countWords(currentHtml),
      createdAt: null,
      version: null,
    }
    const history = [...versions]
      .reverse()
      .map<Entry>((version) => ({ ...version, kind: version.kind, version }))
    return [live, ...history]
  }, [currentHtml, currentStage, versions])

  const newestVersionId = versions.length ? versions[versions.length - 1].id : LIVE_ID
  const [leftId, setLeftId] = useState<string>(newestVersionId)
  const [rightId, setRightId] = useState<string>(LIVE_ID)
  const [onlyChanges, setOnlyChanges] = useState(true)
  const [tab, setTab] = useState<'geschiedenis' | 'vergelijken'>('geschiedenis')

  // Bij het openen: vergelijk standaard de laatst bewaarde versie met de huidige tekst.
  useEffect(() => {
    if (!open) return
    setLeftId(newestVersionId)
    setRightId(LIVE_ID)
    setTab('geschiedenis')
  }, [open, newestVersionId])

  const left = entries.find((entry) => entry.id === leftId) ?? entries[0]
  const right = entries.find((entry) => entry.id === rightId) ?? entries[0]
  const diff = useMemo(() => diffDraftHtml(left?.html ?? '', right?.html ?? ''), [left, right])
  const visibleRows = onlyChanges ? diff.rows.filter((row) => row.status !== 'gelijk') : diff.rows

  const optionLabel = (entry: Entry) =>
    entry.createdAt
      ? `${formatVersionMoment(entry.createdAt)} · ${versionKindLabels[entry.kind as DraftVersionKind]} (${stageLabel[entry.stage]})`
      : `${entry.label} (${stageLabel[entry.stage]})`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] gap-3 overflow-hidden sm:max-w-6xl" data-testid="version-history">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <History size={18} /> Versies — {draftTitle}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Elke generatie, verwerking en eigen bewerkingsronde van dit stuk wordt bewaard. Herstel je een oudere versie,
          dan gaat de huidige tekst eerst als versie de geschiedenis in — er verdwijnt nooit werk.
        </p>

        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="min-h-0 overflow-hidden">
          <TabsList>
            <TabsTrigger value="geschiedenis">
              <History size={15} /> Geschiedenis
              <Badge variant="secondary">{versions.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="vergelijken">
              <ArrowLeftRight size={15} /> Vergelijken
            </TabsTrigger>
          </TabsList>

          <TabsContent value="geschiedenis" className="max-h-[62vh] min-h-0 overflow-auto">
            {versions.length ? (
              <ul className="grid gap-2">
                {entries.map((entry) => {
                  const Icon = entry.version ? kindIcon[entry.version.kind] : Bot
                  return (
                    <li
                      key={entry.id}
                      data-testid={entry.version ? 'version-entry' : 'version-current'}
                      className={cn(
                        'flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-2.5',
                        !entry.version && 'border-primary/40 bg-primary/5',
                      )}
                    >
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                          <Icon size={15} className="shrink-0 text-primary" />
                          <span className="break-words">{entry.label}</span>
                          <Badge variant="secondary">{stageLabel[entry.stage]}</Badge>
                          {entry.version ? (
                            <Badge variant="outline">{versionKindLabels[entry.version.kind]}</Badge>
                          ) : (
                            <Badge>Nu in de editor</Badge>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {entry.createdAt ? `${formatVersionMoment(entry.createdAt)} · ` : ''}
                          {entry.words.toLocaleString('nl-NL')} woorden
                          {entry.model ? ` · ${entry.provider ?? 'AI'} (${entry.model})` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setLeftId(entry.id)
                            setRightId(entry.id === LIVE_ID ? newestVersionId : LIVE_ID)
                            setTab('vergelijken')
                          }}
                          title="Zet deze versie in de vergelijking"
                        >
                          <ArrowLeftRight size={14} /> Vergelijk
                        </Button>
                        {entry.version ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => onRestore(entry.version!)}
                            title="Zet deze versie terug in de editor"
                          >
                            <RotateCcw size={14} /> Herstel
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="rounded-md border bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
                Nog geen versies bewaard. Zodra de schrijfagent dit stuk schrijft, opmerkingen verwerkt of je zelf iets
                aanpast, staat elke ronde hier terug.
              </p>
            )}
          </TabsContent>

          <TabsContent value="vergelijken" className="min-h-0 space-y-2 overflow-hidden">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={leftId} onValueChange={setLeftId}>
                <SelectTrigger className="w-[260px]" aria-label="Versie A">
                  <SelectValue placeholder="Versie A" />
                </SelectTrigger>
                <SelectContent>
                  {entries.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {optionLabel(entry)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ArrowLeftRight size={16} className="text-muted-foreground" />
              <Select value={rightId} onValueChange={setRightId}>
                <SelectTrigger className="w-[260px]" aria-label="Versie B">
                  <SelectValue placeholder="Versie B" />
                </SelectTrigger>
                <SelectContent>
                  {entries.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {optionLabel(entry)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" onClick={() => setOnlyChanges((current) => !current)}>
                {onlyChanges ? 'Toon ook ongewijzigde delen' : 'Alleen verschillen'}
              </Button>
              <div className="flex flex-wrap gap-1.5" data-testid="diff-summary">
                <Badge variant="secondary">{diff.changed} gewijzigd</Badge>
                <Badge variant="secondary">{diff.added} toegevoegd</Badge>
                <Badge variant="secondary">{diff.removed} verwijderd</Badge>
              </div>
            </div>

            {diff.identical ? (
              <p className="rounded-md border bg-muted p-3 text-xs text-muted-foreground">
                Deze twee versies hebben dezelfde inhoud.
              </p>
            ) : (
              <div className="max-h-[58vh] overflow-auto rounded-md border">
                <div className="sticky top-0 z-10 grid grid-cols-2 gap-px border-b bg-muted text-xs font-semibold">
                  <span className="truncate px-2 py-1.5">A · {left ? optionLabel(left) : ''}</span>
                  <span className="truncate px-2 py-1.5">B · {right ? optionLabel(right) : ''}</span>
                </div>
                {visibleRows.map((row) => (
                  <div key={row.id} data-testid={`diff-row-${row.status}`} className="border-b last:border-b-0">
                    {row.status === 'gelijk' ? null : (
                      <p className="flex flex-wrap items-center gap-1.5 bg-muted/50 px-2 py-1">
                        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', statusMeta[row.status].className)}>
                          {statusMeta[row.status].label}
                        </span>
                        {row.addedWords ? <span className="text-[11px] text-emerald-700 dark:text-emerald-400">+{row.addedWords} woorden</span> : null}
                        {row.removedWords ? <span className="text-[11px] text-red-700 dark:text-red-400">−{row.removedWords} woorden</span> : null}
                      </p>
                    )}
                    <div className="grid gap-px sm:grid-cols-2">
                      <div
                        className={cn('proposal-doc version-pane', paneClass(row.status, 'left'))}
                        dangerouslySetInnerHTML={{ __html: row.left ?? '' }}
                      />
                      <div
                        className={cn('proposal-doc version-pane', paneClass(row.status, 'right'))}
                        dangerouslySetInnerHTML={{ __html: row.right ?? '' }}
                      />
                    </div>
                  </div>
                ))}
                {!visibleRows.length ? (
                  <p className="p-3 text-xs text-muted-foreground">Geen verschillen om te tonen.</p>
                ) : null}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
