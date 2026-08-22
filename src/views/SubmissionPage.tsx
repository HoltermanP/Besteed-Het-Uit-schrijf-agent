'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  ExternalLink,
  FileDown,
  FileText,
  Files,
  HelpCircle,
  Loader2,
  Minus,
  PackageCheck,
  Paperclip,
  PenLine,
  Plus,
  Send,
  Timer,
  Trash2,
  Undo2,
  Upload,
  UserRound,
  X,
} from 'lucide-react'
import { loadDossier, saveDossier, setActiveDossierId } from '../lib/dossier'
import { loadDraftsFromSnapshot } from '../lib/drafts'
import { normalizeStoredAnalysis } from '../lib/storedAnalysis'
import { upsertProject } from '../lib/projects'
import { blobViewUrl } from '../lib/blobFiles'
import { countProposalPdfPages, exportPdfFromHtml } from '../lib/pdfExport'
import { slugForFile, stripCommentMarks } from '../lib/draftHtml'
import { storeSubmissionFile } from '../lib/submissionFilesApi'
import {
  buildSubmissionItems,
  deadlineDate,
  describeCountdown,
  formatDeadline,
  formatFileSize,
  makeCustomSubmissionItem,
  normalizeSubmission,
  submissionSectionLabels,
  submissionStatusLabels,
  submissionStatuses,
  submissionToRequirementStatus,
  summarizeSubmission,
  type Countdown,
  type SubmissionItem,
  type SubmissionSection,
} from '../lib/submission'
import type { CustomSubmissionItem, DossierSnapshot, DraftDocument, SubmissionEntry, SubmissionState, SubmissionStatus, TenderProject } from '../types/dossier'
import type { RequirementStatusEntry } from '../types/tenderAnalysis'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ModeToggle } from '@/components/mode-toggle'
import { cn } from '@/lib/utils'

/**
 * Indieningsscherm ("laatste dag"): één overzicht van alle stukken, bijlagen en eisen aan
 * het bidteam, elk met status, eigenaar en bestand, plus de countdown naar de deadline.
 * Leest het dossier uit de opslag en schrijft alleen deadline, eisstatussen en het
 * indieningsblok terug — de werkplek blijft eigenaar van concepten en bronnen.
 */

const sectionMeta: Record<SubmissionSection, { Icon: typeof Files; hint: string }> = {
  stuk: { Icon: PenLine, hint: 'De stukken die de schrijfagent schrijft — exporteer ze of hang het definitieve bestand eraan.' },
  bijlage: { Icon: Paperclip, hint: 'Formulieren en bewijsstukken die naast de schrijfstukken worden ingediend (UEA, referenties, verklaringen, prijsblad).' },
  eis: { Icon: ClipboardCheck, hint: 'Eisen uit het eisenregister die het bidteam buiten de tekst om moet afdekken; afvinken werkt door in het register.' },
}

const stageLabels: Record<DraftDocument['stage'], string> = { brons: 'Brons', zilver: 'Zilver', goud: 'Goud' }

const severityClasses = {
  ruim: 'border-primary/30 bg-primary/5 text-primary',
  krap: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  kritiek: 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200',
  verstreken: 'border-destructive bg-destructive/10 text-destructive',
} as const

function StatusIcon({ status, attention }: { status: SubmissionStatus; attention?: boolean }) {
  if (status === 'gereed') return <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
  if (status === 'nvt') return <Minus size={18} className="shrink-0 text-muted-foreground" />
  if (attention) return <AlertTriangle size={18} className="shrink-0 text-amber-600" />
  if (status === 'bezig') return <Loader2 size={18} className="shrink-0 text-primary" />
  return <Circle size={18} className="shrink-0 text-muted-foreground" />
}

function formatMoment(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function CountdownTiles({ countdown }: { countdown: Countdown }) {
  const tiles = [
    { value: countdown.days, label: countdown.days === 1 ? 'dag' : 'dagen' },
    { value: countdown.hours, label: 'uur' },
    { value: countdown.minutes, label: countdown.minutes === 1 ? 'minuut' : 'minuten' },
    { value: countdown.seconds, label: countdown.seconds === 1 ? 'seconde' : 'seconden' },
  ]
  return (
    <div className="grid grid-cols-4 gap-2" aria-hidden>
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-md border bg-card/80 px-2 py-2 text-center">
          <div className="text-2xl font-bold tabular-nums leading-none sm:text-3xl">{String(tile.value).padStart(2, '0')}</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">{tile.label}</div>
        </div>
      ))}
    </div>
  )
}

