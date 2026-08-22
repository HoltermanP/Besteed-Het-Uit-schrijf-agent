import type {
  CustomSubmissionItem,
  DraftDocument,
  SubmissionEntry,
  SubmissionState,
  SubmissionStatus,
  TenderProject,
} from '../types/dossier'
import type { RequestedDocument, RequirementStatus, RequirementStatusEntry, TenderAnalysis } from '../types/tenderAnalysis'
import { isStartDraft } from './buildDraft'
import { documentLimits, formatDocumentLimits, nonWritableDocuments, requestedDocumentId, requestedDocumentKindLabels } from './requestedDocuments'
import { checkVolume, countCharacters, countWords, overLimitSummary } from './volumeLimits'
import { matchRequestedDocument, requirementCategoryLabels, resolveRequirementStatuses, type ResolvedRequirement } from './requirements'

/**
 * Indieningsscherm ("laatste dag"): één checklist van alles wat de deur uit moet —
 * de schrijfstukken, de bijlagen (formulieren en bewijsstukken zoals UEA, referenties
 * en verklaringen) en de eisen die het bidteam zelf moet afdekken — elk met status,
 * eigenaar en (definitief) bestand, plus de countdown naar de sluitingsdatum.
 * Geen browser- of Node-API's: client en tests delen deze code.
 */

export type SubmissionSection = 'stuk' | 'bijlage' | 'eis'

export const submissionSectionLabels: Record<SubmissionSection, string> = {
  stuk: 'Schrijfstukken',
  bijlage: 'Bijlagen',
  eis: 'Eisen aan het bidteam',
}

export const submissionStatusLabels: Record<SubmissionStatus, string> = {
  open: 'Open',
  bezig: 'Bezig',
  gereed: 'Gereed',
  nvt: 'N.v.t.',
}

export const submissionStatuses: SubmissionStatus[] = ['open', 'bezig', 'gereed', 'nvt']

export type SubmissionItem = {
  id: string
  section: SubmissionSection
  title: string
  /** Korte typering: "Schrijfstuk", "Formulier", "Geschiktheid". */
  kindLabel: string
  /** Toelichting: de vraag aan het bidteam, limiet/vorm van een stuk, eis-tekst. */
  detail?: string
  mandatory: boolean
  source?: string
  status: SubmissionStatus
  /** true = status afgeleid (stadium, bestand, eisenregister), niet handmatig gezet. */
  derived: boolean
  /** Opmerking van de reviewer wanneer een eis op 'aandacht' staat. */
  attention?: string
  /** Bij een schrijfstuk dat over zijn woord-, karakter- of paginalimiet gaat: de stand ervan. */
  overLimit?: string
  entry?: SubmissionEntry
  /** Alleen bij schrijfstukken. */
  draft?: DraftDocument
  /** Alleen bij eisen. */
  requirement?: ResolvedRequirement
  /** Door de bidmanager zelf toegevoegde bijlage. */
  custom?: boolean
}

export function emptySubmission(): SubmissionState {
  return { entries: {}, customItems: [], submittedAt: null }
}

/** Lees een (mogelijk ouder of onvolledig) indieningsblok uit het dossier. */
export function normalizeSubmission(raw: unknown): SubmissionState {
  const value = (raw ?? {}) as Partial<SubmissionState>
  const entries: Record<string, SubmissionEntry> = {}
  for (const [id, entry] of Object.entries(value.entries ?? {})) {
    if (!entry || typeof entry !== 'object') continue
    entries[id] = { ...(entry as SubmissionEntry), updatedAt: (entry as SubmissionEntry).updatedAt ?? '' }
  }
  return {
    entries,
    customItems: Array.isArray(value.customItems)
      ? value.customItems.filter((item): item is CustomSubmissionItem => Boolean(item?.id && item?.title))
      : [],
    submittedAt: value.submittedAt ?? null,
    submittedNote: value.submittedNote,
  }
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)