type Loaded = {
  snapshot: DossierSnapshot
  project: TenderProject
  drafts: DraftDocument[]
  analysis: ReturnType<typeof normalizeStoredAnalysis>
  requirementStatuses: Record<string, RequirementStatusEntry>
  submission: SubmissionState
}

function loadSubmissionState(projectId: string): Loaded | null {
  const snapshot = loadDossier<DossierSnapshot>(projectId)
  if (!snapshot) return null
  const project: TenderProject = {
    title: snapshot.project?.title ?? 'Naamloos project',
    tendernedId: snapshot.project?.tendernedId ?? '',
    buyer: snapshot.project?.buyer ?? '',
    deadline: snapshot.project?.deadline ?? '',
    deadlineTime: snapshot.project?.deadlineTime,
  }
  const analysis = normalizeStoredAnalysis(snapshot.analysis ?? null)
  const documents = snapshot.documents ?? []
  const { drafts } = loadDraftsFromSnapshot({ ...snapshot, analysis }, project, documents, {
    draft: snapshot.draft ?? '',
    stage: snapshot.stage ?? 'brons',
    comments: Array.isArray(snapshot.comments) ? snapshot.comments : [],
  })
  return {
    snapshot,
    project,
    drafts,
    analysis,
    requirementStatuses: snapshot.requirementStatuses ?? {},
    submission: normalizeSubmission(snapshot.submission),
  }
}

export default function SubmissionPage({ projectId }: { projectId: string }) {
  const loaded = useMemo(() => loadSubmissionState(projectId), [projectId])
  if (!loaded) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
        <Card className="max-w-md">
          <CardContent className="space-y-3 text-center">
            <h1 className="text-lg font-semibold">Project niet gevonden</h1>
            <p className="text-sm text-muted-foreground">Dit project bestaat niet (meer) in de werkruimte van het actieve bedrijf.</p>
            <Button asChild>
              <Link href="/">Naar het projectenoverzicht</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }
  return <SubmissionWorkspace key={projectId} projectId={projectId} loaded={loaded} />
}

function SubmissionWorkspace({ projectId, loaded }: { projectId: string; loaded: Loaded }) {
  const { drafts, analysis } = loaded
  const [project, setProject] = useState<TenderProject>(loaded.project)
  const [requirementStatuses, setRequirementStatuses] = useState(loaded.requirementStatuses)
  const [submission, setSubmission] = useState<SubmissionState>(loaded.submission)
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [customTitle, setCustomTitle] = useState('')
  const [customKind, setCustomKind] = useState<CustomSubmissionItem['kind']>('bewijsstuk')
  const [customMandatory, setCustomMandatory] = useState(true)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    setActiveDossierId(projectId)
  }, [projectId])

  // Alleen de velden van dit scherm terugschrijven; de rest van het dossier (concepten,
  // bronnen) blijft zoals de werkplek het het laatst heeft opgeslagen.
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    const current = loadDossier<DossierSnapshot>(projectId) ?? loaded.snapshot
    const updatedAt = new Date().toISOString()
    saveDossier(projectId, {
      ...current,
      project: { ...current.project, deadline: project.deadline, deadlineTime: project.deadlineTime },
      requirementStatuses,
      submission,
      updatedAt,
    })
    upsertProject({
      id: projectId,
      title: current.project?.title || 'Naamloos project',
      buyer: current.project?.buyer ?? '',
      updatedAt,
      source: projectId.startsWith('prj-') ? 'blank' : 'tender',
    })
  }, [projectId, loaded.snapshot, project.deadline, project.deadlineTime, requirementStatuses, submission])

  const target = useMemo(() => deadlineDate(project), [project])
  useEffect(() => {
    if (!target) return
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [target])
  const countdown = target ? describeCountdown(target, now) : null

  // Paginagetal per stuk uit dezelfde bouwer als de PDF-export: alleen zo klopt de
  // toets op "max. 2 A4" met wat er straks daadwerkelijk wordt ingediend.
  const pagesByDraftId = useMemo(() => {
    const pages: Record<string, number | undefined> = {}
    for (const draft of drafts) {
      try {
        pages[draft.id] = countProposalPdfPages(draft.html) || undefined
      } catch {
        pages[draft.id] = undefined
      }
    }
    return pages
  }, [drafts])

  const items = useMemo(
    () => buildSubmissionItems({ analysis, drafts, requirementStatuses, submission, pagesByDraftId }),
    [analysis, drafts, pagesByDraftId, requirementStatuses, submission],
  )
  const summary = useMemo(() => summarizeSubmission(items), [items])
  const sections = (['stuk', 'bijlage', 'eis'] as SubmissionSection[]).map((section) => ({
    section,
    all: items.filter((item) => item.section === section),
    visible: items.filter((item) => item.section === section && (!onlyOpen || (item.status !== 'gereed' && item.status !== 'nvt'))),
  }))

  const patchEntry = (id: string, patch: Partial<SubmissionEntry>) => {
    setSubmission((current) => {
      const existing = current.entries[id] ?? { updatedAt: '' }
      return { ...current, entries: { ...current.entries, [id]: { ...existing, ...patch, updatedAt: new Date().toISOString() } } }
    })
  }

  const setRequirement = (id: string, status: SubmissionStatus) => {
    setRequirementStatuses((current) => ({
      ...current,
      [id]: { status: submissionToRequirementStatus(status), note: current[id]?.note, by: 'gebruiker', updatedAt: new Date().toISOString() },
    }))
  }

  const setItemStatus = (item: SubmissionItem, status: SubmissionStatus) => {
    if (item.section === 'eis') {
      // Het eisenregister blijft leidend; 'bezig' bestaat daar niet en staat alleen hier.
      setRequirement(item.id, status)
      patchEntry(item.id, { status: status === 'bezig' ? 'bezig' : undefined })
      return
    }
    patchEntry(item.id, { status })
  }

  const followDerived = (item: SubmissionItem) => patchEntry(item.id, { status: undefined })

  const attachFile = async (item: SubmissionItem, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploadingId(item.id)
    try {
      const stored = await storeSubmissionFile(projectId, item.id, file)
      patchEntry(item.id, { file: stored })
      if (item.section === 'eis' && item.status !== 'gereed' && item.status !== 'nvt') setRequirement(item.id, 'gereed')
      setNotice(
        stored.url
          ? `"${file.name}" gearchiveerd bij ${item.title}.`
          : `"${file.name}" vastgelegd bij ${item.title} — origineel niet gearchiveerd (documentarchief niet geconfigureerd).`,
      )
    } finally {
      setUploadingId(null)
    }
  }

  const removeFile = (item: SubmissionItem) => patchEntry(item.id, { file: null })

  const addCustomItem = () => {
    const custom = makeCustomSubmissionItem(customTitle, customKind, customMandatory, items.map((item) => item.id))
    setSubmission((current) => ({ ...current, customItems: [...current.customItems, custom] }))
    setCustomTitle('')
    setCustomOpen(false)
  }

  const removeCustomItem = (id: string) => {
    setSubmission((current) => {
      const entries = { ...current.entries }
      delete entries[id]
      return { ...current, entries, customItems: current.customItems.filter((item) => item.id !== id) }
    })
  }

  const markSubmitted = (submitted: boolean) => {
    setSubmission((current) => ({ ...current, submittedAt: submitted ? new Date().toISOString() : null }))
  }

  const exportDraft = async (draft: DraftDocument, format: 'pdf' | 'docx') => {
    const html = stripCommentMarks(draft.html)
    const base = `${slugForFile(project.title)}-${slugForFile(draft.title)}-${draft.stage}`
    setExportingId(`${draft.id}:${format}`)
    try {
      if (format === 'pdf') {
        await exportPdfFromHtml(html, `${base}.pdf`)
      } else {
        const { exportDocxDocument } = await import('../lib/docxExport')
        await exportDocxDocument(html, `${project.title} — ${draft.title}`, `${base}.docx`)
      }
      setNotice(`${draft.title} geëxporteerd als ${format === 'pdf' ? 'PDF' : 'Word'}.`)
    } catch (error) {
      setNotice(`Export mislukt: ${error instanceof Error ? error.message : 'onbekende fout'}`)
    } finally {
      setExportingId(null)
    }
  }

  const workspaceHref = `/projecten/${encodeURIComponent(projectId)}`
  const deadlineText = formatDeadline(project)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1240px] space-y-4 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1 h-7 px-2 text-xs text-muted-foreground">
              <Link href={workspaceHref}>
                <ArrowLeft size={14} /> Terug naar de werkplek
              </Link>
            </Button>
            <p className="text-xs font-bold uppercase text-muted-foreground">Besteed Het Uit · Indiening</p>
            <h1 className="flex flex-wrap items-center gap-2 break-words text-[25px] font-bold leading-tight">
              <PackageCheck size={24} className="shrink-0 text-primary" /> {project.title}
            </h1>
            {project.buyer ? <p className="mt-0.5 text-sm text-muted-foreground">{project.buyer}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={workspaceHref}>
                <PenLine size={14} /> Werkplek
              </Link>
            </Button>
            <ModeToggle />
          </div>
        </header>

        <section aria-label="Deadline" className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card className={cn('border', countdown ? severityClasses[countdown.severity] : '')}>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Timer size={17} /> Countdown naar de deadline
                </h2>
                {countdown ? (
                  <Badge variant={countdown.passed ? 'destructive' : 'outline'} className="border-current/30 text-current" data-testid="countdown-label">
                    {countdown.label}
                  </Badge>
                ) : null}
              </div>
              {countdown ? (
                <>
                  <CountdownTiles countdown={countdown} />
                  <p className="text-xs">
                    {countdown.passed ? 'Sluiting was op ' : 'Sluiting op '}
                    <strong>{deadlineText}</strong>.
                    {!project.deadlineTime && !countdown.passed ? ' Stel de sluitingstijd in voor een precieze countdown.' : ''}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Geen deadline ingesteld. Vul de sluitingsdatum in om af te tellen.</p>
              )}
              <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2 text-foreground">
                <div className="space-y-1">
                  <Label htmlFor="submission-deadline" className="text-xs">Sluitingsdatum</Label>
                  <Input
                    id="submission-deadline"
                    type="date"
                    className="bg-card"
                    value={project.deadline}
                    onChange={(event) => setProject((current) => ({ ...current, deadline: event.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="submission-deadline-time" className="text-xs">Tijd</Label>
                  <Input
                    id="submission-deadline-time"
                    type="time"
                    className="bg-card"
                    value={project.deadlineTime ?? ''}
                    onChange={(event) => setProject((current) => ({ ...current, deadlineTime: event.target.value || undefined }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <ClipboardCheck size={17} /> Voortgang indieningsset
                </h2>
                <Badge variant={summary.open ? 'secondary' : 'default'} data-testid="submission-progress">
                  {summary.done}/{summary.total} gereed
                </Badge>
              </div>
              <Progress value={summary.percent} aria-label={`${summary.percent}% van de indieningsset gereed`} />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {summary.open ? (
                  <>
                    Nog <strong className="text-foreground">{summary.open}</strong> onderdeel{summary.open === 1 ? '' : 'en'} open
                    {summary.openMandatory ? (
                      <>
                        , waarvan <strong className="text-destructive">{summary.openMandatory} verplicht</strong>
                      </>
                    ) : null}
                    {summary.attention ? <> · {summary.attention} met aandachtspunt van de reviewer</> : null}
                    {' · '}
                    {summary.withFile} met bestand.
                  </>
                ) : summary.total ? (
                  'Alle onderdelen zijn gereed of niet van toepassing.'
                ) : (
                  'Nog geen onderdelen: voer eerst de leidraadanalyse uit in de werkplek of voeg hieronder bijlagen toe.'
                )}
              </p>
              {submission.submittedAt ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 size={14} /> Ingediend op {formatMoment(submission.submittedAt)}
                  </span>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => markSubmitted(false)}>
                    <Undo2 size={13} /> Ongedaan maken
                  </Button>
                </div>
              ) : (
                <Button
                  className="w-full"
                  variant={summary.open ? 'outline' : 'default'}
                  onClick={() => markSubmitted(true)}
                  title={summary.openMandatory ? `Let op: nog ${summary.openMandatory} verplichte onderdelen open` : 'Markeer de inschrijving als ingediend'}
                >
                  <Send size={15} /> Inschrijving ingediend
                </Button>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch size="sm" checked={onlyOpen} onCheckedChange={setOnlyOpen} aria-label="Alleen open onderdelen tonen" /> Alleen open tonen
                </label>
                <Dialog open={customOpen} onOpenChange={setCustomOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus size={14} /> Eigen bijlage
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="gap-3 sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-primary">
                        <Paperclip size={18} /> Eigen bijlage toevoegen
                      </DialogTitle>
                    </DialogHeader>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Voor een bijlage die de analyse niet heeft herkend, zoals een extra verklaring of een ondertekend prijsblad.
                    </p>
                    <div className="space-y-1.5">
                      <Label htmlFor="custom-item-title">Naam van de bijlage</Label>
                      <Input
                        id="custom-item-title"
                        autoFocus
                        value={customTitle}
                        onChange={(event) => setCustomTitle(event.target.value)}
                        placeholder="bijv. Verklaring bankgarantie"
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && customTitle.trim()) addCustomItem()
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="custom-item-kind">Soort</Label>
                        <Select value={customKind} onValueChange={(value) => setCustomKind(value as CustomSubmissionItem['kind'])}>
                          <SelectTrigger id="custom-item-kind" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="formulier">Formulier</SelectItem>
                            <SelectItem value="bewijsstuk">Bewijsstuk</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <label className="flex items-end gap-2 pb-2 text-sm">
                        <Switch checked={customMandatory} onCheckedChange={setCustomMandatory} aria-label="Verplicht" /> Verplicht
                      </label>
                    </div>
                    <Button onClick={addCustomItem} disabled={!customTitle.trim()}>
                      <Plus size={14} /> Toevoegen aan indieningsset
                    </Button>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </section>

        {notice ? (
          <p className="flex items-center justify-between gap-2 rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground" role="status">
            <span>{notice}</span>
            <button type="button" className="shrink-0" aria-label="Melding sluiten" onClick={() => setNotice(null)}>
              <X size={13} />
            </button>
          </p>
        ) : null}

        {sections.map(({ section, all, visible }) => {
          const { Icon, hint } = sectionMeta[section]
          const open = all.filter((item) => item.status !== 'gereed' && item.status !== 'nvt').length
          return (
            <Card key={section}>
              <CardContent className="space-y-2">
                <section aria-label={submissionSectionLabels[section]} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
                      <Icon size={17} /> {submissionSectionLabels[section]}
                      <Badge variant="secondary">{all.length}</Badge>
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {all.length ? (open ? `${open} open` : 'alles gereed') : ''}
                    </span>
                  </div>
                  <p className="text-xs leading-snug text-muted-foreground">{hint}</p>
                  {visible.length ? (
                    <ul className="list-none p-0">
                      {visible.map((item) => (
                        <SubmissionRow
                          key={item.id}
                          item={item}
                          uploading={uploadingId === item.id}
                          exportingId={exportingId}
                          workspaceHref={workspaceHref}
                          onStatus={(status) => setItemStatus(item, status)}
                          onFollowDerived={() => followDerived(item)}
                          onOwner={(owner) => patchEntry(item.id, { owner: owner.trim() || undefined })}
                          onNote={(note) => patchEntry(item.id, { note: note.trim() || undefined })}
                          onFile={(event) => void attachFile(item, event)}
                          onRemoveFile={() => removeFile(item)}
                          onRemoveCustom={item.custom ? () => removeCustomItem(item.id) : undefined}
                          onExport={item.draft ? (format) => void exportDraft(item.draft!, format) : undefined}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {all.length
                        ? 'Geen open onderdelen in deze groep.'
                        : section === 'stuk'
                          ? 'Geen stukken in dit project.'
                          : section === 'bijlage'
                            ? 'De analyse heeft geen formulieren of bewijsstukken gevonden. Voeg eigen bijlagen toe.'
                            : 'Geen eisen aan het bidteam in het register.'}
                    </p>
                  )}
                </section>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </main>
  )
}

type RowProps = {
  item: SubmissionItem
  uploading: boolean
  exportingId: string | null
  workspaceHref: string
  onStatus: (status: SubmissionStatus) => void
  onFollowDerived: () => void
  onOwner: (owner: string) => void
  onNote: (note: string) => void
  onFile: (event: ChangeEvent<HTMLInputElement>) => void
  onRemoveFile: () => void
  onRemoveCustom?: () => void
  onExport?: (format: 'pdf' | 'docx') => void
}

function SubmissionRow({ item, uploading, exportingId, workspaceHref, onStatus, onFollowDerived, onOwner, onNote, onFile, onRemoveFile, onRemoveCustom, onExport }: RowProps) {
  const file = item.entry?.file ?? null
  const inputId = `submission-file-${item.id}`
  const short = item.title.length > 60 ? `${item.title.slice(0, 57)}…` : item.title
  const done = item.status === 'gereed' || item.status === 'nvt'

  return (
    <li
      data-testid="submission-item"
      data-section={item.section}
      data-status={item.status}
      className={cn(
        'grid items-start gap-2 border-t py-3 first:border-t-0 md:grid-cols-[minmax(0,1fr)_132px_150px_minmax(0,280px)] md:gap-3',
        item.status === 'nvt' && 'opacity-60',
        item.attention && !done && 'bg-amber-50/60 dark:bg-amber-950/20',
        item.overLimit && 'bg-red-50/60 dark:bg-red-950/20',
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <StatusIcon status={item.status} attention={Boolean(item.attention)} />
        <div className="min-w-0 flex-1">
          <p className={cn('break-words text-sm font-semibold leading-snug', done && 'text-muted-foreground')}>{item.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge variant="outline" className="text-[10px] uppercase">{item.kindLabel}</Badge>
            {item.draft ? (
              <Badge variant="secondary" className="text-[10px] uppercase">
                {item.status === 'open' && item.derived ? 'niet gestart' : stageLabels[item.draft.stage]}
              </Badge>
            ) : null}
            {item.mandatory ? <span className="text-[10px] font-semibold uppercase text-destructive">verplicht</span> : null}
            {!item.derived && item.section !== 'eis' ? (
              <button
                type="button"
                className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                title="Handmatige status loslaten en weer afleiden uit stadium/bestand"
                onClick={onFollowDerived}
              >
                <Undo2 size={10} /> handmatig
              </button>
            ) : null}
          </div>
          {item.detail ? (
            <p className="mt-1 flex gap-1 break-words text-xs leading-relaxed text-muted-foreground">
              {item.section === 'eis' ? <HelpCircle size={12} className="mt-0.5 shrink-0 text-primary" /> : null}
              <span className={item.section === 'eis' ? 'italic text-primary' : undefined}>{item.detail}</span>
            </p>
          ) : null}
          {item.attention && !done ? (
            <p className="mt-1 flex gap-1 break-words text-xs leading-relaxed text-amber-800 dark:text-amber-200">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> Reviewer: {item.attention}
            </p>
          ) : null}
          {item.overLimit ? (
            <p
              data-testid="submission-over-limit"
              className="mt-1 flex gap-1 break-words text-xs font-semibold leading-relaxed text-red-700 dark:text-red-300"
            >
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> Over de limiet: {item.overLimit} — kort in, anders
              kan de inschrijving op vorm worden uitgesloten.
            </p>
          ) : null}
          {item.source ? <p className="mt-0.5 text-[10px] text-muted-foreground">{item.source}</p> : null}
          <Input
            key={item.entry?.note ?? ''}
            defaultValue={item.entry?.note ?? ''}
            placeholder="Notitie (waar staat het, wat ontbreekt nog)"
            aria-label={`Notitie bij: ${short}`}
            className="mt-1.5 h-7 text-xs"
            onBlur={(event) => {
              if (event.target.value.trim() !== (item.entry?.note ?? '')) onNote(event.target.value)
            }}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Select value={item.status} onValueChange={(value) => onStatus(value as SubmissionStatus)}>
          <SelectTrigger size="sm" className="w-full bg-card text-xs" aria-label={`Status van: ${short}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {submissionStatuses.map((status) => (
              <SelectItem key={status} value={status}>
                {submissionStatusLabels[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {item.section === 'eis' && item.requirement?.status === 'aandacht' ? (
          <p className="text-[10px] text-amber-700 dark:text-amber-300">Aandacht (reviewer)</p>
        ) : null}
      </div>

      <div className="relative">
        <UserRound size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          key={item.entry?.owner ?? ''}
          defaultValue={item.entry?.owner ?? ''}
          placeholder="Eigenaar"
          aria-label={`Eigenaar van: ${short}`}
          className="h-8 bg-card pl-7 text-xs"
          onBlur={(event) => {
            if (event.target.value.trim() !== (item.entry?.owner ?? '')) onOwner(event.target.value)
          }}
        />
      </div>

      <div className="min-w-0 space-y-1.5">
        {file ? (
          <div className="flex min-w-0 items-start gap-2 rounded-md border bg-card px-2 py-1.5 text-xs" data-testid="submission-file">
            <FileText size={14} className="mt-0.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              {file.url ? (
                <a
                  className="block truncate font-medium underline-offset-2 hover:text-primary hover:underline"
                  href={blobViewUrl(file.url)}
                  target="_blank"
                  rel="noreferrer"
                  title={file.name}
                >
                  {file.name}
                </a>
              ) : (
                <span className="block truncate font-medium" title={`${file.name} — origineel niet gearchiveerd`}>
                  {file.name}
                </span>
              )}
              <span className="block text-[10px] text-muted-foreground">
                {formatFileSize(file.size)} · {formatMoment(file.uploadedAt)}
                {file.url ? '' : ' · niet gearchiveerd'}
              </span>
            </div>
            {file.url ? (
              <a
                className="shrink-0 text-muted-foreground hover:text-primary"
                href={blobViewUrl(file.url)}
                target="_blank"
                rel="noreferrer"
                title="Openen"
                aria-label={`Open bestand van ${short}`}
              >
                <ExternalLink size={13} />
              </a>
            ) : null}
            <button
              type="button"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              title="Bestand loskoppelen"
              aria-label={`Verwijder bestand van ${short}`}
              onClick={onRemoveFile}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ) : (
          <label
            htmlFor={inputId}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-md border border-dashed bg-card px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground',
              uploading && 'cursor-wait opacity-70',
            )}
          >
            {uploading ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <Upload size={14} className="shrink-0" />}
            <span className="min-w-0 truncate">
              {uploading ? 'Bestand opslaan…' : item.section === 'stuk' ? 'Definitief bestand uploaden' : item.section === 'eis' ? 'Bewijs uploaden (optioneel)' : 'Bestand uploaden'}
            </span>
          </label>
        )}
        <input id={inputId} type="file" className="hidden" disabled={uploading} onChange={onFile} aria-label={`Bestand voor: ${short}`} />
        <div className="flex flex-wrap gap-1">
          {onExport && item.draft ? (
            <>
              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" disabled={item.status === 'open' && item.derived} onClick={() => onExport('pdf')} title="Concept exporteren als PDF">
                {exportingId === `${item.id}:pdf` ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />} PDF
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" disabled={item.status === 'open' && item.derived} onClick={() => onExport('docx')} title="Concept exporteren als Word">
                {exportingId === `${item.id}:docx` ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />} Word
              </Button>
              <Button asChild size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]">
                <Link href={workspaceHref} title="Open dit stuk in de werkplek">
                  <PenLine size={12} /> Werkplek
                </Link>
              </Button>
            </>
          ) : null}
          {onRemoveCustom ? (
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-destructive" onClick={onRemoveCustom} aria-label={`Verwijder bijlage ${short}`}>
              <Trash2 size={12} /> Verwijderen
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  )
}