export function makeCustomSubmissionItem(
  title: string,
  kind: CustomSubmissionItem['kind'],
  mandatory: boolean,
  existingIds: string[],
): CustomSubmissionItem {
  const base = title.trim() || 'Bijlage'
  let id = `bijlage-eigen-${slug(base) || 'stuk'}`
  let counter = 2
  while (existingIds.includes(id)) id = `bijlage-eigen-${slug(base) || 'stuk'}-${counter++}`
  return { id, title: base, kind, mandatory }
}

/** Status van een schrijfstuk uit zijn stadium: niet gestart = open, goud = gereed, daartussen bezig. */
export function draftSubmissionStatus(draft: DraftDocument): SubmissionStatus {
  if (isStartDraft(draft.html)) return 'open'
  return draft.stage === 'goud' ? 'gereed' : 'bezig'
}

export function requirementToSubmissionStatus(status: RequirementStatus): SubmissionStatus {
  if (status === 'voldaan') return 'gereed'
  if (status === 'nvt') return 'nvt'
  if (status === 'aandacht') return 'bezig'
  return 'open'
}

/** Vertaal een status van het indieningsscherm terug naar het eisenregister ('bezig' blijft daar open). */
export function submissionToRequirementStatus(status: SubmissionStatus): RequirementStatus {
  if (status === 'gereed') return 'voldaan'
  if (status === 'nvt') return 'nvt'
  return 'open'
}

export type SubmissionInput = {
  analysis: TenderAnalysis | null
  drafts: DraftDocument[]
  requirementStatuses: Record<string, RequirementStatusEntry>
  submission: SubmissionState
  /** Gemeten paginagetal per stuk (zie measureProposalPdf); zonder meting wordt geschat. */
  pagesByDraftId?: Record<string, number | undefined>
}

/**
 * Bouw de checklist: stukken (elk concept), bijlagen (formulieren/bewijsstukken uit de
 * analyse, losse documenteisen en eigen bijlagen) en de eisen die het bidteam zelf moet
 * afdekken. Eisen die over een al getoond stuk of bijlage gaan, worden niet dubbel getoond.
 */
export function buildSubmissionItems(input: SubmissionInput): SubmissionItem[] {
  const { analysis, drafts, requirementStatuses, submission, pagesByDraftId } = input
  const entries = submission.entries
  const items: SubmissionItem[] = []

  const statusFor = (id: string, derived: SubmissionStatus): Pick<SubmissionItem, 'status' | 'derived' | 'entry'> => {
    const entry = entries[id]
    if (entry?.status) return { status: entry.status, derived: false, entry }
    if (entry?.file && derived !== 'nvt') return { status: 'gereed', derived: true, entry }
    return { status: derived, derived: true, entry }
  }

  // 1. Schrijfstukken — elk concept in het project, met de stand van zijn omvangslimiet:
  // een stuk dat over de woord-, karakter- of paginalimiet gaat, valt op vorm af.
  for (const draft of drafts) {
    const limits = formatDocumentLimits(draft.requested)
    const detail = [limits ? `Limiet: ${limits}` : '', draft.requested.format ? `Vorm: ${draft.requested.format}` : '']
      .filter(Boolean)
      .join(' · ')
    const written = !isStartDraft(draft.html)
    const overLimit = written
      ? overLimitSummary(
          checkVolume(
            { words: countWords(draft.html), chars: countCharacters(draft.html), pages: pagesByDraftId?.[draft.id] },
            documentLimits(draft.requested, analysis),
          ),
        )
      : null
    items.push({
      id: draft.id,
      section: 'stuk',
      title: draft.title,
      kindLabel: draft.source === 'eigen' ? 'Eigen stuk' : 'Schrijfstuk',
      detail: detail || undefined,
      mandatory: draft.requested.mandatory,
      source: draft.requested.source,
      overLimit: overLimit ?? undefined,
      draft,
      ...statusFor(draft.id, draftSubmissionStatus(draft)),
    })
  }

  // 2. Bijlagen — formulieren en bewijsstukken uit de analyse …
  const requested: RequestedDocument[] = analysis?.requestedDocuments ?? []
  const attachments = nonWritableDocuments(analysis)
  for (const doc of attachments) {
    items.push({
      id: doc.id,
      section: 'bijlage',
      title: doc.title,
      kindLabel: requestedDocumentKindLabels[doc.kind],
      detail: [doc.question, doc.format ? `Vorm: ${doc.format}` : ''].filter(Boolean).join(' · ') || undefined,
      mandatory: doc.mandatory,
      source: doc.source,
      ...statusFor(doc.id, 'open'),
    })
  }
  // … losse documenteisen die niet al als op te stellen/aan te leveren stuk bekend zijn …
  const seenTitles = new Set(items.map((item) => item.title.toLowerCase()))
  for (const req of analysis?.documentRequirements ?? []) {
    if (matchRequestedDocument(req.name, requested)) continue
    if (seenTitles.has(req.name.toLowerCase())) continue
    seenTitles.add(req.name.toLowerCase())
    const id = `bijlage-${requestedDocumentId(req.name).slice(4)}`
    items.push({
      id,
      section: 'bijlage',
      title: req.name,
      kindLabel: 'Document',
      mandatory: req.mandatory,
      source: req.source,
      ...statusFor(id, 'open'),
    })
  }
  // … en bijlagen die de bidmanager zelf heeft toegevoegd.
  for (const custom of submission.customItems) {
    items.push({
      id: custom.id,
      section: 'bijlage',
      title: custom.title,
      kindLabel: requestedDocumentKindLabels[custom.kind],
      mandatory: custom.mandatory,
      source: 'zelf toegevoegd',
      custom: true,
      ...statusFor(custom.id, 'open'),
    })
  }

  // 3. Eisen aan het bidteam — wat buiten de tekst om geregeld moet worden.
  const listedIds = new Set(items.map((item) => item.id))
  const listedDocs: RequestedDocument[] = [
    ...requested,
    ...items
      .filter((item) => item.section === 'bijlage')
      .map((item) => ({ id: item.id, title: item.title }) as RequestedDocument),
  ]
  const writtenIds = new Set(drafts.filter((draft) => !isStartDraft(draft.html)).map((draft) => draft.id))
  const resolved = resolveRequirementStatuses(analysis?.requirements ?? [], requirementStatuses, writtenIds)
  for (const req of resolved) {
    if (req.checkBy !== 'gebruiker') continue
    if (req.documentId && listedIds.has(req.documentId)) continue
    if (req.category === 'document' && req.documentTitle && matchRequestedDocument(req.documentTitle, listedDocs)) continue
    const entry = entries[req.id]
    const fromRegister = requirementToSubmissionStatus(req.status)
    const status: SubmissionStatus = fromRegister === 'open' && entry?.status === 'bezig' ? 'bezig' : fromRegister
    items.push({
      id: req.id,
      section: 'eis',
      title: req.text,
      kindLabel: requirementCategoryLabels[req.category],
      detail: req.question,
      mandatory: req.mandatory,
      source: [req.source, req.reference].filter(Boolean).join(' · '),
      status,
      derived: req.status !== 'open' ? req.auto : entry?.status !== 'bezig',
      attention: req.status === 'aandacht' ? req.entry?.note || 'De reviewer mist dit nog.' : undefined,
      entry,
      requirement: req,
    })
  }

  return items
}

export type SubmissionSummary = {
  total: number
  done: number
  open: number
  openMandatory: number
  withFile: number
  attention: number
  percent: number
}

export function summarizeSubmission(items: SubmissionItem[]): SubmissionSummary {
  const relevant = items.filter((item) => item.status !== 'nvt')
  const done = relevant.filter((item) => item.status === 'gereed')
  const open = relevant.filter((item) => item.status !== 'gereed')
  return {
    total: relevant.length,
    done: done.length,
    open: open.length,
    openMandatory: open.filter((item) => item.mandatory).length,
    withFile: relevant.filter((item) => item.entry?.file).length,
    attention: relevant.filter((item) => item.attention).length,
    percent: relevant.length ? Math.round((done.length / relevant.length) * 100) : 0,
  }
}

// ── Deadline en countdown ────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

/** Het sluitingsmoment als Date (lokale tijd); zonder tijd geldt het einde van de dag. */
export function deadlineDate(project: Pick<TenderProject, 'deadline' | 'deadlineTime'>): Date | null {
  if (!DATE_RE.test(project.deadline ?? '')) return null
  const time = TIME_RE.test(project.deadlineTime ?? '') ? project.deadlineTime : '23:59'
  const date = new Date(`${project.deadline}T${time}:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Splits een TenderNed-sluitingsdatum in datum en tijd. Een tijd zonder tijdzone wordt
 * letterlijk overgenomen; met tijdzone (Z/+01:00) wordt naar lokale tijd omgerekend.
 */
export function splitClosingDateTime(value: string | undefined | null): { deadline: string; deadlineTime?: string } {
  if (!value) return { deadline: '' }
  const literal = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value)
  if (literal) return { deadline: literal[1], deadlineTime: literal[2] }
  if (/T\d{2}:\d{2}/.test(value)) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      return {
        deadline: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
        deadlineTime: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
      }
    }
  }
  return { deadline: value.slice(0, 10) }
}

export type CountdownSeverity = 'ruim' | 'krap' | 'kritiek' | 'verstreken'

export type Countdown = {
  passed: boolean
  totalMs: number
  days: number
  hours: number
  minutes: number
  seconds: number
  severity: CountdownSeverity
  /** "nog 2 dagen en 4 uur" / "3 uur geleden verstreken". */
  label: string
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

export function describeCountdown(target: Date, now: Date = new Date()): Countdown {
  const diff = target.getTime() - now.getTime()
  const passed = diff <= 0
  const abs = Math.abs(diff)
  const days = Math.floor(abs / DAY)
  const hours = Math.floor((abs % DAY) / HOUR)
  const minutes = Math.floor((abs % HOUR) / 60_000)
  const seconds = Math.floor((abs % 60_000) / 1000)
  const severity: CountdownSeverity = passed ? 'verstreken' : abs < DAY ? 'kritiek' : abs < 3 * DAY ? 'krap' : 'ruim'

  let span: string
  if (days >= 1) span = `${plural(days, 'dag', 'dagen')} en ${plural(hours, 'uur', 'uur')}`
  else if (hours >= 1) span = `${plural(hours, 'uur', 'uur')} en ${plural(minutes, 'minuut', 'minuten')}`
  else span = `${plural(minutes, 'minuut', 'minuten')} en ${plural(seconds, 'seconde', 'seconden')}`

  return {
    passed,
    totalMs: diff,
    days,
    hours,
    minutes,
    seconds,
    severity,
    label: passed ? `${span} geleden verstreken` : `nog ${span}`,
  }
}

/** Korte deadline-aanduiding voor knoppen en kaarten: "nog 3 dagen", "nog 5 uur", "verstreken". */
export function shortDeadlineLabel(project: Pick<TenderProject, 'deadline' | 'deadlineTime'>, now: Date = new Date()): string | null {
  const target = deadlineDate(project)
  if (!target) return null
  const countdown = describeCountdown(target, now)
  if (countdown.passed) return 'verstreken'
  if (countdown.days >= 1) return `nog ${plural(countdown.days, 'dag', 'dagen')}`
  if (countdown.hours >= 1) return `nog ${plural(countdown.hours, 'uur', 'uur')}`
  return `nog ${plural(countdown.minutes, 'minuut', 'minuten')}`
}

export function formatDeadline(project: Pick<TenderProject, 'deadline' | 'deadlineTime'>): string | null {
  const target = deadlineDate(project)
  if (!target) return null
  const date = target.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return project.deadlineTime ? `${date} om ${project.deadlineTime} uur` : `${date} (tijd niet ingesteld)`
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`
  return `${bytes} B`
}
