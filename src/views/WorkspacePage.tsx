'use client'

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BadgeCheck,
  BookOpen,
  Bot,
  Brain,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Crown,
  Download,
  ExternalLink,
  Eye,
  FileDown,
  FilePlus2,
  FileText,
  Files,
  Flag,
  FolderOpen,
  GitCompareArrows,
  GraduationCap,
  Library,
  Highlighter,
  History,
  Import,
  Loader2,
  Medal,
  MessageSquarePlus,
  PackageCheck,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Wand2,
  XCircle,
} from 'lucide-react'
import { buildHtmlDraft, buildStartDraft, isStartDraft } from '../lib/buildDraft'
import { revealDraftProgressively } from '../lib/draftProgress'
import { clearUsageScope, setUsageScope } from '../lib/usageScope'
import BudgetWarning from '../components/BudgetWarning'
import { analyzeTenderDocuments, countCharacters, countWords, reviewAgainstAnalysis } from '../lib/tenderAnalysis'
import {
  checkVolume,
  limitsForAnalysis,
  measureWordsPerPage,
  overLimitSummary,
  printedPages,
  volumeLevel,
  volumeUnitLabels,
  type VolumeCheck,
} from '../lib/volumeLimits'
import { analyzeTenderViaApi } from '../lib/analyzeTenderApi'
import { analyzeDocumentViaApi, mapWithConcurrency } from '../lib/analyzeDocumentApi'
import { distillDocumentViaApi } from '../lib/distillDocumentApi'
import type { DistillDocumentResponse } from '../types/distillDocument'
import type { TenderDocumentExtract } from '../types/analyzeTender'
import { assessSourceContent } from '../lib/sourceQuality'
import { readFileContent } from '../lib/extractTextApi'
import { fetchProjectArchiveAvailability, importProjectDocument } from '../lib/projectDocumentsApi'
import { blobViewUrl } from '../lib/blobFiles'
import FileUploadZone from '../components/FileUploadZone'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog'
import { acceptedStyleExtensions } from '../types/styleDocument'
import type {
  RequestedDocument,
  RequirementStatus,
  RequirementStatusEntry,
  TenderAnalysis,
} from '../types/tenderAnalysis'
import { exportPdfFromHtml, measureProposalPdf, type ProposalPdfMeasure } from '../lib/pdfExport'
import {
  clearClaimMarks,
  markUnprovenClaims,
  slugForFile,
  stripCommentMarks,
  stripEvidenceMarks,
} from '../lib/draftHtml'
import { shortDeadlineLabel, splitClosingDateTime } from '../lib/submission'
import {
  documentLimits,
  formatDocumentLimits,
  nonWritableDocuments,
  requestedDocumentKindLabels,
  scopeAnalysisToDocument,
  writableDocuments,
} from '../lib/requestedDocuments'
import {
  draftStatusLabel,
  loadDraftsFromSnapshot,
  makeCustomRequestedDocument,
  makeDraftDocument,
  reconcileDrafts,
} from '../lib/drafts'
import { isNeonConfigured, isWriterConfigured, migrateLegacyNeonUrl } from '../lib/apiConfig'
import {
  DraftJobDisconnected,
  DraftJobLost,
  DraftJobUnwatched,
  fetchWriterStatus,
  followDraftJob,
  generateDraftViaApi,
  isNoAiConfigError,
  type WriterStatus,
} from '../lib/writeDraftApi'
import { rewriteFragmentViaApi } from '../lib/rewriteFragmentApi'
import { reviewDraftViaApi } from '../lib/reviewDraftApi'
import { extractRequirementsViaApi } from '../lib/extractRequirementsApi'
import { applyRequirementChecks, resolveRequirementStatuses } from '../lib/requirements'
import { normalizeStoredAnalysis } from '../lib/storedAnalysis'
import RequirementsCard from '../components/RequirementsCard'
import BuyerProfileCard from '../components/BuyerProfileCard'
import ConfirmDialog from '../components/ConfirmDialog'
import { notifyError, notifySuccess, notifyUndo, notifyWarning } from '../lib/notify'
import ImprovementRoundPanel from '../components/ImprovementRoundPanel'
import VersionHistoryDialog from '../components/VersionHistoryDialog'
import {
  formatVersionMoment,
  loadVersionHistory,
  pruneRemovedDrafts,
  recordDraftVersion,
  saveVersionHistory,
  versionsFor,
  type NewDraftVersion,
} from '../lib/draftVersions'
import {
  markRoundProcessed,
  mergeRound,
  nextStageFor,
  roundFromOpenRequirements,
  roundToImprovements,
  roundToReviewContext,
  summarizeRound,
} from '../lib/improvementRound'
import { getCompanyConfig, isCompanyConfigured, mergeDocumentsWithCompanyConfig } from '../lib/companyConfig'
import { computeOpportunityScore, type OpportunityLevel } from '../lib/opportunityScore'
import { fetchStyleDocuments } from '../lib/styleDocumentsApi'
import { mergeDocumentsWithStyleDocuments } from '../lib/styleDocumentMerge'
import { getSchrijfkaderAanpassingen, hasAanpassingen } from '../lib/schrijfkader'
import type { StyleDocument } from '../types/styleDocument'
import EvaluationDialog from '../components/EvaluationDialog'
import SaveStatusIndicator from '../components/SaveStatusIndicator'
import { fetchLessons, lessonsToPromptContent, selectRelevantLessons } from '../lib/lessonsLearnedApi'
import type { LessonLearned } from '../types/lessonLearned'
import { fetchEvidenceBlocks, selectRelevantEvidence } from '../lib/evidenceBlocksApi'
import { evidenceHandle, evidenceToPromptContent, evidenceValueLabel, isCitable } from '../lib/evidence'
import { checkClaims, mergeClaimChecks, unprovenClaims, type ClaimCheck } from '../lib/claimCheck'
import { evidenceKindLabels, type EvidenceBlock } from '../types/evidenceBlock'
import type {
  WriteDraftDocument,
  WriteDraftJobSnapshot,
  WriteDraftResponse,
  WriteDraftSibling,
} from '../types/writeDraft'
import { downloadTenderToDatabase, getSavedTenders } from '../lib/tenderDatabase'
import { fetchPublicationDetail } from '../lib/tenderNedApi'
import { buildTenderSourceDocuments } from '../lib/projectFactory'
import type { SavedTender, SavedTenderDocument } from '../types/tenderNed'
import type {
  CommentStatus,
  DossierSnapshot,
  DraftDocument,
  DraftJobRef,
  DraftVersion,
  DraftVersionHistory,
  ImprovementRound,
  ReviewComment,
  SourceDocument,
  SourceType,
  Stage,
  TenderProject,
} from '../types/dossier'
import {
  getDossierUpdatedAt,
  hasDossier,
  loadDossier,
  saveDossier,
  setActiveDossierId,
} from '../lib/dossier'
import { upsertProject } from '../lib/projects'
import { flushStorage } from '../lib/storage'
import { getActiveCompanyId, getCompanies, setActiveCompanyId } from '../lib/companies'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { ModeToggle } from '@/components/mode-toggle'
import { cn } from '@/lib/utils'
import { proposalDocumentCss } from '../styles/proposalDocument'

type Priority = 'kritiek' | 'hoog' | 'normaal'

type ReviewFinding = {
  id: string
  priority: Priority
  title: string
  detail: string
}

const stageMeta: Record<
  Stage,
  { label: string; hint: string; Icon: typeof Medal }
> = {
  brons: { label: 'Brons', hint: 'Eerste concept', Icon: Medal },
  zilver: { label: 'Zilver', hint: 'Review verwerkt', Icon: Award },
  goud: { label: 'Goud', hint: 'Eindversie', Icon: Crown },
}

const sourceLabels: Record<SourceType, string> = {
  tender: 'Aanbesteding',
  company: 'Bedrijfsinfo',
  rules: 'Schrijfregels',
  training: 'Schrijfstijl',
}

const opportunityLevelLabel: Record<OpportunityLevel, string> = {
  laag: 'Lage kans',
  matig: 'Matige kans',
  kansrijk: 'Kansrijk',
  sterk: 'Sterke kans',
}

const commentStatusMeta: Record<CommentStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' },
  verwerkt: { label: 'Verwerkt', className: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300' },
  akkoord: { label: 'Akkoord', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' },
}

const stagePrompts: Record<Stage, string> = {
  brons:
    'Maak een scherpe eerste versie. Focus op compliance, structuur, beoordelingscriteria en het benutten van alle bronnen.',
  zilver:
    'Verwerk menselijke opmerkingen en verbeter bewijsvoering, specificiteit, toon, consistentie en win-thema’s.',
  goud:
    'Maak de eindversie overtuigend, compact, controleerbaar en exportklaar met duidelijke koppen en sterke HTML-opmaak.',
}

const makeId = () => Math.random().toString(36).slice(2, 10)

/** Label voor een opmerking zonder gekoppelde tekstselectie. */
const GENERAL_COMMENT_FRAGMENT = 'Algemene opmerking'

// Rust in de editor waarna eigen bewerkingen als versie worden vastgelegd.
const MANUAL_EDIT_DELAY_MS = 20_000

/** Normaliseer witruimte zodat een selectie betrouwbaar in de DOM-tekst te vinden is. */
const normalizeForMatch = (text: string) => text.replace(/\s+/g, ' ').trim()

/** Migreer opgeslagen opmerkingen (incl. oude `resolved`-boolean) naar het statusmodel. */
function normalizeComment(raw: unknown): ReviewComment {
  const item = (raw ?? {}) as Record<string, unknown>
  const legacyResolved = item.resolved === true
  const status: CommentStatus =
    item.status === 'open' || item.status === 'verwerkt' || item.status === 'akkoord'
      ? item.status
      : legacyResolved
        ? 'akkoord'
        : 'open'
  return {
    id: typeof item.id === 'string' ? item.id : makeId(),
    fragment: typeof item.fragment === 'string' ? item.fragment : GENERAL_COMMENT_FRAGMENT,
    note: typeof item.note === 'string' ? item.note : '',
    status,
    previousSectionHtml: typeof item.previousSectionHtml === 'string' ? item.previousSectionHtml : undefined,
  }
}

function normalizeComments(list: unknown): ReviewComment[] {
  return Array.isArray(list) ? list.map(normalizeComment) : []
}

/** Mapping naar het oudere {fragment, note, resolved}-formaat dat de API's en buildHtmlDraft verwachten. */
function toLegacyComments(comments: ReviewComment[]) {
  return comments.map((comment) => ({
    fragment: comment.fragment,
    note: comment.note,
    resolved: comment.status !== 'open',
  }))
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`
  return `${bytes} B`
}

type UploadNotice = { tone: 'ok' | 'warning' | 'error'; message: string }

/** Korte terugkoppeling onder een uploadzone (gelukt, waarschuwing of fout). */
function NoticeBox({ notice }: { notice: UploadNotice | null }) {
  if (!notice) return null
  return (
    <p
      className={cn(
        'rounded-md border px-[10px] py-2 text-xs leading-snug',
        notice.tone === 'ok' && 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
        notice.tone === 'warning' && 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
        notice.tone === 'error' && 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
      )}
    >
      {notice.message}
    </p>
  )
}

// Laad de werkruimte van één project uit zijn dossier-snapshot.
function loadInitialState(projectId: string) {
  const snapshot = loadDossier<DossierSnapshot>(projectId)
  const storedProject: TenderProject = snapshot?.project ?? {
    title: 'Nieuw project',
    tendernedId: '',
    buyer: '',
    deadline: '',
  }
  migrateLegacyNeonUrl(storedProject.neonUrl)
  const project: TenderProject = {
    title: storedProject.title,
    tendernedId: storedProject.tendernedId,
    buyer: storedProject.buyer,
    deadline: storedProject.deadline,
    deadlineTime: storedProject.deadlineTime,
  }
  const documents = snapshot?.documents ?? []
  const comments = normalizeComments(snapshot?.comments)
  const stage: Stage = snapshot?.stage ?? 'brons'
  const analysis = normalizeStoredAnalysis(snapshot?.analysis ?? null)
  // Zonder geschreven concept toont het veld de startsamenvatting. Oudere dossiers
  // bewaarden nog het onaangeroerde standaardconcept (dat las als "al geschreven");
  // dat wordt hier ook naar de startstand gemigreerd zolang er niets in is gewijzigd.
  const legacyDefault = buildHtmlDraft(stage, project, documents, toLegacyComments(comments), null)
  const storedDraft = snapshot?.draft?.trim() ?? ''
  const draft =
    storedDraft && storedDraft !== legacyDefault.trim()
      ? storedDraft
      : buildStartDraft(project, documents)
  // Gearchiveerde aanbestedingsbestanden. Oudere dossiers bewaarden deze alleen bij de
  // opgeslagen aanbesteding zelf; val daar dan op terug.
  const tenderDocuments = snapshot?.tenderDocuments?.length
    ? snapshot.tenderDocuments
    : getSavedTenders().find((tender) => tender.publicatieId === projectId)?.documents ?? []
  // Meerdere stukken per project: oudere dossiers (één concept) worden als enig stuk
  // gemigreerd; de editor opent het stuk dat het laatst actief was.
  const { drafts, activeDraftId } = loadDraftsFromSnapshot(
    snapshot ? { ...snapshot, analysis } : null,
    project,
    documents,
    { draft, stage, comments },
  )
  const active = drafts.find((item) => item.id === activeDraftId) ?? drafts[0]
  return {
    project,
    documents,
    comments: active.comments,
    stage: active.stage,
    draft: active.html,
    analysis,
    tenderDocuments,
    analysisSource: snapshot?.analysisSource ?? null,
    requirementStatuses: snapshot?.requirementStatuses ?? {},
    drafts,
    activeDraftId: active.id,
    versions: loadVersionHistory(projectId),
  }
}

// De gecombineerde TenderNed-tekst bestaat uit secties "## <bestandsnaam> — <categorie>\n…"
// (zie api-src/_lib/tenderDocuments.ts). Haal de sectie van één document eruit;
// null als er geen herkenbare sectie voor dat document is.
function removeTenderSection(text: string, naam: string): string | null {
  const sections = text.split(/\n\n(?=## )/)
  const escaped = naam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matcher = new RegExp(`^## ${escaped}(?: — |\n|$)`)
  const kept = sections.filter((section) => !matcher.test(section))
  if (kept.length === sections.length) return null
  return kept.join('\n\n').trim()
}

function summarize(text: string, max = 220) {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max).trim()}...` : clean
}

function keywordScore(text: string, terms: string[]) {
  const normalized = text.toLowerCase()
  return terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0)
}

/** Wachttijd na de laatste wijziging voordat de PDF opnieuw wordt doorgerekend. */
const PAGE_COUNT_DELAY_MS = 500

/** "3 pagina's, waarvan de laatste voor 40% gevuld" — zo is te zien hoeveel ruimte er nog is. */
function pageFillLabel(measure: ProposalPdfMeasure): string {
  const pages = `${measure.pages} ${measure.pages === 1 ? 'pagina' : "pagina's"}`
  const lastFill = Math.round((measure.filled - Math.max(0, measure.pages - 1)) * 100)
  return `${pages}, waarvan de laatste voor ${lastFill}% gevuld`
}

type VolumeTileData = {
  unit: VolumeCheck['unit']
  /** "1.980 / 2.000" of, zonder limiet, alleen de telling. */
  value: string
  caption: string
  level: VolumeCheck['level']
  title?: string
}

const volumeTileTone: Record<VolumeCheck['level'], string> = {
  ok: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300',
  krap: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
  over: 'border-red-400 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300',
}

/** Teller met limiet: violet binnen de marge, amber als het krap wordt, rood bij overschrijding. */
function VolumeTile({ unit, value, caption, level, title }: VolumeTileData) {
  return (
    <div
      data-testid={`volume-${unit}`}
      data-level={level}
      title={title}
      className={cn('min-w-0 rounded-md border p-3', volumeTileTone[level])}
    >
      <span className="flex items-baseline gap-1.5">
        {level === 'over' ? <AlertTriangle size={16} className="shrink-0" aria-hidden /> : null}
        <span className="block break-words text-[22px] font-extrabold tabular-nums">{value}</span>
      </span>
      <p className={cn('mt-1 text-xs', level === 'ok' ? 'text-muted-foreground' : 'font-semibold')}>{caption}</p>
    </div>
  )
}

/**
 * Wat de PDF-export van dit concept oplevert. De PDF wordt daarvoor echt opgebouwd;
 * mislukt dat (onvolledige HTML tijdens het streamen), dan liever geen paginagetal dan
 * een verkeerd getal.
 */
function safeMeasurePdf(html: string): ProposalPdfMeasure | undefined {
  try {
    const measure = measureProposalPdf(html)
    return measure.pages ? measure : undefined
  } catch {
    return undefined
  }
}

function safePageCount(html: string): number | undefined {
  return safeMeasurePdf(html)?.pages
}

function reviewDraft(html: string, documents: SourceDocument[], analysis: TenderAnalysis | null, pages?: number) {
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const findings: ReviewFinding[] = []
  const mustHaves = ['kwaliteit', 'risico', 'duurzaamheid', 'implementatie', 'continuiteit']
  const score = keywordScore(plain, mustHaves)

  if (score < 4) {
    findings.push({
      id: makeId(),
      priority: 'kritiek',
      title: 'Niet alle beoordelingscriteria zijn zichtbaar geraakt',
      detail: 'Verwerk kwaliteit, risico, duurzaamheid, implementatie en continuiteit expliciet in koppen of bewijsregels.',
    })
  }

  if (!documents.some((doc) => doc.type === 'company')) {
    findings.push({
      id: makeId(),
      priority: 'hoog',
      title: 'Bedrijfseigen bewijs ontbreekt',
      detail: 'Voeg cases, referenties, teaminformatie of methodiek toe om claims toetsbaar te maken.',
    })
  }

  if (!plain.toLowerCase().includes('bewijs')) {
    findings.push({
      id: makeId(),
      priority: 'hoog',
      title: 'Bewijslast mag sterker',
      detail: 'Maak per onderscheidend punt zichtbaar welk document, proces of resultaat de claim onderbouwt.',
    })
  }

  if (plain.length < 2200) {
    findings.push({
      id: makeId(),
      priority: 'normaal',
      title: 'Tekst is nog compact',
      detail: 'Voor een eindversie zijn voorbeelden, KPI’s en opdrachtgever-specifieke details nodig.',
    })
  }

  if (findings.length === 0) {
    findings.push({
      id: makeId(),
      priority: 'normaal',
      title: 'Goudwaardig concept',
      detail: 'De structuur, criteria en bewijsvoering zijn in balans. Laat alleen nog een menselijke eindredactie meelopen.',
    })
  }

  if (analysis) {
    reviewAgainstAnalysis(html, analysis, pages ?? safePageCount(html)).forEach((item) => {
      findings.push({ id: makeId(), ...item })
    })
  }

  return findings
}

// Toegangspoort: bestaat het project niet (meer), toon dan een nette melding in plaats
// van een lege werkruimte. De sleutel forceert een verse mount per project.
export default function WorkspacePage({ projectId }: { projectId: string }) {
  if (!hasDossier(projectId)) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
        <div className="max-w-md text-center">
          <FolderOpen size={32} className="mx-auto mb-3 text-muted-foreground" />
          <h1 className="text-lg font-bold">Project niet gevonden</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Dit project bestaat niet (meer) voor het actieve bedrijf. Ga terug naar het
            projectenoverzicht om een project te openen of aan te maken.
          </p>
          <Button asChild className="mt-4">
            <Link href="/">Naar projectenoverzicht</Link>
          </Button>
        </div>
      </main>
    )
  }
  return <ProjectWorkspace key={projectId} projectId={projectId} />
}

function ProjectWorkspace({ projectId }: { projectId: string }) {
  const initial = useMemo(() => loadInitialState(projectId), [projectId])
  const [project, setProject] = useState<TenderProject>(initial.project)
  const [documents, setDocuments] = useState<SourceDocument[]>(initial.documents)
  const [tenderDocuments, setTenderDocuments] = useState<SavedTenderDocument[]>(initial.tenderDocuments)
  const [stage, setStage] = useState<Stage>(initial.stage)
  const [draft, setDraft] = useState(initial.draft)
  const [comments, setComments] = useState<ReviewComment[]>(initial.comments)
  const [findings, setFindings] = useState<ReviewFinding[]>([])
  const [analysis, setAnalysis] = useState<TenderAnalysis | null>(initial.analysis)
  // Vingerafdruk van de bronnen waarop de laatste AI-analyse is gebaseerd;
  // zolang die gelijk blijft, wordt de analyse hergebruikt i.p.v. opnieuw betaald.
  const [analysisSource, setAnalysisSource] = useState<string | null>(initial.analysisSource)
  const [requirementStatuses, setRequirementStatuses] = useState<Record<string, RequirementStatusEntry>>(
    initial.requirementStatuses,
  )
  // Alle stukken van deze inschrijving; `draft`/`stage`/`comments` hierboven zijn de
  // werkkopie van het actieve stuk. Refs spiegelen de state zodat lange async flows
  // (analyse → meerdere stukken schrijven) niet op verouderde closures werken.
  const [drafts, setDrafts] = useState<DraftDocument[]>(initial.drafts)
  const [activeDraftId, setActiveDraftId] = useState<string>(initial.activeDraftId)
  const draftsRef = useRef<DraftDocument[]>(initial.drafts)
  const activeDraftIdRef = useRef<string>(initial.activeDraftId)
  // Versiegeschiedenis per stuk (eigen opslagsleutel, zie lib/draftVersions).
  const [versionHistory, setVersionHistory] = useState<DraftVersionHistory>(initial.versions)
  const versionsRef = useRef<DraftVersionHistory>(initial.versions)
  const [versionDialogOpen, setVersionDialogOpen] = useState(false)
  const [batchRunning, setBatchRunning] = useState(false)
  // Voortgang van "schrijf alle ontbrekende stukken": zichtbaar boven het concept, met
  // de mogelijkheid om na het lopende stuk te stoppen.
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; title: string } | null>(null)
  const batchStopRef = useRef(false)
  // Stuk dat op bevestiging wacht voordat het wordt verwijderd.
  const [draftToRemove, setDraftToRemove] = useState<{ id: string; title: string; details: string[] } | null>(null)
  const [customDocOpen, setCustomDocOpen] = useState(false)
  const [customDocTitle, setCustomDocTitle] = useState('')
  const [customDocQuestion, setCustomDocQuestion] = useState('')
  const [activeType, setActiveType] = useState<SourceType>('tender')
  const [manualText, setManualText] = useState('')
  const [manualName, setManualName] = useState('')
  const [commentText, setCommentText] = useState('')
  const [tendernedQuery, setTendernedQuery] = useState(initial.project.tendernedId)
  const [importingTender, setImportingTender] = useState(false)
  const [tenderDialogOpen, setTenderDialogOpen] = useState(false)
  const activeTenderId = projectId
  const [dossierSearch, setDossierSearch] = useState('')
  const savedTenders = getSavedTenders()

  // Bedrijfskiezer: alle werkdata is per bedrijf gescheiden. Wisselen schrijft eerst
  // openstaande wijzigingen weg en gaat daarna naar het projectenoverzicht van het
  // gekozen bedrijf (dit project bestaat daar immers niet).
  const companies = getCompanies()
  const activeCompanyId = getActiveCompanyId()
  const switchCompany = async (id: string) => {
    if (id === activeCompanyId) return
    setActiveCompanyId(id)
    await flushStorage()
    window.location.href = '/'
  }
  const filteredSavedTenders = (() => {
    const term = dossierSearch.trim().toLowerCase()
    const matched = term
      ? savedTenders.filter((tender) =>
          `${tender.aanbestedingNaam} ${tender.opdrachtgeverNaam} TN-${tender.kenmerk}`
            .toLowerCase()
            .includes(term),
        )
      : savedTenders
    return [...matched].sort((a, b) => {
      if (a.publicatieId === activeTenderId) return -1
      if (b.publicatieId === activeTenderId) return 1
      const aUpdated = getDossierUpdatedAt(a.publicatieId) ?? a.savedAt
      const bUpdated = getDossierUpdatedAt(b.publicatieId) ?? b.savedAt
      return bUpdated.localeCompare(aUpdated)
    })
  })()
  const [syncStatus, setSyncStatus] = useState('Opgeslagen in database')
  const [generating, setGenerating] = useState(false)
  const [rewritingId, setRewritingId] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [commentPopover, setCommentPopover] = useState<{ top: number; left: number; fragment: string } | null>(null)
  const [popoverNote, setPopoverNote] = useState('')
  const savedRangeRef = useRef<Range | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const commentsListRef = useRef<HTMLDivElement | null>(null)
  const [uploadNotice, setUploadNotice] = useState<UploadNotice | null>(null)
  const [projectDocNotice, setProjectDocNotice] = useState<UploadNotice | null>(null)
  const [uploadingProjectDocs, setUploadingProjectDocs] = useState(false)
  // Of originelen van eigen uploads gearchiveerd kunnen worden (Vercel Blob geconfigureerd).
  const [archiveAvailable, setArchiveAvailable] = useState(false)
  const [showAllSources, setShowAllSources] = useState(false)
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [serverWriter, setServerWriter] = useState<WriterStatus>({ available: false, provider: null, model: null })
  const writerActive = isWriterConfigured() || serverWriter.available
  const [styleDocuments, setStyleDocuments] = useState<StyleDocument[]>([])
  const [lessonsLibrary, setLessonsLibrary] = useState<LessonLearned[]>([])
  const [appliedLessons, setAppliedLessons] = useState<LessonLearned[]>([])
  // Bewijsbibliotheek: alle bouwstenen van dit bedrijf, en de bouwstenen die bij het
  // laatst geschreven stuk zijn meegegeven (waaruit de agent dus mocht citeren).
  const [evidenceLibrary, setEvidenceLibrary] = useState<EvidenceBlock[]>([])
  const [appliedEvidence, setAppliedEvidence] = useState<EvidenceBlock[]>([])
  // Uitkomst van de bewijscheck van de laatste review: welke claims staan er zonder bewijs.
  const [claimChecks, setClaimChecks] = useState<ClaimCheck[]>([])
  // Handmatige aanpassingen uit het Schrijfkader; eenmalig gelezen bij het openen van het project.
  const kaderAanpassingen = useMemo(() => getSchrijfkaderAanpassingen(), [])
  const effectiveDocuments = useMemo(
    () =>
      mergeDocumentsWithStyleDocuments(
        mergeDocumentsWithCompanyConfig(documents),
        styleDocuments,
        kaderAanpassingen,
      ),
    [documents, styleDocuments, kaderAanpassingen],
  )
  const companyConfigActive = isCompanyConfigured()
  const schrijfkaderActive = styleDocuments.length > 0 || hasAanpassingen(kaderAanpassingen)
  const [exportingPdf, setExportingPdf] = useState(false)
  const editorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void fetchWriterStatus().then(setServerWriter)
  }, [])

  useEffect(() => {
    void fetchProjectArchiveAvailability().then(setArchiveAvailable)
  }, [])

  useEffect(() => {
    void fetchStyleDocuments()
      .then(setStyleDocuments)
      .catch(() => setStyleDocuments([]))
  }, [])

  const loadLessons = () => {
    void fetchLessons()
      .then(setLessonsLibrary)
      .catch(() => setLessonsLibrary([]))
  }

  useEffect(loadLessons, [])

  const loadEvidence = () => {
    void fetchEvidenceBlocks()
      .then(setEvidenceLibrary)
      .catch(() => setEvidenceLibrary([]))
  }

  useEffect(loadEvidence, [])

  // Laat de AI de relevante leerpunten kiezen en lever ze als bron voor de schrijfagent.
  const gatherLessonDocuments = async (result: TenderAnalysis | null): Promise<WriteDraftDocument[]> => {
    if (!lessonsLibrary.length) {
      setAppliedLessons([])
      return []
    }
    setSyncStatus('Relevante leerpunten uit eerdere projecten selecteren…')
    const tenderSummary = effectiveDocuments
      .filter((doc) => doc.type === 'tender')
      .map((doc) => doc.content)
      .join('\n\n')
      .slice(0, 6_000)
    const relevant = await selectRelevantLessons({
      project: { title: project.title, buyer: project.buyer },
      analysis: result,
      tenderSummary,
      candidates: lessonsLibrary,
    })
    setAppliedLessons(relevant)
    if (!relevant.length) return []
    return [
      {
        name: 'Toegepaste leerpunten uit eerdere aanbestedingen',
        type: 'lessons',
        content: lessonsToPromptContent(relevant),
      },
    ]
  }

  /**
   * Kies de bouwstenen die bij dít stuk horen en lever ze als bron aan de schrijfagent.
   * Alleen citeerbare bouwstenen (bewijs vastgelegd, niet verlopen) doen mee: wat niet
   * bewezen is, hoort de agent niet te zien — anders verzint hij er alsnog omheen.
   */
  const gatherEvidenceDocuments = async (
    result: TenderAnalysis | null,
    requested?: RequestedDocument,
  ): Promise<WriteDraftDocument[]> => {
    const citable = evidenceLibrary.filter((block) => isCitable(block))
    if (!citable.length) {
      setAppliedEvidence([])
      return []
    }
    setSyncStatus('Bewijsbouwstenen kiezen die bij dit stuk passen…')
    const tenderSummary = effectiveDocuments
      .filter((doc) => doc.type === 'tender')
      .map((doc) => doc.content)
      .join('\n\n')
      .slice(0, 6_000)
    const relevant = await selectRelevantEvidence({
      project: { title: project.title, buyer: project.buyer },
      analysis: result,
      document: requested ? { title: requested.title, question: requested.question } : undefined,
      tenderSummary,
      candidates: citable,
    })
    setAppliedEvidence(relevant)
    if (!relevant.length) return []
    return [
      {
        name: 'Bewijsbouwstenen voor dit stuk (citeer met data-bewijs)',
        type: 'evidence',
        content: evidenceToPromptContent(relevant),
      },
    ]
  }

  // Markeer dit project als "laatst geopend"; sommige onderdelen (zoals de leerpunten)
  // gebruiken de actieve-dossier-pointer.
  useEffect(() => {
    setActiveDossierId(projectId)
  }, [projectId])

  // Bewaar het open project continu als dossier-snapshot en houd de projectenlijst
  // (titel/opdrachtgever/tijd) actueel, zodat je het later precies terugvindt.
  useEffect(() => {
    const updatedAt = new Date().toISOString()
    const html = liveDraftHtml()
    const snapshot: DossierSnapshot = {
      project,
      documents,
      tenderDocuments,
      // Het actieve stuk wordt met de live editor-inhoud weggeschreven; de overige stukken
      // staan al bijgewerkt in `drafts`.
      drafts: drafts.map((item) =>
        item.id === activeDraftId ? { ...item, html, stage, comments, updatedAt } : item,
      ),
      activeDraftId,
      comments,
      stage,
      draft: html,
      analysis,
      analysisSource,
      requirementStatuses,
      updatedAt,
    }
    saveDossier(projectId, snapshot)
    upsertProject({
      id: projectId,
      title: project.title || 'Naamloos project',
      buyer: project.buyer,
      updatedAt,
      source: projectId.startsWith('prj-') ? 'blank' : 'tender',
    })
    // Er is zojuist een schrijfopdracht gestart: het opdracht-id moet nú in de database
    // staan, want dat is na het sluiten van het tabblad de weg terug naar het werk.
    if (flushJobRefRef.current) {
      flushJobRefRef.current = false
      void flushStorage()
    }
  }, [projectId, project, documents, tenderDocuments, comments, stage, draft, analysis, analysisSource, requirementStatuses, drafts, activeDraftId])

  useEffect(() => {
    draftsRef.current = drafts
  }, [drafts])

  const activeDraft = useMemo(
    () => drafts.find((item) => item.id === activeDraftId) ?? drafts[0] ?? null,
    [drafts, activeDraftId],
  )

  // Elke AI-aanroep vanuit de werkplek wordt toegerekend aan het project en het stuk dat
  // hier open staat, zodat de verbruikspagina kan tonen wat een stuk heeft gekost.
  useEffect(() => {
    setUsageScope({
      projectId,
      projectTitle: project.title,
      draftId: activeDraft?.id,
      draftTitle: activeDraft?.title,
    })
    return clearUsageScope
  }, [projectId, project.title, activeDraft?.id, activeDraft?.title])

  // Schrijf een nieuwe stukkenlijst weg (state + ref), zodat vervolgstappen in dezelfde
  // async flow direct de actuele lijst zien.
  const commitDrafts = (next: DraftDocument[]) => {
    draftsRef.current = next
    setDrafts(next)
  }

  const persistDraft = (id: string, patch: Partial<Omit<DraftDocument, 'id'>>) => {
    const updatedAt = new Date().toISOString()
    commitDrafts(draftsRef.current.map((item) => (item.id === id ? { ...item, ...patch, updatedAt } : item)))
  }

  // Bewaar de werkkopie van het actieve stuk in de lijst (vóór wisselen of heranalyse).
  const persistActiveDraft = (html: string, currentStage: Stage, currentComments: ReviewComment[]) => {
    persistDraft(activeDraftIdRef.current, { html, stage: currentStage, comments: currentComments })
  }

  // Zet een stuk in de editor: werkkopie, stadium en opmerkingen volgen het stuk.
  const activateDraft = (target: DraftDocument) => {
    activeDraftIdRef.current = target.id
    setActiveDraftId(target.id)
    setDraft(target.html)
    setStage(target.stage)
    setComments(target.comments)
    setFindings([])
    setCommentPopover(null)
    const editor = editorRef.current
    if (editor) editor.innerHTML = target.html
  }

  // ── Schrijfopdrachten op de server ─────────────────────────────────────────
  // De schrijfagent draait als opdracht op de server, niet in deze browserverbinding. Bij
  // het stuk staat welk opdracht-id erbij hoort; daardoor overleeft een generatie het
  // sluiten van het tabblad of een weggevallen verbinding, en wordt de opdracht bij
  // terugkomst (ook op een ander apparaat) weer opgepakt.

  /** Opdrachten die nu al gevolgd worden; voorkomt dubbel meekijken op dezelfde opdracht. */
  const watchedJobsRef = useRef<Set<string>>(new Set())
  /** Stopt het meekijken zodra de projectomgeving wordt verlaten (de opdracht loopt door). */
  const watchStopRef = useRef<AbortController | null>(null)
  /** Vlag: het opdracht-id moet met voorrang naar de database (zie het dossier-effect). */
  const flushJobRefRef = useRef(false)

  const rememberJob = (
    draftId: string,
    snapshot: WriteDraftJobSnapshot,
    kind: DraftJobRef['kind'],
    jobStage: Stage,
  ) => {
    persistDraft(draftId, { job: { id: snapshot.id, stage: jobStage, kind, startedAt: snapshot.startedAt } })
    // Sluit de gebruiker het tabblad direct na de start, dan is dit id de enige weg terug
    // naar het lopende werk; wachten op de gebruikelijke vertraagde opslag kan dan niet.
    flushJobRefRef.current = true
  }

  /** Neem het resultaat van een afgeronde opdracht over in het stuk. */
  const applyJobResult = (draftId: string, job: DraftJobRef, result: WriteDraftResponse) => {
    const doc = draftsRef.current.find((item) => item.id === draftId)
    const title = doc?.title ?? 'Stuk'
    const active = activeDraftIdRef.current === draftId
    const patch: Partial<Omit<DraftDocument, 'id'>> = { html: result.html, stage: job.stage, job: null }
    if (job.kind === 'verbeterronde' && doc?.round) patch.round = markRoundProcessed(doc.round)
    const nextComments = (doc?.comments ?? []).map((comment) =>
      comment.status === 'open' ? { ...comment, status: 'akkoord' as CommentStatus } : comment,
    )
    if (job.kind === 'opmerkingen') patch.comments = nextComments

    persistDraft(draftId, patch)
    recordVersion(draftId, {
      kind: job.kind === 'schrijven' ? 'generatie' : 'verwerking',
      label: `"${title}" afgerond door de schrijfagent (${stageMeta[job.stage].label})`,
      stage: job.stage,
      html: result.html,
      provider: result.provider,
      model: result.model,
    })
    if (active) {
      updateEditorHtml(result.html)
      setStage(job.stage)
      if (job.kind === 'opmerkingen') setComments(nextComments)
      setFindings(reviewDraft(result.html, effectiveDocuments, scopeFor(analysis)))
    }
    setSyncStatus(`"${title}" gereed met ${result.provider} (${result.model})`)
  }

  /**
   * Een mislukking hoort niet weg te zakken in de statusregel: die blijft het logboek,
   * maar de gebruiker krijgt de fout ook als melding in beeld — met, waar dat kan, een
   * knop om dezelfde actie opnieuw te proberen.
   */
  const reportError = (message: string, retry?: () => void, retryLabel?: string) => {
    setSyncStatus(message)
    notifyError(message, retry ? { retry, retryLabel } : {})
  }

  /**
   * Een mislukt kanaal is geen mislukte opdracht: valt de verbinding weg of stoppen we
   * bewust met meekijken, dan blijft de opdracht op de server staan en wordt hij later
   * opgepakt. Geeft true als de fout zo is afgehandeld.
   */
  const handleFollowError = (error: unknown, title: string): boolean => {
    if (error instanceof DraftJobDisconnected || error instanceof DraftJobUnwatched) {
      setSyncStatus(
        `Geen verbinding met de server; de schrijfagent werkt door aan "${title}". Het stuk staat er zodra je terug bent.`,
      )
      return true
    }
    return false
  }

  /** Kijk mee met een lopende opdracht en verwerk het resultaat zodra het stuk klaar is. */
  const watchJob = async (draftId: string, job: DraftJobRef) => {
    if (watchedJobsRef.current.has(job.id)) return
    watchedJobsRef.current.add(job.id)
    const title = draftsRef.current.find((item) => item.id === draftId)?.title ?? 'stuk'
    const isActive = () => activeDraftIdRef.current === draftId
    const blocksEditor = isActive()
    if (blocksEditor) setGenerating(true)
    setSyncStatus(`De schrijfagent werkt op de server verder aan "${title}"…`)
    try {
      const result = await followDraftJob(job.id, {
        onProgress: (html) => {
          if (isActive()) updateEditorHtml(html)
        },
        onStatus: (message) => setSyncStatus(`${title}: ${message}`),
        signal: watchStopRef.current?.signal,
      })
      applyJobResult(draftId, job, result)
    } catch (error) {
      if (handleFollowError(error, title)) return
      // De opdracht is echt afgelopen (mislukt) of niet meer bekend: verwijzing opruimen,
      // anders blijft het stuk eeuwig "bezig" lijken. De geschreven tekst blijft staan.
      persistDraft(draftId, { job: null })
      const target = draftsRef.current.find((item) => item.id === draftId)
      reportError(
        error instanceof DraftJobLost
          ? `De schrijfopdracht voor "${title}" is niet meer bekend bij de server. Start de schrijfagent opnieuw.`
          : `Genereren van "${title}" mislukt: ${error instanceof Error ? error.message : 'onbekende fout'}`,
        target ? () => void analyzeAndGenerate(job.stage, target) : undefined,
        'Opnieuw schrijven',
      )
    } finally {
      watchedJobsRef.current.delete(job.id)
      if (blocksEditor) setGenerating(false)
    }
  }

  // Het meekijken stopt bij het verlaten van de projectomgeving; de opdracht zelf draait op
  // de server door en wordt bij terugkomst opnieuw opgepakt.
  useEffect(() => {
    const controller = new AbortController()
    watchStopRef.current = controller
    return () => controller.abort()
  }, [])

  // Pik lopende opdrachten op: bij het openen van het project, na een gesloten tabblad en
  // nadat een weggevallen verbinding het meekijken afbrak. Tijdens een generatie die vanuit
  // deze sessie loopt gebeurt dat niet — die kijkt zelf al mee.
  useEffect(() => {
    if (generating || batchRunning) return
    for (const item of drafts) {
      if (item.job && !watchedJobsRef.current.has(item.job.id)) void watchJob(item.id, item.job)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, generating, batchRunning])

  const switchDraft = (id: string) => {
    if (id === activeDraftIdRef.current || generating || rewritingId) return
    const target = draftsRef.current.find((item) => item.id === id)
    if (!target) return
    syncDraftFromEditor()
    captureManualEdit()
    persistActiveDraft(liveDraftHtml(), stage, comments)
    activateDraft(target)
    setSyncStatus(`Stuk geopend: ${target.title}`)
  }

  // Breng de stukkenlijst in lijn met een (nieuwe) analyse en geef de nieuwe lijst terug.
  const applyAnalysisToDrafts = (result: TenderAnalysis): DraftDocument[] => {
    syncDraftFromEditor()
    persistActiveDraft(liveDraftHtml(), stage, comments)
    const next = reconcileDrafts(draftsRef.current, result, project, documents)
    commitDrafts(next)
    if (!next.some((item) => item.id === activeDraftIdRef.current)) activateDraft(next[0])
    return next
  }

  // Analyse toegespitst op één stuk (limieten, criteria en onderwerpen van dát document),
  // plus de overige stukken ter afbakening voor de schrijfagent.
  const briefFor = (doc: DraftDocument | null, result: TenderAnalysis | null) => {
    const requested: RequestedDocument | undefined = doc?.requested
    const sole = writableDocuments(result).length <= 1 && draftsRef.current.length <= 1
    const scoped = result && requested ? scopeAnalysisToDocument(result, requested, { soleDocument: sole }) : result
    const siblings: WriteDraftSibling[] = draftsRef.current
      .filter((item) => item.id !== doc?.id)
      .map((item) => ({ title: item.title, kind: item.requested.kind, question: item.requested.question }))
    return { requested, scoped, siblings }
  }

  const scopeFor = (result: TenderAnalysis | null) => briefFor(activeDraft, result).scoped

  const scopedAnalysis = useMemo(
    () => (analysis && activeDraft ? scopeAnalysisToDocument(analysis, activeDraft.requested) : analysis),
    [analysis, activeDraft],
  )

  // Eisenregister: schrijfstukken met een geschreven concept gelden automatisch als afgedekt.
  const writtenDocumentIds = useMemo(
    () =>
      new Set(
        drafts.filter((item) => !isStartDraft(item.id === activeDraftId ? draft : item.html)).map((item) => item.id),
      ),
    [drafts, activeDraftId, draft],
  )

  const setRequirementStatus = (id: string, status: RequirementStatus, note?: string) => {
    setRequirementStatuses((current) => ({
      ...current,
      [id]: {
        status,
        note: note === undefined ? current[id]?.note : note.trim() || undefined,
        by: 'gebruiker',
        updatedAt: new Date().toISOString(),
      },
    }))
  }

  // Verbeterronde van het actieve stuk (antwoorden, goed-/afkeuren) bewaren op het stuk.
  const updateRound = (round: ImprovementRound) => {
    persistDraft(activeDraftIdRef.current, { round })
  }

  // Verwerk de verbeterronde naar de volgende versie: uitsluitend goedgekeurde voorstellen en
  // gegeven antwoorden gaan als feitelijke basis naar de schrijfagent; onbeantwoorde vragen
  // mogen niet met aannames worden ingevuld.
  const applyImprovements = async () => {
    if (generating || reviewing) return
    const current = draftsRef.current.find((item) => item.id === activeDraftIdRef.current)
    const round = current?.round
    const html = liveDraftHtml()
    if (!round || isStartDraft(html)) return
    const improvements = roundToImprovements(round)
    if (!improvements || (!improvements.approvedProposals.length && !improvements.answers.length)) {
      setSyncStatus('Beantwoord eerst een vraag of keur een voorstel goed; er is nog niets te verwerken.')
      return
    }
    const target = nextStageFor(stage)
    captureManualEdit()
    setGenerating(true)
    setSyncStatus(`Schrijfagent verwerkt de verbeterronde naar ${stageMeta[target].label}…`)
    const result = analysis ?? (await runAnalysis())
    const { requested, scoped, siblings } = briefFor(activeDraft, result)
    const lessonDocuments = await gatherLessonDocuments(result)
    const evidenceDocuments = await gatherEvidenceDocuments(result, requested)
    const distilledById = await gatherDistilledDocuments()

    try {
      const aiResult = await generateDraftViaApi(
        {
          stage: target,
          project,
          documents: [...applyDistillates(effectiveDocuments, distilledById), ...evidenceDocuments, ...lessonDocuments],
          comments: toLegacyComments(comments),
          analysis: scoped,
          targetDocument: requested,
          siblingDocuments: siblings,
          improvements,
          currentDraft: stripCommentMarks(html),
          layout: measureLayout(),
        },
        {
          job: {
            projectId,
            draftId: activeDraftIdRef.current,
            draftTitle: current?.title ?? project.title,
            kind: 'verbeterronde',
          },
          onStarted: (snapshot) => rememberJob(activeDraftIdRef.current, snapshot, 'verbeterronde', target),
          onProgress: (accumulated) => updateEditorHtml(accumulated || html),
          onStatus: (message) => setSyncStatus(message),
          signal: watchStopRef.current?.signal,
        },
      )
      updateEditorHtml(aiResult.html)
      persistDraft(activeDraftIdRef.current, {
        html: aiResult.html,
        stage: target,
        round: markRoundProcessed(round),
        job: null,
      })
      recordVersion(activeDraftIdRef.current, {
        kind: 'verwerking',
        label: `Verbeterronde verwerkt naar ${stageMeta[target].label}`,
        stage: target,
        html: aiResult.html,
        provider: aiResult.provider,
        model: aiResult.model,
      })
      setStage(target)
      setFindings(reviewDraft(aiResult.html, effectiveDocuments, scoped))
      setSyncStatus(
        `Verbeterronde verwerkt naar ${stageMeta[target].label} met ${aiResult.provider} (${aiResult.model}) — voer een nieuwe AI-review uit voor de volgende ronde`,
      )
    } catch (error) {
      // Verbinding weg: de opdracht loopt op de server door en wordt straks opgepakt.
      if (handleFollowError(error, current?.title ?? 'dit stuk')) return
      const message = error instanceof Error ? error.message : 'Verwerken mislukt.'
      if (isNoAiConfigError(message)) {
        // Zonder AI: antwoorden en goedgekeurde voorstellen zichtbaar in het concept zetten,
        // zodat de ronde niet verloren gaat (zelfde mechanisme als bij opmerkingen).
        const items = [
          ...improvements.answers.map(
            (item) => `<p><strong>Aanvullende informatie:</strong> ${summarize(item.answer, 260)}</p>`,
          ),
          ...improvements.approvedProposals.map(
            (item) => `<p><strong>Voorstel verwerkt:</strong> ${item.title} — ${summarize(item.detail, 200)}</p>`,
          ),
        ].join('')
        const next = html.replace('</article>', `<section><h2>Verbeterronde verwerkt</h2>${items}</section></article>`)
        updateEditorHtml(next)
        persistDraft(activeDraftIdRef.current, { html: next, stage: target, round: markRoundProcessed(round) })
        recordVersion(activeDraftIdRef.current, {
          kind: 'verwerking',
          label: `Verbeterronde lokaal verwerkt naar ${stageMeta[target].label}`,
          stage: target,
          html: next,
        })
        setStage(target)
        setFindings(reviewDraft(next, effectiveDocuments, scoped))
        setSyncStatus('Verbeterronde lokaal verwerkt (geen AI geconfigureerd)')
        return
      }
      reportError(`Verbeterronde verwerken mislukt: ${message}`, () => void applyImprovements())
    } finally {
      setGenerating(false)
    }
  }

  const addCustomDraft = () => {
    const title = customDocTitle.trim()
    if (!title) return
    const requested = makeCustomRequestedDocument(
      title,
      customDocQuestion,
      draftsRef.current.map((item) => item.id),
    )
    const created = makeDraftDocument({ requested, project, documents, source: 'eigen' })
    syncDraftFromEditor()
    persistActiveDraft(liveDraftHtml(), stage, comments)
    commitDrafts([...draftsRef.current, created])
    activateDraft(created)
    setCustomDocOpen(false)
    setCustomDocTitle('')
    setCustomDocQuestion('')
    setSyncStatus(`Eigen stuk toegevoegd: ${created.title}. Klik "Start schrijfagent" om het te laten schrijven.`)
  }

  // Verwijderen zelf: legt eerst vast wát er verdwijnt, zodat de melding het stuk
  // (inclusief zijn versiegeschiedenis) binnen het undo-venster kan terugzetten.
  const performRemoveDraft = (id: string) => {
    const index = draftsRef.current.findIndex((item) => item.id === id)
    if (index < 0) return
    const target = draftsRef.current[index]
    const wasActive = id === activeDraftIdRef.current
    const removed: DraftDocument = wasActive ? { ...target, html: liveDraftHtml(), comments } : target
    const removedVersions = versionsRef.current[id] ?? []
    const next = draftsRef.current.filter((item) => item.id !== id)
    commitDrafts(next)
    const history = pruneRemovedDrafts(versionsRef.current, next.map((item) => item.id))
    if (history !== versionsRef.current) {
      versionsRef.current = history
      setVersionHistory(history)
      saveVersionHistory(projectId, history)
    }
    if (wasActive) activateDraft(next[0])
    setSyncStatus(`Stuk verwijderd: ${target.title}`)
    notifyUndo(`Stuk verwijderd: ${target.title}`, () => {
      const restored = [...draftsRef.current]
      restored.splice(Math.min(index, restored.length), 0, removed)
      commitDrafts(restored)
      if (removedVersions.length) {
        const withHistory = { ...versionsRef.current, [id]: removedVersions }
        versionsRef.current = withHistory
        setVersionHistory(withHistory)
        saveVersionHistory(projectId, withHistory)
      }
      if (wasActive) activateDraft(removed)
      setSyncStatus(`Stuk teruggezet: ${removed.title}`)
    })
  }

  // Een leeg stuk verdwijnt direct (met undo); een geschreven stuk vraagt eerst om
  // bevestiging, met de omvang die je kwijtraakt erbij.
  const removeDraft = (id: string) => {
    if (generating || draftsRef.current.length <= 1) return
    const target = draftsRef.current.find((item) => item.id === id)
    if (!target) return
    const html = id === activeDraftIdRef.current ? liveDraftHtml() : target.html
    if (isStartDraft(html)) {
      performRemoveDraft(id)
      return
    }
    const versions = versionsRef.current[id]?.length ?? 0
    const openComments = (id === activeDraftIdRef.current ? comments : target.comments ?? []).filter(
      (comment) => comment.status !== 'akkoord',
    ).length
    setDraftToRemove({
      id,
      title: target.title,
      details: [
        `${countWords(html).toLocaleString('nl-NL')} geschreven woorden`,
        `${versions} bewaarde versie(s)`,
        ...(openComments ? [`${openComments} openstaande opmerking(en)`] : []),
      ],
    })
  }

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || generating || document.activeElement === editor) return
    if (editor.innerHTML !== draft) {
      editor.innerHTML = draft
    }
  }, [draft, generating])

  const updateEditorHtml = (html: string) => {
    setDraft(html)
    const editor = editorRef.current
    if (editor) editor.innerHTML = html
  }

  // Het live editor-DOM is leidend, maar direct na mount is de editor nog leeg
  // (de inhoud wordt pas via een effect ingevuld). Val dan terug op de
  // draft-state, zodat een dossier nooit met een leeg concept wordt
  // overschreven en geschreven stukken niet verloren gaan.
  const liveDraftHtml = () => {
    const html = editorRef.current?.innerHTML
    return html && html.trim() ? html : draft
  }

  // ── Versiegeschiedenis ─────────────────────────────────────────────────────
  // Elke generatie, verwerking, eigen bewerkingsronde en herstelactie wordt als versie
  // bewaard, zodat "Genereer" nooit werk weggooit en de schrijver kan terugbladeren.
  const recordVersion = (draftId: string, input: NewDraftVersion) => {
    const next = recordDraftVersion(versionsRef.current, draftId, input)
    // Ongewijzigde tekst levert dezelfde geschiedenis op; dan valt er niets te bewaren.
    if (next === versionsRef.current) return
    versionsRef.current = next
    setVersionHistory(next)
    saveVersionHistory(projectId, next)
  }

  // Leg het handwerk van de schrijver vast vóór een AI-actie, een wissel van stuk of het
  // herstellen van een oudere versie.
  const captureManualEdit = (label = 'Eigen bewerkingsronde') => {
    // Tijdens het schrijven bouwt de agent de tekst stap voor stap op; die tussenstand is
    // geen handwerk van de schrijver. De aanroepers leggen het handwerk vast vóór ze de
    // agent starten.
    if (generating || rewritingId) return
    const html = liveDraftHtml()
    if (!html.trim() || isStartDraft(html)) return
    recordVersion(activeDraftIdRef.current, { kind: 'bewerking', label, stage, html })
  }

  // Eigen bewerkingen worden ook zonder AI-actie bewaard: na een korte pauze in het typen
  // gaat de tekst als bewerkingsronde de geschiedenis in.
  useEffect(() => {
    if (generating || rewritingId || isStartDraft(draft)) return
    const timer = setTimeout(() => captureManualEdit(), MANUAL_EDIT_DELAY_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, generating, rewritingId, activeDraftId])

  const activeVersions = useMemo(() => versionsFor(versionHistory, activeDraftId), [versionHistory, activeDraftId])

  // Oudere versie terugzetten in de editor. De huidige tekst gaat er eerst als versie in,
  // zodat herstellen zelf ook niets weggooit.
  const restoreVersion = (version: DraftVersion) => {
    if (generating || rewritingId) return
    captureManualEdit('Eigen tekst vóór herstel')
    const draftId = activeDraftIdRef.current
    updateEditorHtml(version.html)
    setStage(version.stage)
    persistDraft(draftId, { html: version.html, stage: version.stage })
    setFindings(reviewDraft(version.html, effectiveDocuments, scopedAnalysis))
    recordVersion(draftId, {
      kind: 'herstel',
      label: `Hersteld: ${version.label}`,
      stage: version.stage,
      html: version.html,
      restoredFromId: version.id,
    })
    setVersionDialogOpen(false)
    setSyncStatus(`Versie van ${formatVersionMoment(version.createdAt)} hersteld — de vorige tekst staat in de versies.`)
  }

  // Zolang de schrijfagent nog niet is gestart, bevat het veld alleen een samenvatting
  // van de aanbesteding (geen concept). Die samenvatting volgt de bronnen en
  // projectgegevens, bijvoorbeeld nadat een aanbesteding aan dit project is gekoppeld.
  const notStarted = isStartDraft(draft)
  useEffect(() => {
    if (!isStartDraft(draft)) return
    const next = buildStartDraft(project, documents, activeDraft?.requested)
    if (next !== draft) setDraft(next)
  }, [draft, documents, project, activeDraft])

  const visibleSources = useMemo(() => {
    const list = showAllSources ? documents : documents.filter((doc) => doc.type === activeType)
    return list
  }, [activeType, documents, showAllSources])

  const selectedSource = useMemo(
    () => documents.find((doc) => doc.id === selectedSourceId) ?? null,
    [documents, selectedSourceId],
  )

  // Wat er van de aanbestedingsdocumenten daadwerkelijk als bron is ingelezen.
  const tenderSourceStats = useMemo(() => {
    const tenderSources = documents.filter((doc) => doc.type === 'tender')
    return {
      count: tenderSources.length,
      words: tenderSources.reduce((total, doc) => total + countWords(doc.content), 0),
    }
  }, [documents])

  const opportunity = useMemo(
    () => computeOpportunityScore(getCompanyConfig(), analysis, effectiveDocuments),
    [analysis, effectiveDocuments],
  )

  const stats = useMemo(() => {
    const words = notStarted ? 0 : countWords(draft)
    return {
      words,
      chars: notStarted ? 0 : countCharacters(draft),
      sources: effectiveDocuments.length,
      unresolved: comments.filter((comment) => comment.status === 'open').length,
      score: opportunity.score,
      leidraad: analysis?.leidraadFound ?? false,
    }
  }, [analysis, comments, draft, effectiveDocuments.length, notStarted, opportunity.score])

  // ── Omvang bewaken ─────────────────────────────────────────────────────────
  // "Max. 2 A4" is een vormeis: een stuk dat uitloopt kan de inschrijving ongeldig
  // maken. Het paginagetal komt daarom uit de PDF-bouwer zelf — precies wat er straks
  // wordt geëxporteerd. Dat is te zwaar voor elke toetsaanslag, dus met vertraging na
  // de laatste wijziging.
  const [pdf, setPdf] = useState<ProposalPdfMeasure | undefined>(undefined)
  useEffect(() => {
    if (notStarted) {
      setPdf(undefined)
      return
    }
    const timer = setTimeout(() => setPdf(safeMeasurePdf(draft)), PAGE_COUNT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft, notStarted])
  const pageCount = pdf?.pages

  const volumeLimits = useMemo(() => limitsForAnalysis(scopedAnalysis), [scopedAnalysis])

  const volume = useMemo(() => {
    const checks = checkVolume({ words: stats.words, chars: stats.chars, pages: pageCount }, volumeLimits)
    return { checks, level: volumeLevel(checks), over: overLimitSummary(checks) }
  }, [pageCount, stats.chars, stats.words, volumeLimits])

  /**
   * De tellers boven het concept: elke gestelde limiet krijgt een eigen tegel met de
   * stand ervan. Woorden en pagina's staan er ook zonder limiet — dan puur informatief.
   */
  const volumeTiles = useMemo((): VolumeTileData[] => {
    const byUnit = new Map(volume.checks.map((check) => [check.unit, check]))
    const caption = (unit: VolumeCheck['unit']) => {
      const label = volumeUnitLabels[unit]
      return `${label[0].toUpperCase()}${label.slice(1)}`
    }

    return (['woorden', 'karakters', 'paginas'] as const).flatMap((unit): VolumeTileData[] => {
      const check = byUnit.get(unit)
      if (check) {
        const used = unit === 'paginas' ? printedPages(check.used) : Math.round(check.used)
        const geschat = check.estimated ? ' (geschat)' : ''
        return [
          {
            unit,
            value: `${used.toLocaleString('nl-NL')} / ${check.max.toLocaleString('nl-NL')}`,
            caption: `${caption(unit)} (max)`,
            level: check.level,
            title:
              unit === 'paginas' && pdf
                ? `${check.level === 'over' ? 'Over de limiet — ' : ''}${pageFillLabel(pdf)}; de leidraad staat ${check.max} toe.`
                : `${check.level === 'over' ? 'Over de limiet: ' : ''}${check.label}${geschat}`,
          },
        ]
      }
      // Zonder limiet: woorden altijd tonen, pagina's zodra de PDF is doorgerekend.
      if (unit === 'woorden') {
        return [{ unit, value: stats.words.toLocaleString('nl-NL'), caption: caption(unit), level: 'ok' }]
      }
      if (unit === 'paginas' && pdf) {
        return [{ unit, value: String(pdf.pages), caption: caption(unit), level: 'ok', title: pageFillLabel(pdf) }]
      }
      return []
    })
  }, [pdf, stats.words, volume.checks])

  /**
   * Paginagetal per stuk voor de stukkenlijst. Het openstaande stuk gebruikt de live meting;
   * de andere stukken worden alleen doorgerekend als hun tekst verandert — anders zou elke
   * toetsaanslag de PDF van álle stukken opnieuw opbouwen.
   */
  const otherDraftsKey = drafts
    .filter((item) => item.id !== activeDraftId)
    .map((item) => `${item.id}:${item.html.length}`)
    .join('|')
  const otherDraftPages = useMemo(() => {
    const map = new Map<string, number | undefined>()
    for (const item of draftsRef.current) {
      if (item.id === activeDraftIdRef.current || isStartDraft(item.html)) continue
      map.set(item.id, safePageCount(item.html))
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherDraftsKey])

  /**
   * Opmaakdichtheid van dit project voor de schrijfagent: hoeveel zichtbare woorden er in
   * één A4 passen, gemeten aan het langste geschreven stuk. Daarmee rekent de schrijfagent
   * een paginalimiet om naar een woordbudget dat klopt met de echte export. Nog niets
   * geschreven → geen meting, dan geldt de geijkte standaard op de server.
   */
  const measureLayout = (): { wordsPerPage: number } | undefined => {
    try {
      const written = draftsRef.current
        .map((item) => (item.id === activeDraftIdRef.current ? { ...item, html: liveDraftHtml() } : item))
        .filter((item) => !isStartDraft(item.html))
        .sort((a, b) => countWords(b.html) - countWords(a.html))[0]
      if (!written) return undefined
      const wordsPerPage = measureWordsPerPage(countWords(written.html), measureProposalPdf(written.html).filled)
      return wordsPerPage ? { wordsPerPage } : undefined
    } catch {
      return undefined
    }
  }

  const [showScoreDetails, setShowScoreDetails] = useState(false)

  // Map-fase: analyseer elk aanbestedingsstuk apart (parallel, met cache) zodat álle
  // documenten volledig gelezen worden zonder truncatie. Levert extracten voor de reduce.
  const MAP_CONCURRENCY = 3

  const gatherDocumentExtracts = async (): Promise<TenderDocumentExtract[]> => {
    const tenderDocs = effectiveDocuments.filter((doc) => doc.type === 'tender' && doc.content.trim())
    if (!tenderDocs.length) return []

    // Cache: hergebruik een eerder extract zolang de brontekst niet is gewijzigd.
    const cached = new Map(documents.map((doc) => [doc.id, doc.extract]))
    const isFresh = (doc: (typeof tenderDocs)[number]) =>
      cached.get(doc.id)?.sourceChars === doc.content.length

    setSyncStatus(`Documenten los analyseren (0/${tenderDocs.length})…`)
    const extracts = await mapWithConcurrency(
      tenderDocs,
      MAP_CONCURRENCY,
      async (doc): Promise<TenderDocumentExtract | null> => {
        const reused = isFresh(doc) ? cached.get(doc.id) : null
        // Het brede extract (analysis-tier) en de smalle eisen-extractie (light-tier) lopen
        // parallel; elk wordt alleen opnieuw gedaan als het nog niet op het document is gecachet.
        const [extract, requirements] = await Promise.all([
          reused ?? analyzeDocumentViaApi(doc, project.buyer),
          reused?.requirements ?? extractRequirementsViaApi(doc, project.buyer),
        ])
        if (!extract) return null
        return { name: doc.name, extract: requirements ? { ...extract, requirements } : extract }
      },
      (done, total) => setSyncStatus(`Documenten los analyseren (${done}/${total})…`),
    )

    const resolved = extracts.filter((item): item is TenderDocumentExtract => item !== null)

    // Verse extracten terugschrijven naar de documenten-state zodat ze gecachet blijven.
    const byName = new Map(resolved.map((item) => [item.name, item.extract]))
    setDocuments((current) =>
      current.map((doc) =>
        doc.type === 'tender' && byName.has(doc.name) ? { ...doc, extract: byName.get(doc.name) } : doc,
      ),
    )

    return resolved
  }

  // Vingerafdruk van de analyse-input: zolang bronnen en opdrachtgever gelijk
  // blijven, kan een eerdere AI-analyse veilig worden hergebruikt.
  const analysisFingerprintFor = (
    docs: { name: string; type: string; content: string }[],
    buyer: string,
  ): string => JSON.stringify([buyer, docs.map((doc) => [doc.name, doc.type, doc.content.length])])

  // Compressie: destilleer omvangrijke niet-leidraadbronnen eenmalig tot een
  // compacte promptversie en cache die op het document. De leidraad (tender)
  // gaat altijd integraal mee — daar telt elke eis letterlijk.
  const gatherDistilledDocuments = async (): Promise<Map<string, string>> => {
    const compressible = new Set<SourceType>(['company', 'rules', 'training'])
    const minChars = 6_000
    const candidates = documents.filter(
      (doc) => compressible.has(doc.type) && doc.content.length >= minChars,
    )
    const distilledById = new Map<string, string>()
    if (!candidates.length) return distilledById

    const stale: SourceDocument[] = []
    for (const doc of candidates) {
      if (doc.distilled?.sourceChars === doc.content.length) {
        distilledById.set(doc.id, doc.distilled.content)
      } else {
        stale.push(doc)
      }
    }
    if (!stale.length) return distilledById

    setSyncStatus(`Bronnen comprimeren (0/${stale.length})…`)
    const results = await mapWithConcurrency(
      stale,
      3,
      async (doc) => ({ id: doc.id, result: await distillDocumentViaApi(doc) }),
      (done, total) => setSyncStatus(`Bronnen comprimeren (${done}/${total})…`),
    )

    const fresh = new Map<string, DistillDocumentResponse>()
    for (const item of results) {
      if (item.result) {
        fresh.set(item.id, item.result)
        distilledById.set(item.id, item.result.content)
      }
    }

    // Cache het distillaat op het document, zodat het maar één keer betaald wordt.
    if (fresh.size) {
      const stamp = new Date().toISOString()
      setDocuments((current) =>
        current.map((doc) => {
          const result = fresh.get(doc.id)
          return result
            ? {
                ...doc,
                distilled: {
                  content: result.content,
                  sourceChars: result.sourceChars,
                  distilledAt: stamp,
                  provider: result.provider,
                  model: result.model,
                },
              }
            : doc
        }),
      )
    }

    return distilledById
  }

  /** Vervangt de inhoud van gecomprimeerde bronnen in de prompt; de leidraad blijft integraal. */
  const applyDistillates = <T extends { id: string; content: string }>(
    docs: T[],
    distilledById: Map<string, string>,
  ): T[] =>
    distilledById.size
      ? docs.map((doc) => {
          const compact = distilledById.get(doc.id)
          return compact ? { ...doc, content: compact } : doc
        })
      : docs

  const runAnalysis = async () => {
    const baseline = analyzeTenderDocuments(effectiveDocuments, project.buyer)
    setAnalysis(baseline)

    const extracts = await gatherDocumentExtracts()

    setSyncStatus(
      extracts.length
        ? `Uitvraag samenvoegen uit ${extracts.length} documentanalyse(s)…`
        : 'AI analyseert de uitvraag (documenten, limieten, vragen, eisen, stijl)…',
    )

    const enriched = await analyzeTenderViaApi(project.buyer, effectiveDocuments, baseline, extracts)
    if (enriched?.enriched) {
      const result = normalizeStoredAnalysis(enriched.analysis) ?? enriched.analysis
      setAnalysis(result)
      setAnalysisSource(analysisFingerprintFor(effectiveDocuments, project.buyer))
      applyAnalysisToDrafts(result)
      setSyncStatus(
        `Uitvraag-analyse door ${enriched.provider} (${enriched.model}): ${writableDocuments(result).length} op te stellen stuk(ken), ${result.contentRequirements.length} vragen, ${result.documentRequirements.length} documenten, ${result.requirements?.length ?? 0} eisen in het register`,
      )
      return result
    }

    applyAnalysisToDrafts(baseline)
    setSyncStatus(
      `Heuristische analyse: ${writableDocuments(baseline).length} op te stellen stuk(ken), ${baseline.contentRequirements.length} vragen, ${baseline.documentRequirements.length} documenten, ${baseline.requirements?.length ?? 0} eisen in het register`,
    )
    return baseline
  }

  // Schrijf (of herschrijf) één stuk. Zonder `target` is dat het actieve stuk; met `target`
  // wordt dat stuk eerst in de editor gezet (gebruikt door "Schrijf alle stukken").
  const analyzeAndGenerate = async (targetStage = stage, target?: DraftDocument, preAnalysis?: TenderAnalysis) => {
    // Eerst het handwerk vastleggen: een generatie overschrijft de editor, maar de vorige
    // tekst blijft als versie terugvindbaar.
    captureManualEdit()
    setGenerating(true)
    // Hergebruik de bestaande AI-analyse zolang bronnen en opdrachtgever
    // ongewijzigd zijn; dat scheelt de volledige analyse-pijplijn per generatie.
    let result: TenderAnalysis
    if (preAnalysis) {
      result = preAnalysis
    } else if (analysis && analysisSource === analysisFingerprintFor(effectiveDocuments, project.buyer)) {
      result = analysis
      setSyncStatus('Leidraadanalyse hergebruikt (bronnen ongewijzigd)…')
    } else {
      setSyncStatus('Leidraad analyseren…')
      result = await runAnalysis()
    }

    // Het te schrijven stuk (de analyse kan de lijst zojuist hebben bijgewerkt).
    const activeIdBefore = activeDraftIdRef.current
    const wantedId = target?.id ?? activeIdBefore
    const doc = draftsRef.current.find((item) => item.id === wantedId) ?? draftsRef.current[0]
    const isActive = doc.id === activeIdBefore
    // Bewaar de huidige tekst, zodat een mislukte generatie het concept niet wist.
    const previousDraft = isActive ? liveDraftHtml() : doc.html
    const docComments = isActive ? comments : doc.comments
    if (!isActive) {
      syncDraftFromEditor()
      persistActiveDraft(liveDraftHtml(), stage, comments)
      activateDraft(doc)
    }
    setStage(targetStage)

    const { requested, scoped, siblings } = briefFor(doc, result)
    const lessonDocuments = await gatherLessonDocuments(result)
    const evidenceDocuments = await gatherEvidenceDocuments(result, requested)
    const distilledById = await gatherDistilledDocuments()
    updateEditorHtml('<p class="generation-placeholder">Concept wordt opgebouwd…</p>')

    try {
      const extras = [
        evidenceDocuments.length ? 'bewijsbouwstenen' : '',
        lessonDocuments.length ? 'toegepaste leerpunten' : '',
      ].filter(Boolean)
      setSyncStatus(
        extras.length
          ? `Schrijfagent schrijft "${doc.title}" met ${extras.join(' en ')}…`
          : `Schrijfagent schrijft "${doc.title}"…`,
      )
      const aiResult = await generateDraftViaApi(
        {
          stage: targetStage,
          project,
          documents: [...applyDistillates(effectiveDocuments, distilledById), ...evidenceDocuments, ...lessonDocuments],
          comments: toLegacyComments(docComments),
          analysis: scoped,
          targetDocument: requested,
          siblingDocuments: siblings,
          currentDraft:
            targetStage === 'brons' || isStartDraft(previousDraft) ? undefined : stripCommentMarks(previousDraft),
          layout: measureLayout(),
        },
        {
          job: { projectId, draftId: doc.id, draftTitle: doc.title, kind: 'schrijven' },
          onStarted: (snapshot) => rememberJob(doc.id, snapshot, 'schrijven', targetStage),
          onProgress: (accumulated) =>
            updateEditorHtml(accumulated || '<p class="generation-placeholder">Concept wordt opgebouwd…</p>'),
          onStatus: (message) => setSyncStatus(message),
          signal: watchStopRef.current?.signal,
        },
      )
      updateEditorHtml(aiResult.html)
      persistDraft(doc.id, { html: aiResult.html, stage: targetStage, job: null })
      recordVersion(doc.id, {
        kind: 'generatie',
        label: `"${doc.title}" gegenereerd (${stageMeta[targetStage].label})`,
        stage: targetStage,
        html: aiResult.html,
        provider: aiResult.provider,
        model: aiResult.model,
      })
      setFindings(reviewDraft(aiResult.html, effectiveDocuments, scoped))
      setSyncStatus(
        isNeonConfigured()
          ? `"${doc.title}" gegenereerd met ${aiResult.provider} (${aiResult.model})`
          : `"${doc.title}" gegenereerd met ${aiResult.provider} (${aiResult.model}), opgeslagen in database`,
      )
    } catch (error) {
      // Verbinding weg: het schrijven loopt op de server door. De (deels geschreven) tekst
      // in de editor blijft staan; het resultaat komt binnen zodra de opdracht is opgepakt.
      if (handleFollowError(error, doc.title)) return
      const message = error instanceof Error ? error.message : 'Genereren mislukt.'
      if (isNoAiConfigError(message)) {
        setSyncStatus('Geen AI geconfigureerd — lokaal concept wordt gebouwd…')
        const nextDraft = buildHtmlDraft(
          targetStage,
          project,
          effectiveDocuments,
          toLegacyComments(docComments),
          scoped,
          requested,
        )
        await revealDraftProgressively(nextDraft, updateEditorHtml)
        persistDraft(doc.id, { html: nextDraft, stage: targetStage })
        recordVersion(doc.id, {
          kind: 'generatie',
          label: `"${doc.title}" lokaal opgebouwd (${stageMeta[targetStage].label})`,
          stage: targetStage,
          html: nextDraft,
        })
        setFindings(reviewDraft(nextDraft, effectiveDocuments, scoped))
        setSyncStatus(isNeonConfigured() ? 'Analyse, concept en Neon-sync gereed' : 'Analyse en concept opgeslagen')
        return
      }
      // Generatie mislukt om een andere reden: zet de vorige tekst terug i.p.v. een leeg vel.
      updateEditorHtml(previousDraft)
      reportError(
        `Genereren van "${doc.title}" mislukt — vorige tekst hersteld. ${message}`,
        () => void analyzeAndGenerate(targetStage, doc),
        'Opnieuw schrijven',
      )
    } finally {
      setGenerating(false)
    }
  }

  // Schrijf alle nog niet gestarte stukken achter elkaar (Brons), na (her)analyse van de
  // leidraad zodat de lijst met stukken actueel is.
  const generateMissingDocuments = async () => {
    if (generating || batchRunning) return
    setBatchRunning(true)
    try {
      let result: TenderAnalysis
      if (analysis && analysisSource === analysisFingerprintFor(effectiveDocuments, project.buyer)) {
        result = analysis
        applyAnalysisToDrafts(result)
      } else {
        setGenerating(true)
        try {
          result = await runAnalysis()
        } finally {
          setGenerating(false)
        }
      }
      const missing = draftsRef.current.filter((item) =>
        isStartDraft(item.id === activeDraftIdRef.current ? liveDraftHtml() : item.html),
      )
      if (!missing.length) {
        setSyncStatus('Alle stukken zijn al geschreven.')
        return
      }
      let written = 0
      for (const [index, item] of missing.entries()) {
        setBatchProgress({ done: index, total: missing.length, title: item.title })
        setSyncStatus(`Stuk ${index + 1}/${missing.length}: ${item.title}…`)
        await analyzeAndGenerate('brons', item, result)
        written += 1
        if (batchStopRef.current) break
      }
      const stopped = written < missing.length
      const summary = stopped
        ? `Gestopt na ${written} van ${missing.length} stukken. De overige zijn nog niet geschreven.`
        : `${written} stuk(ken) geschreven. Beoordeel elk stuk apart en verwerk opmerkingen per stuk.`
      setSyncStatus(summary)
      notifySuccess(summary)
    } finally {
      batchStopRef.current = false
      setBatchProgress(null)
      setBatchRunning(false)
    }
  }

  const addDocument = (doc: Omit<SourceDocument, 'id' | 'importedAt'>): SourceDocument => {
    const created: SourceDocument = {
      ...doc,
      id: makeId(),
      importedAt: new Date().toLocaleString('nl-NL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    }
    setDocuments((current) => [created, ...current])
    setSelectedSourceId(created.id)
    return created
  }

  const removeDocument = (id: string) => {
    // Tekstbron van een eigen upload: haal dan ook het bestand uit de documentenlijst,
    // anders lijkt het document nog mee te doen terwijl de tekst weg is.
    const linkedFileId = documents.find((doc) => doc.id === id)?.tenderDocumentId
    setDocuments((current) => current.filter((doc) => doc.id !== id))
    if (linkedFileId) {
      setTenderDocuments((current) => current.filter((doc) => doc.id !== linkedFileId))
    }
    setSelectedSourceId((current) => (current === id ? null : current))
  }

  // Aanbestedingsdocument uit dit project verwijderen: het bestand uit de lijst én de
  // ingelezen tekst uit de bronnen. Bij een eigen upload is dat de gekoppelde tekstbron;
  // bij een TenderNed-document de bijbehorende sectie in de gecombineerde aanbestedingsbron.
  const removeTenderDocument = (index: number) => {
    const target = tenderDocuments[index]
    if (!target) return
    setTenderDocuments((current) => current.filter((_, position) => position !== index))

    if (target.source === 'upload' && target.id) {
      const fileId = target.id
      const linkedSourceIds = documents.filter((doc) => doc.tenderDocumentId === fileId).map((doc) => doc.id)
      if (linkedSourceIds.length) {
        setDocuments((current) => current.filter((doc) => doc.tenderDocumentId !== fileId))
        setSelectedSourceId((current) => (current && linkedSourceIds.includes(current) ? null : current))
      }
      setProjectDocNotice({ tone: 'ok', message: `"${target.naam}" verwijderd uit dit project, inclusief de ingelezen tekst.` })
      return
    }

    let removedText = false
    const next = documents.flatMap((doc) => {
      if (doc.type !== 'tender' || doc.tenderDocumentId) return [doc]
      const stripped = removeTenderSection(doc.content, target.naam)
      if (stripped === null) return [doc]
      removedText = true
      // Lege bron opruimen; anders de tekst bijwerken en de analysecache laten vervallen.
      return stripped ? [{ ...doc, content: stripped, extract: null }] : []
    })
    if (removedText) {
      setDocuments(next)
      const remainingIds = new Set(next.map((doc) => doc.id))
      setSelectedSourceId((current) => (current && !remainingIds.has(current) ? null : current))
      setProjectDocNotice({ tone: 'ok', message: `"${target.naam}" verwijderd uit dit project; de tekst is uit de aanbestedingsbron gehaald.` })
    } else {
      setProjectDocNotice({
        tone: 'warning',
        message: `"${target.naam}" uit de lijst verwijderd. De ingelezen tekst was niet als losse sectie herkenbaar; controleer de aanbestedingsbron onder Bronnen.`,
      })
    }
  }

  // Eigen aanbestedingsdocumenten voor dít project: stukken die niet op TenderNed staan.
  // Elk bestand wordt ingelezen als aanbestedingsbron en (indien mogelijk) als origineel
  // gearchiveerd, precies zoals gedownloade TenderNed-documenten.
  const uploadProjectDocuments = async (files: FileList | null, noticeTarget: 'documents' | 'sources') => {
    if (!files?.length) return
    const setNotice = noticeTarget === 'documents' ? setProjectDocNotice : setUploadNotice
    setUploadingProjectDocs(true)
    setNotice(null)

    const imported = []
    for (const file of Array.from(files)) {
      imported.push(await importProjectDocument(projectId, file, { archive: archiveAvailable }))
    }
    const added = imported.map((item) => item.document)
    const sources = imported.flatMap((item) => (item.source ? [item.source] : []))

    setTenderDocuments((current) => [...added, ...current])
    if (sources.length) {
      setDocuments((current) => [...sources, ...current])
      setSelectedSourceId(sources[0].id)
      setActiveType('tender')
    }

    const unreadable = imported.filter((item) => !item.source)
    const warned = imported.filter((item) => item.source && item.document.note)
    if (unreadable.length) {
      const details = unreadable.map((item) => `${item.document.naam}: ${item.document.note ?? 'geen tekst'}`).join(' · ')
      setNotice({
        tone: sources.length ? 'warning' : 'error',
        message: sources.length
          ? `${sources.length} document(en) toegevoegd als aanbestedingsbron. Niet gelezen — ${details}`
          : `Niet gelezen — ${details}`,
      })
    } else {
      setNotice({
        tone: warned.length ? 'warning' : 'ok',
        message: warned.length
          ? `${sources.length} document(en) toegevoegd; ${warned.length} met weinig of ingekorte tekst — controleer de inhoud.`
          : `${sources.length} document(en) toegevoegd als aanbestedingsbron.`,
      })
    }

    setUploadingProjectDocs(false)
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files?.length) return
    // Op het tabblad Aanbesteding is een upload een projectdocument: zelfde route als de kaart
    // "Aanbestedingsdocumenten", zodat het bestand ook daar verschijnt en gearchiveerd wordt.
    if (activeType === 'tender') {
      setUploadingFiles(true)
      try {
        await uploadProjectDocuments(files, 'sources')
      } finally {
        setUploadingFiles(false)
      }
      return
    }
    setUploadingFiles(true)
    setUploadNotice(null)

    const added: SourceDocument[] = []
    const skipped: string[] = []

    for (const file of Array.from(files)) {
      try {
        const extracted = await readFileContent(file)
        const quality = assessSourceContent(extracted.text)
        if (quality.quality === 'error') {
          skipped.push(`${file.name}: ${quality.label.toLowerCase()}`)
          continue
        }
        added.push({
          id: makeId(),
          name: file.name,
          type: activeType,
          content: extracted.text,
          importedAt: new Date().toLocaleString('nl-NL', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }),
        })
      } catch (error) {
        skipped.push(`${file.name}: ${error instanceof Error ? error.message : 'kon niet worden gelezen'}`)
      }
    }

    if (added.length) {
      setDocuments((current) => [...added, ...current])
      setSelectedSourceId(added[0].id)
      const warnings = added.filter((doc) => assessSourceContent(doc.content).quality === 'warning').length
      setUploadNotice({
        tone: warnings ? 'warning' : 'ok',
        message:
          warnings > 0
            ? `${added.length} bron(nen) toegevoegd; ${warnings} met weinig tekst — controleer de inhoud.`
            : `${added.length} bron(nen) succesvol toegevoegd.`,
      })
    }

    if (skipped.length) {
      setUploadNotice({
        tone: added.length ? 'warning' : 'error',
        message: added.length
          ? `${added.length} bron(nen) toegevoegd. Niet gelezen — ${skipped.join(' · ')}`
          : `Niet gelezen — ${skipped.join(' · ')}`,
      })
    }

    setUploadingFiles(false)
  }

  // Koppel een (gedownloade) aanbesteding aan dít project: tekstbronnen toevoegen,
  // originele bestanden tonen en de nog lege projectvelden invullen.
  const attachTender = (tender: SavedTender) => {
    const sources = buildTenderSourceDocuments(tender)
    setDocuments((current) => {
      const existingNames = new Set(current.map((doc) => doc.name))
      const fresh = sources.filter((doc) => !existingNames.has(doc.name))
      return fresh.length ? [...fresh, ...current] : current
    })
    if (tender.documents?.length) {
      // Eigen uploads blijven staan; alleen de TenderNed-bestanden worden vervangen.
      const fromTender = tender.documents
      setTenderDocuments((current) => [...current.filter((doc) => doc.source === 'upload'), ...fromTender])
    }
    setProject((current) => {
      const closing = splitClosingDateTime(tender.sluitingsDatum)
      return {
        ...current,
        title: current.title && current.title !== 'Nieuw project' ? current.title : tender.aanbestedingNaam,
        buyer: current.buyer || tender.opdrachtgeverNaam,
        tendernedId: `TN-${tender.kenmerk}`,
        deadline: current.deadline || closing.deadline,
        deadlineTime: current.deadline ? current.deadlineTime : closing.deadlineTime,
      }
    })
    setActiveType('tender')
    setTendernedQuery(`TN-${tender.kenmerk}`)
    setTenderDialogOpen(false)
    setSyncStatus(`Aanbesteding gekoppeld aan dit project: ${tender.aanbestedingNaam}`)
  }

  // Haal een aanbesteding rechtstreeks op bij TenderNed (op publicatie-ID) of hergebruik
  // een eerder gedownloade aanbesteding (op TN-kenmerk), en koppel die aan dit project.
  const importTenderned = async () => {
    const query = tendernedQuery.trim()
    if (!query || importingTender) return
    const normalized = query.replace(/^TN-?/i, '')
    const saved = savedTenders.find(
      (tender) => tender.publicatieId === query || String(tender.kenmerk) === normalized,
    )
    if (saved) {
      attachTender(saved)
      return
    }
    if (!/^\d+$/.test(query)) {
      setSyncStatus(
        'Geen opgeslagen aanbesteding met dit kenmerk. Gebruik een TenderNed publicatie-ID (alleen cijfers) of zoek de aanbesteding in de catalogus.',
      )
      return
    }
    setImportingTender(true)
    setSyncStatus(`Aanbesteding ${query} ophalen bij TenderNed (alle documenten downloaden)…`)
    try {
      const detail = await fetchPublicationDetail(query)
      const downloaded = await downloadTenderToDatabase(detail)
      attachTender(downloaded)
    } catch (error) {
      reportError(
        error instanceof Error ? `Ophalen bij TenderNed mislukt: ${error.message}` : 'Ophalen bij TenderNed mislukt.',
        () => void importTenderned(),
      )
    } finally {
      setImportingTender(false)
    }
  }

  // Wissel alleen het stadium; de bestaande tekst blijft staan. (Re)genereren gebeurt
  // bewust via de knop "Genereer", niet door op een stadium te klikken.
  const selectStage = (targetStage: Stage) => {
    setStage(targetStage)
    setSyncStatus(
      isStartDraft(draft)
        ? `Stadium: ${stageMeta[targetStage].label}. Klik "Start schrijfagent" om het concept te laten schrijven.`
        : `Stadium: ${stageMeta[targetStage].label}. Klik "Genereer" om dit niveau te (her)schrijven.`,
    )
  }

  const applyAiRewrite = async () => {
    if (isStartDraft(draft)) {
      setSyncStatus('Start eerst de schrijfagent; opmerkingen verwerk je op een geschreven concept.')
      return
    }
    const openComments = comments.filter((comment) => comment.status === 'open')
    if (!openComments.length) {
      setSyncStatus('Geen open opmerkingen om te verwerken.')
      return
    }

    // Kostenbesparing: een klein aantal opmerkingen dat elk aan een terug te
    // vinden tekstdeel hangt, wordt per sectie herschreven (zelfde mechanisme
    // als de losse "verwerk"-actie) in plaats van het hele document opnieuw te
    // genereren. Alleen bij veel of algemene opmerkingen volgt de integrale pass.
    const targetable =
      openComments.length <= 3 &&
      openComments.every(
        (comment) =>
          comment.note.trim() &&
          comment.fragment.trim() &&
          comment.fragment !== GENERAL_COMMENT_FRAGMENT &&
          findSectionForFragment(comment.fragment),
      )
    if (targetable) {
      captureManualEdit()
      setGenerating(true)
      try {
        const result = analysis ?? (await runAnalysis())
        let done = 0
        for (const comment of openComments) {
          setSyncStatus(`Opmerking ${done + 1}/${openComments.length} gericht verwerken…`)
          if (await rewriteCommentSection(comment, result)) done += 1
        }
        if (done) {
          recordVersion(activeDraftIdRef.current, {
            kind: 'verwerking',
            label: `${done} opmerking(en) gericht verwerkt`,
            stage,
            html: liveDraftHtml(),
          })
        }
        setFindings(reviewDraft(liveDraftHtml(), effectiveDocuments, scopeFor(result)))
        setSyncStatus(
          done === openComments.length
            ? `${done} opmerking(en) gericht verwerkt — beoordeel per sectie: akkoord of terugdraaien`
            : `${done}/${openComments.length} opmerkingen gericht verwerkt; de overige staan nog open`,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Verwerken mislukt.'
        if (isNoAiConfigError(message)) {
          setSyncStatus('Geen AI geconfigureerd — stel de schrijfagent in via API-beheer om opmerkingen te verwerken.')
        } else {
          reportError(`Opmerkingen verwerken mislukt: ${message}`, () => void applyAiRewrite())
        }
      } finally {
        setGenerating(false)
      }
      return
    }

    captureManualEdit()
    setGenerating(true)
    setSyncStatus('Schrijfagent verwerkt opmerkingen…')
    const result = analysis ?? (await runAnalysis())
    const { requested, scoped, siblings } = briefFor(activeDraft, result)
    const lessonDocuments = await gatherLessonDocuments(result)
    const evidenceDocuments = await gatherEvidenceDocuments(result, requested)
    const distilledById = await gatherDistilledDocuments()

    try {
      const aiResult = await generateDraftViaApi(
        {
          stage: 'zilver',
          project,
          documents: [...applyDistillates(effectiveDocuments, distilledById), ...evidenceDocuments, ...lessonDocuments],
          comments: toLegacyComments(comments),
          analysis: scoped,
          targetDocument: requested,
          siblingDocuments: siblings,
          currentDraft: stripCommentMarks(draft),
          layout: measureLayout(),
        },
        {
          job: {
            projectId,
            draftId: activeDraftIdRef.current,
            draftTitle: activeDraft?.title ?? project.title,
            kind: 'opmerkingen',
          },
          onStarted: (snapshot) => rememberJob(activeDraftIdRef.current, snapshot, 'opmerkingen', 'zilver'),
          onProgress: (accumulated) => updateEditorHtml(accumulated || draft),
          onStatus: (message) => setSyncStatus(message),
          signal: watchStopRef.current?.signal,
        },
      )
      updateEditorHtml(aiResult.html)
      persistDraft(activeDraftIdRef.current, { html: aiResult.html, stage: 'zilver', job: null })
      recordVersion(activeDraftIdRef.current, {
        kind: 'verwerking',
        label: `${openComments.length} opmerking(en) verwerkt (Zilver)`,
        stage: 'zilver',
        html: aiResult.html,
        provider: aiResult.provider,
        model: aiResult.model,
      })
      setStage('zilver')
      setComments((current) => current.map((comment) => (comment.status === 'open' ? { ...comment, status: 'akkoord' } : comment)))
      setFindings(reviewDraft(aiResult.html, effectiveDocuments, scoped))
      setSyncStatus(`Opmerkingen verwerkt met ${aiResult.provider} (${aiResult.model})`)
    } catch (error) {
      // Verbinding weg: de opdracht loopt op de server door en wordt straks opgepakt.
      if (handleFollowError(error, activeDraft?.title ?? 'dit stuk')) return
      const message = error instanceof Error ? error.message : 'Verwerken mislukt.'
      if (isNoAiConfigError(message)) {
        const additions = openComments
          .map((comment) => `<p><strong>Review verwerkt:</strong> ${summarize(comment.note, 220)}</p>`)
          .join('')
        const reviewBlock = `<section><h2>AI-verwerking review</h2>${additions}</section>`
        const next = draft.replace('</article>', `${reviewBlock}</article>`)
        updateEditorHtml(next)
        recordVersion(activeDraftIdRef.current, {
          kind: 'verwerking',
          label: `${openComments.length} opmerking(en) lokaal verwerkt`,
          stage,
          html: next,
        })
        setComments((current) => current.map((comment) => (comment.status === 'open' ? { ...comment, status: 'akkoord' } : comment)))
        setFindings(reviewDraft(next, effectiveDocuments, scoped))
        setSyncStatus('Opmerkingen lokaal verwerkt (geen AI geconfigureerd)')
        return
      }
      reportError(`Opmerkingen verwerken mislukt: ${message}`, () => void applyAiRewrite())
    } finally {
      setGenerating(false)
    }
  }

  // Zoek het kleinste onderdeel (sectie of header) waarvan de tekst het fragment
  // bevat, zodat de gerichte herschrijving precies dat deel kan vervangen.
  const findSectionForFragment = (fragment: string): HTMLElement | null => {
    const editor = editorRef.current
    if (!editor) return null
    const needle = normalizeForMatch(fragment)
    if (!needle) return null
    const candidates = Array.from(
      editor.querySelectorAll<HTMLElement>('section.doc-section, header.doc-header'),
    )
    let best: HTMLElement | null = null
    for (const el of candidates) {
      if (normalizeForMatch(el.textContent ?? '').includes(needle)) {
        if (!best || (el.textContent?.length ?? 0) < (best.textContent?.length ?? 0)) {
          best = el
        }
      }
    }
    return best
  }

  // Kern van een gerichte sectie-herschrijving: vind de sectie, laat de AI die
  // herschrijven en vervang haar in de editor. Geeft de gebruikte provider/model
  // terug, of null als de sectie niet teruggevonden werd. Gedeeld door de losse
  // actie én de batchverwerking van "Verwerk opmerkingen".
  const rewriteCommentSection = async (
    comment: ReviewComment,
    result: TenderAnalysis | null,
  ): Promise<{ provider: string; model: string } | null> => {
    const target = findSectionForFragment(comment.fragment)
    if (!target) return null

    // Bewaar de oorspronkelijke sectie zodat de wijziging teruggedraaid kan worden.
    const previousSectionHtml = target.outerHTML

    const rewrite = await rewriteFragmentViaApi({
      stage,
      project,
      fragment: comment.fragment,
      note: comment.note,
      sectionHtml: stripCommentMarks(previousSectionHtml),
      documents: effectiveDocuments,
      analysis: scopeFor(result),
      targetDocument: activeDraft?.requested,
    })

    const template = document.createElement('template')
    template.innerHTML = rewrite.html.trim()
    const replacement = template.content.firstElementChild
    if (!replacement) throw new Error('Het herschreven onderdeel was leeg.')
    // Anker zodat we het herschreven onderdeel later kunnen terugdraaien of accorderen.
    replacement.setAttribute('data-rewrite-of', comment.id)
    target.replaceWith(replacement)

    const editor = editorRef.current
    if (editor) updateEditorHtml(editor.innerHTML)
    setComments((current) =>
      current.map((item) =>
        item.id === comment.id ? { ...item, status: 'verwerkt', previousSectionHtml } : item,
      ),
    )
    return { provider: rewrite.provider, model: rewrite.model }
  }

  // Verwerk één opmerking gericht: de AI herschrijft alleen het betreffende
  // onderdeel (zin/alinea, of de hele paragraaf/sectie als de opmerking dat vraagt).
  const applyTargetedRewrite = async (comment: ReviewComment) => {
    if (generating || rewritingId) return
    if (!comment.note.trim()) {
      setSyncStatus('Deze opmerking heeft geen instructie om te verwerken.')
      return
    }
    if (!comment.fragment.trim() || comment.fragment === GENERAL_COMMENT_FRAGMENT) {
      setSyncStatus('Deze opmerking is niet aan een tekstselectie gekoppeld — gebruik "Verwerk opmerkingen" voor het hele document.')
      return
    }

    captureManualEdit()
    setRewritingId(comment.id)
    setSyncStatus('Schrijfagent herschrijft het betreffende onderdeel…')

    try {
      const result = analysis ?? (await runAnalysis())
      const rewrite = await rewriteCommentSection(comment, result)
      if (!rewrite) {
        setSyncStatus('Kon het bijbehorende tekstdeel niet terugvinden. Selecteer het fragment opnieuw of gebruik "Verwerk opmerkingen".')
        return
      }
      recordVersion(activeDraftIdRef.current, {
        kind: 'verwerking',
        label: `Onderdeel herschreven na opmerking: ${summarize(comment.note, 60)}`,
        stage,
        html: liveDraftHtml(),
        provider: rewrite.provider,
        model: rewrite.model,
      })
      setFindings(reviewDraft(liveDraftHtml(), effectiveDocuments, scopeFor(result)))
      setSyncStatus(`Onderdeel herschreven met ${rewrite.provider} (${rewrite.model}) — beoordeel: akkoord of terugdraaien`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Herschrijven mislukt.'
      if (isNoAiConfigError(message)) {
        setSyncStatus('Geen AI geconfigureerd — stel de schrijfagent in via API-beheer om opmerkingen gericht te verwerken.')
      } else {
        reportError(`Herschrijven mislukt: ${message}`, () => void applyTargetedRewrite(comment))
      }
    } finally {
      setRewritingId(null)
    }
  }

  const syncDraftFromEditor = () => {
    const editor = editorRef.current
    if (editor) setDraft(editor.innerHTML)
  }

  // Toon bij een tekstselectie in de editor een zwevende "Opmerking"-knop bij de selectie
  // (Word-achtig). De selectie wordt bewaard zodat we de markering later kunnen plaatsen.
  const captureSelection = () => {
    const selection = window.getSelection()
    const text = selection?.toString() ?? ''
    const trimmed = text.trim()
    const editor = editorRef.current
    if (!selection || selection.rangeCount === 0 || !trimmed || !editor) {
      setCommentPopover(null)
      return
    }
    const range = selection.getRangeAt(0)
    if (!editor.contains(range.commonAncestorContainer)) {
      setCommentPopover(null)
      return
    }
    savedRangeRef.current = range.cloneRange()
    const rect = range.getBoundingClientRect()
    setCommentPopover({ top: rect.top, left: rect.left + rect.width / 2, fragment: trimmed })
    setPopoverNote('')
  }

  // Markeer de huidige status visueel op de markering in het document.
  const setMarkStatus = (commentId: string, status: CommentStatus) => {
    editorRef.current
      ?.querySelectorAll<HTMLElement>(`.comment-mark[data-comment-id="${commentId}"]`)
      .forEach((mark) => {
        mark.dataset.status = status
      })
  }

  const unwrapMarks = (commentId: string) => {
    editorRef.current
      ?.querySelectorAll<HTMLElement>(`.comment-mark[data-comment-id="${commentId}"]`)
      .forEach((mark) => {
        const parent = mark.parentNode
        if (!parent) return
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
        parent.removeChild(mark)
      })
  }

  // Plaats een opmerking via de zwevende knop: markeer de selectie en koppel de opmerking.
  const placeAnchoredComment = () => {
    const note = popoverNote.trim()
    const popover = commentPopover
    if (!note || !popover) return
    const id = makeId()
    const range = savedRangeRef.current
    if (range) {
      try {
        const span = document.createElement('span')
        span.className = 'comment-mark'
        span.dataset.commentId = id
        span.dataset.status = 'open'
        span.appendChild(range.extractContents())
        range.insertNode(span)
        const editor = editorRef.current
        if (editor) updateEditorHtml(editor.innerHTML)
      } catch {
        // Selectie kon niet worden gemarkeerd (bijv. over blokgrenzen) — opmerking blijft tekstgebaseerd.
      }
    }
    setComments((current) => [{ id, fragment: popover.fragment, note, status: 'open' }, ...current])
    setCommentPopover(null)
    setPopoverNote('')
    savedRangeRef.current = null
    window.getSelection()?.removeAllRanges()
  }

  // Algemene opmerking zonder tekstselectie (via de zijbalk).
  const addGeneralComment = () => {
    if (!commentText.trim()) return
    setComments((current) => [
      { id: makeId(), fragment: GENERAL_COMMENT_FRAGMENT, note: commentText.trim(), status: 'open' },
      ...current,
    ])
    setCommentText('')
  }

  // Spring naar de gemarkeerde tekst in het document en laat 'm even oplichten.
  const focusComment = (commentId: string) => {
    const mark = editorRef.current?.querySelector<HTMLElement>(`.comment-mark[data-comment-id="${commentId}"]`)
    if (!mark) return
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
    mark.classList.add('comment-mark-flash')
    window.setTimeout(() => mark.classList.remove('comment-mark-flash'), 1200)
  }

  // Scroll naar de bijbehorende opmerkingskaart in de rechterzijbalk en laat 'm oplichten.
  const scrollToCommentCard = (commentId: string) => {
    const card = commentsListRef.current?.querySelector<HTMLElement>(`[data-comment-card="${commentId}"]`)
    if (!card) return
    card.scrollIntoView({ behavior: 'smooth', block: 'center' })
    card.classList.add('comment-card-flash')
    window.setTimeout(() => card.classList.remove('comment-card-flash'), 1200)
  }

  // Klik op een markering in de tekst → scroll naar het comment in de zijbalk.
  const handleEditorClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const mark = (event.target as HTMLElement)?.closest?.('.comment-mark') as HTMLElement | null
    const commentId = mark?.dataset.commentId
    if (commentId) scrollToCommentCard(commentId)
  }

  // Akkoord met een verwerkte herschrijving: maak het anker/markering schoon en zet op 'akkoord'.
  const approveComment = (comment: ReviewComment) => {
    const editor = editorRef.current
    editor?.querySelector(`[data-rewrite-of="${comment.id}"]`)?.removeAttribute('data-rewrite-of')
    unwrapMarks(comment.id)
    if (editor) updateEditorHtml(editor.innerHTML)
    setComments((current) =>
      current.map((item) => (item.id === comment.id ? { ...item, status: 'akkoord', previousSectionHtml: undefined } : item)),
    )
    setSyncStatus('Wijziging akkoord bevonden.')
  }

  // Draai een verwerkte herschrijving terug naar de oorspronkelijke tekst.
  const revertComment = (comment: ReviewComment) => {
    const editor = editorRef.current
    const el = editor?.querySelector(`[data-rewrite-of="${comment.id}"]`)
    if (!el || !comment.previousSectionHtml) {
      setSyncStatus('Kon de herschrijving niet terugdraaien — het onderdeel is niet meer te vinden.')
      return
    }
    const template = document.createElement('template')
    template.innerHTML = comment.previousSectionHtml.trim()
    const original = template.content.firstElementChild
    if (!original) {
      setSyncStatus('Kon de oorspronkelijke tekst niet herstellen.')
      return
    }
    el.replaceWith(original)
    setMarkStatus(comment.id, 'open')
    if (editor) updateEditorHtml(editor.innerHTML)
    setComments((current) =>
      current.map((item) => (item.id === comment.id ? { ...item, status: 'open', previousSectionHtml: undefined } : item)),
    )
    setFindings(reviewDraft(editor?.innerHTML ?? draft, effectiveDocuments, scopedAnalysis))
    setSyncStatus('Herschrijving teruggedraaid.')
  }

  // Handmatig akkoord/heropenen zonder AI-herschrijving.
  const setCommentResolved = (comment: ReviewComment, resolved: boolean) => {
    const nextStatus: CommentStatus = resolved ? 'akkoord' : 'open'
    if (resolved) unwrapMarks(comment.id)
    else setMarkStatus(comment.id, 'open')
    const editor = editorRef.current
    if (editor) updateEditorHtml(editor.innerHTML)
    setComments((current) =>
      current.map((item) => (item.id === comment.id ? { ...item, status: nextStatus } : item)),
    )
  }

  // Wire de AI-reviewagent: heuristische baseline + AI-aanvulling.
  const runAiReview = async () => {
    if (reviewing) return
    setReviewing(true)
    setSyncStatus('AI-review wordt uitgevoerd…')
    const html = liveDraftHtml()
    try {
      const result = analysis ?? (await runAnalysis())
      const scoped = scopeFor(result)
      const baselineFindings = reviewDraft(html, effectiveDocuments, scoped)
      const baseline = baselineFindings.map(({ priority, title, detail }) => ({ priority, title, detail }))
      const distilledById = await gatherDistilledDocuments()
      // Eisen die het bidteam zelf moet afdekken en nog open staan: de reviewer vraagt ze gericht uit.
      const openUserRequirements = resolveRequirementStatuses(
        result.requirements ?? [],
        requirementStatuses,
        writtenDocumentIds,
      ).filter((req) => req.checkBy === 'gebruiker' && (req.status === 'open' || req.status === 'aandacht'))
      const currentDraftId = activeDraftIdRef.current
      const previousRound = draftsRef.current.find((item) => item.id === currentDraftId)?.round ?? null
      // Bewijscheck: welke harde claims staan er in het concept en zijn ze terug te voeren
      // op een bouwsteen of bron? Deterministisch, dus ook zonder AI-reviewagent.
      const evidenceForClaims = appliedEvidence.length ? appliedEvidence : evidenceLibrary.filter((block) => isCitable(block))
      const claimBaseline = checkClaims(html, {
        documents: effectiveDocuments.map((doc) => ({ name: doc.name, content: doc.content })),
        evidence: evidenceForClaims,
      })
      const ai = await reviewDraftViaApi({
        stage,
        project,
        draft: stripCommentMarks(html),
        documents: applyDistillates(effectiveDocuments, distilledById),
        comments: toLegacyComments(comments),
        analysis: scoped,
        targetDocument: activeDraft?.requested,
        baseline,
        openUserRequirements,
        round: roundToReviewContext(previousRound),
        evidence: evidenceForClaims,
        claimBaseline: claimBaseline.map(({ fragment, status, evidence, note }) => ({ fragment, status, evidence, note })),
      })
      // De reviewer mag een claim herbeoordelen, maar niet laten verdwijnen: wat de
      // heuristiek vond blijft staan tenzij de reviewer hem onderbouwd verklaart.
      const claims = mergeClaimChecks(claimBaseline, ai?.claimChecks ?? [])
      setClaimChecks(claims)
      const unproven = unprovenClaims(claims)
      const claimNote = unproven.length ? ` · ${unproven.length} claim(s) zonder bewijs` : ''
      if (editorRef.current) {
        markUnprovenClaims(editorRef.current, unproven)
        syncDraftFromEditor()
      }
      // Het oordeel van de reviewer per eis landt in het eisenregister (voldaan/aandacht).
      const checks = ai?.requirementChecks ?? []
      if (checks.length) {
        setRequirementStatuses((current) => applyRequirementChecks(current, checks, result.requirements ?? []))
      }
      // Verbeterronde: informatievragen en voorstellen van de reviewer (zonder AI: de open
      // eisen van het bidteam als vragen), samengevoegd met wat in de vorige ronde al is besloten.
      const hasRoundOutput = Boolean(ai?.informationRequests?.length || ai?.proposals?.length)
      const nextRound = hasRoundOutput
        ? mergeRound(previousRound, stage, ai!)
        : roundFromOpenRequirements(previousRound, stage, openUserRequirements)
      persistDraft(currentDraftId, { round: nextRound })
      const roundSummary = summarizeRound(nextRound)
      const roundNote = roundSummary.openQuestions || roundSummary.pendingProposals
        ? ` · verbeterronde: ${roundSummary.openQuestions} vragen, ${roundSummary.pendingProposals} voorstellen`
        : ''
      if (ai && ai.findings.length) {
        setFindings(ai.findings.map((finding) => ({ id: makeId(), ...finding })))
        setSyncStatus(
          ai.enriched
            ? `AI-review uitgevoerd met ${ai.provider} (${ai.model})${checks.length ? ` · ${checks.length} eisen getoetst` : ''}${claimNote}${roundNote}`
            : `Review uitgevoerd (heuristisch — AI gaf geen extra punten)${claimNote}${roundNote}`,
        )
      } else {
        setFindings(baselineFindings)
        setSyncStatus(`AI-review niet beschikbaar — heuristische review getoond${claimNote}${roundNote}`)
      }
    } catch {
      setFindings(reviewDraft(html, effectiveDocuments, scopedAnalysis))
      setSyncStatus('AI-review mislukt — heuristische review getoond')
      notifyWarning('AI-review mislukt — heuristische review getoond.', { retry: () => void runAiReview() })
    } finally {
      setReviewing(false)
    }
  }

  // Sluit de zwevende opmerking-popover bij een klik buiten de popover en editor.
  useEffect(() => {
    if (!commentPopover) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (popoverRef.current?.contains(target) || editorRef.current?.contains(target)) return
      setCommentPopover(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [commentPopover])

  // Markeringen en herschrijf-ankers zijn editor-only; verwijder ze uit de export.
  // Markeringen zijn editor-only en de bewijsverwijzingen zijn interne administratie:
  // beide horen niet in het bestand dat de opdrachtgever krijgt.
  const getExportHtml = () => stripEvidenceMarks(stripCommentMarks(liveDraftHtml()))

  const claimCheckSummary = useMemo(
    () => ({ unproven: unprovenClaims(claimChecks).length }),
    [claimChecks],
  )

  /** Haal de rode claimmarkeringen uit het concept (de bevindingen blijven in het paneel staan). */
  const clearClaimHighlights = () => {
    const editor = editorRef.current
    if (!editor) return
    clearClaimMarks(editor)
    updateEditorHtml(editor.innerHTML)
  }

  const deadlineLabel = useMemo(() => shortDeadlineLabel(project), [project])

  const exportPdf = async () => {
    syncDraftFromEditor()
    const html = getExportHtml()
    const filename = `${slugForFile(project.title)}-${slugForFile(activeDraft?.title ?? 'stuk')}-${stage}.pdf`
    setExportingPdf(true)
    setSyncStatus('PDF genereren…')
    try {
      await exportPdfFromHtml(html, filename)
      setSyncStatus('PDF gedownload.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PDF genereren mislukt.'
      reportError(`PDF genereren mislukt: ${message}`, () => void exportPdf())
    } finally {
      setExportingPdf(false)
    }
  }

  const exportWord = async () => {
    syncDraftFromEditor()
    const html = getExportHtml()
    const filename = `${slugForFile(project.title)}-${slugForFile(activeDraft?.title ?? 'stuk')}-${stage}.docx`
    setSyncStatus('Word genereren…')
    try {
      const { exportDocxDocument } = await import('../lib/docxExport')
      await exportDocxDocument(html, activeDraft ? `${project.title} — ${activeDraft.title}` : project.title, filename)
      setSyncStatus('Word-document gedownload.')
    } catch (error) {
      console.error('[word-export]', error)
      const message = error instanceof Error ? error.message : 'Word-export mislukt.'
      reportError(`Word-export mislukt: ${message}`, () => void exportWord())
    }
  }

  return (
    <main className="grid min-h-screen grid-cols-1 bg-background text-foreground xl:grid-cols-[340px_minmax(0,1fr)_350px]">
      <style>{proposalDocumentCss}</style>
      {commentPopover ? (
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            top: commentPopover.top,
            left: commentPopover.left,
            transform: 'translate(-50%, calc(-100% - 10px))',
            zIndex: 60,
          }}
          className="w-72 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <p className="mb-2 line-clamp-2 text-xs italic text-muted-foreground">“{commentPopover.fragment}”</p>
          <Textarea
            autoFocus
            value={popoverNote}
            onChange={(event) => setPopoverNote(event.target.value)}
            placeholder="Opmerking of wijzigingsinstructie..."
            className="min-h-[64px] text-sm"
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                placeAnchoredComment()
              }
            }}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCommentPopover(null)
                setPopoverNote('')
                savedRangeRef.current = null
              }}
            >
              Annuleren
            </Button>
            <Button size="sm" onClick={placeAnchoredComment} disabled={!popoverNote.trim()}>
              <MessageSquarePlus size={14} /> Plaatsen
            </Button>
          </div>
        </div>
      ) : null}
      <aside className="h-auto min-w-0 overflow-auto border-b bg-muted/30 p-4 sm:p-[18px] xl:h-screen xl:border-b-0 xl:border-r">
        <div className="mb-[18px] flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-[10px]">
            <div className="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
              <PenLine size={20} />
            </div>
            <div className="min-w-0 leading-tight">
              <strong className="block truncate">Bid Writer</strong>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {companies.find((company) => company.id === activeCompanyId)?.name ?? 'Besteed Het Uit'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs">
              <Link href="/" title="Terug naar het projectenoverzicht">
                <FolderOpen size={14} /> Alle projecten
              </Link>
            </Button>
            <ModeToggle />
          </div>
        </div>

        <div className="mb-4 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="company-switcher" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Building2 size={13} /> Actief bedrijf
            </Label>
            <Link
              href="/configuratie#bedrijven"
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              title="Bedrijven beheren of een nieuw bedrijf aanmaken"
            >
              <Plus size={12} /> Nieuw bedrijf
            </Link>
          </div>
          <Select value={activeCompanyId} onValueChange={(value) => void switchCompany(value)}>
            <SelectTrigger id="company-switcher" className="w-full bg-card">
              <SelectValue placeholder="Kies bedrijf…" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card className="mb-[14px] border-primary/30">
          <CardContent className="space-y-2.5">
            <div className="flex items-center gap-2 text-primary">
              <FileText size={17} />
              <h2 className="text-sm font-semibold">Aanbestedingsdocumenten</h2>
              <Badge variant="secondary" className="ml-auto">{tenderDocuments.length}</Badge>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              De stukken waarop de schrijfagent dit project baseert — van TenderNed en/of zelf geüpload.
            </p>

            <Dialog open={tenderDialogOpen} onOpenChange={setTenderDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="h-auto w-full justify-start gap-2.5 px-3 py-2.5 text-left"
                  title="Een gedownloade aanbesteding koppelen of rechtstreeks ophalen bij TenderNed"
                >
                  <Import size={16} className="shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    <span className="font-semibold">Van TenderNed</span>
                    <span className="font-normal text-muted-foreground"> — koppelen of ophalen</span>
                  </span>
                  <ChevronRight size={15} className="shrink-0 text-muted-foreground" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] gap-3 overflow-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-primary">
                    <Import size={18} /> Aanbesteding van TenderNed toevoegen
                  </DialogTitle>
                </DialogHeader>

            <Button asChild className="h-auto w-full justify-start whitespace-normal py-2.5 text-left leading-snug">
              <Link href="/aanbestedingen">
                <Search size={16} className="shrink-0" /> <span className="min-w-0">Zoek &amp; download aanbestedingen</span>
              </Link>
            </Button>

            <Separator />

            <div className="space-y-2">
              <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                Koppel een gedownloade aanbesteding
                <Badge variant="secondary">{savedTenders.length}</Badge>
              </p>
              {savedTenders.length ? (
                <>
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      value={dossierSearch}
                      onChange={(event) => setDossierSearch(event.target.value)}
                      placeholder="Zoek in je database…"
                    />
                  </div>
                  {filteredSavedTenders.length ? (
                    <ul className="flex max-h-64 list-none flex-col gap-1.5 overflow-y-auto overflow-x-hidden p-0">
                      {filteredSavedTenders.map((tender) => {
                        const isLinked = tender.publicatieId === activeTenderId
                        return (
                          <li key={tender.publicatieId} className="min-w-0">
                            <button
                              type="button"
                              onClick={() => attachTender(tender)}
                              title="Voeg de documenten van deze aanbesteding toe aan dit project"
                              className={cn(
                                'flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors',
                                isLinked
                                  ? 'border-primary bg-primary/5'
                                  : 'bg-card hover:border-primary/40 hover:bg-primary/5',
                              )}
                            >
                              <span
                                className={cn(
                                  'mt-0.5 grid size-6 flex-none place-items-center rounded-md',
                                  isLinked ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
                                )}
                              >
                                <FileText size={13} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold">{tender.aanbestedingNaam}</span>
                                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                  TN-{tender.kenmerk}
                                  {isLinked ? (
                                    <Badge variant="default" className="rounded-full px-1.5 py-0 text-[10px] font-normal">
                                      dit project
                                    </Badge>
                                  ) : null}
                                </span>
                              </span>
                              {!isLinked ? <ArrowRight size={14} className="mt-0.5 flex-none text-muted-foreground" /> : null}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Geen aanbesteding gevonden voor “{dossierSearch}”.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Nog niets opgeslagen. Open de catalogus om aanbestedingen te scannen en te
                  downloaden, of haal er hieronder één rechtstreeks op.
                </p>
              )}
            </div>

            <details className="mt-1">
              <summary className="cursor-pointer select-none py-1 text-xs font-semibold text-primary">
                Tender ophalen op publicatie-ID of kenmerk
              </summary>
              <div className="mt-2 flex gap-2">
                <Input
                  value={tendernedQuery}
                  onChange={(event) => setTendernedQuery(event.target.value)}
                  placeholder="publicatie-ID of TN-kenmerk"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void importTenderned()
                  }}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => void importTenderned()}
                  disabled={importingTender}
                  title="Haal de aanbesteding met alle documenten op en koppel die aan dit project"
                >
                  {importingTender ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                </Button>
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                Downloadt alle documenten van de publicatie en voegt ze toe aan dit project.
              </p>
            </details>
              </DialogContent>
            </Dialog>

            <FileUploadZone
              compact
              inputId="project-document-upload"
              accept={acceptedStyleExtensions}
              loading={uploadingProjectDocs}
              title="Eigen documenten uploaden"
              hint="Niet op TenderNed? Sleep of klik — PDF, Word, Excel, tekst"
              formatsLabel={
                archiveAvailable
                  ? 'PDF, Word, PowerPoint, Excel, txt, md, csv — PDF tot 50 MB, overig max. 4 MB. Het origineel wordt gearchiveerd.'
                  : 'PDF, Word, PowerPoint, Excel, txt, md, csv — PDF tot 50 MB, overig max. 4 MB. Alleen de tekst wordt bewaard (geen documentarchief geconfigureerd).'
              }
              onFiles={(files) => uploadProjectDocuments(files, 'documents')}
            />
            <NoticeBox notice={projectDocNotice} />

            {tenderDocuments.length ? (
              <>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Ingelezen als aanbestedingsbron: {tenderSourceStats.count} bron(nen),{' '}
                  {tenderSourceStats.words.toLocaleString('nl-NL')} woorden — terug te vinden onder Bronnen › Aanbesteding.
                </p>
                <ul className="flex max-h-72 list-none flex-col gap-0 overflow-y-auto overflow-x-hidden p-0">
                  {tenderDocuments.map((doc, index) => {
                    const uploaded = doc.source === 'upload'
                    const unreadable = doc.status === 'fout' || doc.status === 'leeg'
                    const title = doc.note ? `${doc.naam} — ${doc.note}` : doc.naam
                    return (
                      <li key={doc.id ?? `${doc.naam}-${index}`} className="flex min-w-0 flex-col gap-1 border-t py-2 first:border-t-0">
                        <div className="flex min-w-0 items-center gap-2 text-xs">
                          <span className="w-11 shrink-0 rounded bg-muted py-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            {doc.type}
                          </span>
                          {doc.fileUrl ? (
                            <a
                              className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-medium underline-offset-2 hover:text-primary hover:underline"
                              href={blobViewUrl(doc.fileUrl)}
                              target="_blank"
                              rel="noreferrer"
                              title={title}
                            >
                              {doc.naam}
                            </a>
                          ) : (
                            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-medium" title={title}>
                              {doc.naam}
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 shrink-0 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-destructive"
                            title="Document uit dit project verwijderen, inclusief de ingelezen tekst"
                            aria-label={`Verwijder ${doc.naam}`}
                            onClick={() => removeTenderDocument(index)}
                          >
                            <Trash2 size={12} /> Verwijder
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-[52px] text-[11px] text-muted-foreground">
                          <span className={cn('font-medium', uploaded ? 'text-primary' : 'text-foreground/80')}>
                            {uploaded ? 'Eigen upload' : 'TenderNed'}
                          </span>
                          <span aria-hidden>·</span>
                          <span className="tabular-nums">{formatBytes(doc.grootte)}</span>
                          {doc.chars ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="tabular-nums">{doc.chars.toLocaleString('nl-NL')} tekens ingelezen</span>
                            </>
                          ) : null}
                          {unreadable ? (
                            <span className="font-semibold text-destructive" title={doc.note}>
                              {doc.status === 'leeg' ? 'geen tekst' : 'niet gelezen'}
                            </span>
                          ) : null}
                          <span aria-hidden>·</span>
                          {doc.fileUrl ? (
                            <a
                              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                              href={blobViewUrl(doc.fileUrl)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink size={11} /> Openen
                            </a>
                          ) : (
                            <span
                              title={
                                uploaded
                                  ? 'Origineel niet gearchiveerd — alleen de tekst is bewaard (Vercel Blob niet geconfigureerd).'
                                  : 'Origineel niet gearchiveerd — download de aanbesteding opnieuw in de catalogus (vereist Vercel Blob-configuratie).'
                              }
                            >
                              geen origineel
                            </span>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Nog geen documenten bij dit project. Koppel een aanbesteding van TenderNed of upload eigen bestanden
                hierboven.
              </p>
            )}
            {tenderDocuments.some((doc) => doc.source !== 'upload') &&
            tenderDocuments.filter((doc) => doc.source !== 'upload').every((doc) => !doc.fileUrl) ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-[10px] py-2 text-xs leading-snug text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                De originele TenderNed-bestanden zijn nog niet gearchiveerd. Download deze aanbesteding opnieuw
                in de catalogus nadat Vercel Blob is geconfigureerd.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="mb-[14px]">
          <CardContent className="space-y-[10px]">
            <div className="flex items-center gap-2 text-primary">
              <FileText size={17} />
              <h2 className="text-sm font-semibold">Dossier</h2>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-title">Titel</Label>
              <Input
                id="project-title"
                value={project.title}
                onChange={(event) => setProject({ ...project, title: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-buyer">Opdrachtgever</Label>
              <Input
                id="project-buyer"
                value={project.buyer}
                onChange={(event) => setProject({ ...project, buyer: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-deadline">Deadline</Label>
              <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-1.5">
                <Input
                  id="project-deadline"
                  type="date"
                  value={project.deadline}
                  onChange={(event) => setProject({ ...project, deadline: event.target.value })}
                />
                <Input
                  id="project-deadline-time"
                  type="time"
                  aria-label="Sluitingstijd"
                  title="Sluitingstijd (lokale tijd)"
                  value={project.deadlineTime ?? ''}
                  onChange={(event) => setProject({ ...project, deadlineTime: event.target.value || undefined })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <BuyerProfileCard
          buyer={project.buyer}
          cpvCodes={(savedTenders.find((tender) => tender.publicatieId === activeTenderId)?.cpvCodes ?? []).map(
            (cpv) => cpv.code,
          )}
          lessons={lessonsLibrary}
        />

        <nav className="mb-4 grid grid-cols-2 gap-1.5" aria-label="Onderdelen">
          {[
            { href: '/configuratie', label: 'Bedrijfsconfiguratie', Icon: Building2, count: 0 },
            { href: '/schrijfregels', label: 'Schrijfkader', Icon: ClipboardList, count: 0 },
            { href: '/bewijs', label: 'Bewijsbibliotheek', Icon: Library, count: evidenceLibrary.length },
            { href: '/leerpunten', label: 'Lessons learned', Icon: GraduationCap, count: lessonsLibrary.length },
            { href: '/vergelijken', label: 'Projecten vergelijken', Icon: GitCompareArrows, count: 0 },
            { href: '/handleiding', label: 'Handleiding', Icon: BookOpen, count: 0 },
            { href: '/admin', label: 'API-beheer', Icon: ShieldCheck, count: 0 },
          ].map(({ href, label, Icon, count }) => (
            <Link
              key={href}
              href={href}
              title={label}
              className="group flex min-w-0 items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-xs font-semibold shadow-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <span className="grid size-6 flex-none place-items-center rounded-md bg-primary/10 text-primary">
                <Icon size={13} />
              </span>
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {count ? <Badge variant="secondary" className="flex-none px-1.5 py-0 text-[10px]">{count}</Badge> : null}
            </Link>
          ))}
        </nav>

        {/* Laatste actie (logboek) en de systeemstatus staan los van elkaar: de ene wisselt
            per handeling, de andere zegt of de agent überhaupt goed staat ingesteld. */}
        <p
          className="mt-[10px] text-xs leading-snug text-muted-foreground"
          data-testid="sync-status"
          role="status"
          aria-live="polite"
        >
          {syncStatus}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5" data-testid="system-status">
          {[
            {
              href: '/admin',
              label: 'Schrijfagent',
              active: writerActive,
              value: writerActive
                ? serverWriter.available && !isWriterConfigured()
                  ? 'server'
                  : 'actief'
                : 'niet actief',
              hint: writerActive ? 'Schrijfagent staat ingesteld' : 'Stel de schrijfagent in via API-beheer',
            },
            {
              href: '/configuratie',
              label: 'Bedrijfsprofiel',
              active: companyConfigActive,
              value: companyConfigActive ? 'actief' : 'niet ingesteld',
              hint: companyConfigActive
                ? 'Het centrale bedrijfsprofiel wordt meegegeven aan de schrijfagent'
                : 'Zonder bedrijfsprofiel schrijft de agent zonder bedrijfsfeiten',
            },
            {
              href: '/schrijfregels',
              label: 'Schrijfkader',
              active: schrijfkaderActive,
              value: schrijfkaderActive ? 'eigen kader' : 'basis',
              hint: schrijfkaderActive
                ? 'Eigen aanpassingen op het schrijfkader zijn actief'
                : 'Het ingebouwde basiskader wordt gebruikt',
            },
          ].map(({ href, label, active, value, hint }) => (
            <Link
              key={label}
              href={href}
              title={hint}
              data-active={active}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors',
                active
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
              )}
            >
              <span
                className={cn('size-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-amber-500')}
                aria-hidden
              />
              {label}
              <span className="font-normal opacity-80">{value}</span>
            </Link>
          ))}
        </div>

        <Card className="mt-[14px] mb-[14px]">
          <CardContent className="space-y-[10px]">
            <div className="flex items-center gap-2 text-primary">
              <Upload size={17} />
              <h2 className="text-sm font-semibold">Bronnen ({documents.length})</h2>
            </div>
            <div className="grid grid-cols-2 gap-1.5 rounded-md border bg-muted p-1">
              {(Object.keys(sourceLabels) as SourceType[]).map((type) => (
                <button
                  key={type}
                  className={cn(
                    'min-h-8 truncate rounded-sm px-2 text-xs font-medium transition-colors',
                    activeType === type
                      ? 'bg-background text-primary shadow-sm'
                      : 'text-muted-foreground hover:bg-background/60',
                  )}
                  onClick={() => setActiveType(type)}
                >
                  {sourceLabels[type]}
                </button>
              ))}
            </div>
            <FileUploadZone
              accept={acceptedStyleExtensions}
              loading={uploadingFiles}
              title="Sleep bestanden hierheen of klik om te uploaden"
              hint={`Wordt toegevoegd als ${sourceLabels[activeType].toLowerCase()}-bron`}
              formatsLabel="PDF, Word (ook .doc), PowerPoint, Excel, txt, md, csv — PDF tot 50 MB, overig max. 4 MB"
              onFiles={handleFileUpload}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Of plak tekst handmatig hieronder. Vaste schrijfregels, schrijfwijze en kwaliteit beheer je in het{' '}
              <Link href="/schrijfregels" className="font-medium text-primary underline-offset-2 hover:underline">
                Schrijfkader
              </Link>
              .
            </p>
            <NoticeBox notice={uploadNotice} />
            <Input placeholder="Naam bron" value={manualName} onChange={(event) => setManualName(event.target.value)} />
            <Textarea
              className="min-h-[118px]"
              placeholder="Plak broninformatie, rules of training..."
              value={manualText}
              onChange={(event) => setManualText(event.target.value)}
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                if (!manualText.trim()) return
                const created = addDocument({
                  name: manualName || `${sourceLabels[activeType]} handmatig`,
                  type: activeType,
                  content: manualText,
                })
                const quality = assessSourceContent(created.content)
                setUploadNotice({
                  tone: quality.quality === 'ok' ? 'ok' : quality.quality === 'warning' ? 'warning' : 'error',
                  message: `"${created.name}" toegevoegd — ${quality.label.toLowerCase()} (${quality.words} woorden).`,
                })
                setManualText('')
                setManualName('')
              }}
            >
              <ClipboardCheck size={16} /> Toevoegen
            </Button>

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowAllSources((current) => !current)}>
                {showAllSources ? 'Filter op tab' : 'Toon alle bronnen'}
              </Button>
            </div>

            <div className="grid max-h-80 gap-[10px] overflow-auto">
              {visibleSources.length ? (
                visibleSources.map((doc) => {
                  const quality = assessSourceContent(doc.content)
                  const StatusIcon =
                    quality.quality === 'ok' ? CheckCircle2 : quality.quality === 'warning' ? AlertTriangle : XCircle
                  const statusColor =
                    quality.quality === 'ok'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : quality.quality === 'warning'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-red-600 dark:text-red-400'
                  return (
                    <article
                      key={doc.id}
                      className={cn(
                        'rounded-lg border bg-card p-[10px]',
                        selectedSourceId === doc.id && 'border-primary ring-1 ring-primary/15',
                      )}
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <Badge variant="secondary" className="shrink-0">{sourceLabels[doc.type]}</Badge>
                        <span className={cn('inline-flex shrink-0 items-center gap-1 text-xs font-semibold', statusColor)}>
                          <StatusIcon size={14} /> {quality.label}
                        </span>
                      </div>
                      <strong className="block break-words text-sm">{doc.name}</strong>
                      <p className="my-1 break-words text-xs text-muted-foreground">
                        {quality.words.toLocaleString('nl-NL')} woorden · {quality.chars.toLocaleString('nl-NL')} tekens · {doc.importedAt}
                      </p>
                      <p className="break-words text-xs text-muted-foreground">{summarize(doc.content, 140)}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => setSelectedSourceId(doc.id)}>
                          <Eye size={14} /> Bekijken
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive" onClick={() => removeDocument(doc.id)}>
                          <Trash2 size={14} /> Verwijder
                        </Button>
                      </div>
                    </article>
                  )
                })
              ) : (
                <p className="text-xs text-muted-foreground">Nog geen bronnen in deze categorie. Upload of plak tekst hierboven.</p>
              )}
            </div>

            {selectedSource ? (
              <div className="rounded-lg border bg-card p-[10px]">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="min-w-0 break-words text-sm font-semibold">{selectedSource.name}</h3>
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => setSelectedSourceId(null)}>
                    Sluiten
                  </Button>
                </div>
                <p className="my-1 text-xs text-muted-foreground">
                  {sourceLabels[selectedSource.type]} · {assessSourceContent(selectedSource.content).words.toLocaleString('nl-NL')} woorden
                </p>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted p-[10px] text-xs leading-relaxed font-sans">
                  {selectedSource.content}
                </pre>
              </div>
            ) : null}
          </CardContent>
        </Card>

      </aside>

      <section className="h-auto min-w-0 overflow-auto p-4 sm:p-6 xl:h-screen">
        {/* Het maandplafond blokkeert niet; de melding hoort daarom te staan waar de
            kosten ontstaan, niet alleen op de verbruikspagina. */}
        <BudgetWarning />
        <header className="mb-[14px] flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-[5px] text-xs font-bold uppercase text-muted-foreground">Besteed Het Uit · AI-Schrijfagent</p>
            <h1 className="break-words text-[25px] leading-tight font-bold">{project.title}</h1>
            <SaveStatusIndicator className="mt-1" />
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button asChild variant="outline" title="Indieningsscherm: alle stukken, bijlagen en eisen met status en bestand, plus de countdown naar de deadline">
              <Link href={`/projecten/${encodeURIComponent(projectId)}/indiening`}>
                <PackageCheck size={17} /> Indiening
                {deadlineLabel ? (
                  <span className={cn('text-xs font-normal', deadlineLabel === 'verstreken' ? 'text-destructive' : 'text-muted-foreground')}>
                    · {deadlineLabel}
                  </span>
                ) : null}
              </Link>
            </Button>
            <Button variant="outline" onClick={exportPdf} disabled={exportingPdf}>
              <FileDown size={17} /> {exportingPdf ? 'PDF...' : 'PDF'}
            </Button>
            <Button variant="outline" onClick={() => void exportWord()}>
              <FileDown size={17} /> Word
            </Button>
            <EvaluationDialog
              project={project}
              draft={draft}
              analysis={analysis}
              sourceTenderId={activeTenderId || project.tendernedId || null}
              onSaved={loadLessons}
            />
            <Button
              variant="outline"
              onClick={() => {
                // De tekst die nu in de editor staat eerst vastleggen, zodat de lijst klopt.
                captureManualEdit()
                setVersionDialogOpen(true)
              }}
              title="Alle generaties, verwerkingen en eigen bewerkingsrondes van dit stuk"
            >
              <History size={17} /> Versies
              {activeVersions.length ? <Badge variant="secondary">{activeVersions.length}</Badge> : null}
            </Button>
            <Button disabled={generating} onClick={() => void analyzeAndGenerate(stage)}>
              {generating ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
              {generating ? 'Genereren…' : notStarted ? 'Start schrijfagent' : 'Genereer'}
            </Button>
          </div>
        </header>

        <section className="mb-[14px] rounded-md border bg-card p-3" aria-label="Stukken van deze inschrijving">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Files size={17} /> Stukken van deze inschrijving
              <Badge variant="secondary">{drafts.length}</Badge>
            </h2>
            <div className="flex flex-wrap gap-2">
              {drafts.filter((item) => isStartDraft(item.id === activeDraftId ? draft : item.html)).length > 1 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void generateMissingDocuments()}
                  disabled={generating || batchRunning}
                  title="Schrijft alle nog niet gestarte stukken achter elkaar (Brons)"
                >
                  {batchRunning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Schrijf alle ontbrekende stukken
                </Button>
              ) : null}
              <Dialog open={customDocOpen} onOpenChange={setCustomDocOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="ghost" disabled={generating} title="Voeg een extra te schrijven stuk toe">
                    <FilePlus2 size={14} /> Eigen stuk
                  </Button>
                </DialogTrigger>
                <DialogContent className="gap-3 sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-primary">
                      <FilePlus2 size={18} /> Eigen stuk toevoegen
                    </DialogTitle>
                  </DialogHeader>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Voor een stuk dat de analyse niet (goed) heeft herkend. De schrijfagent schrijft het in dezelfde
                    opbouw en stijl als de andere stukken, gericht op de vraag die je hier opgeeft.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="custom-doc-title">Titel van het stuk</Label>
                    <Input
                      id="custom-doc-title"
                      value={customDocTitle}
                      onChange={(event) => setCustomDocTitle(event.target.value)}
                      placeholder="bv. Kwaliteit — Subcriterium 2: Implementatie"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="custom-doc-question">Vraag/opdracht uit de leidraad</Label>
                    <Textarea
                      id="custom-doc-question"
                      value={customDocQuestion}
                      onChange={(event) => setCustomDocQuestion(event.target.value)}
                      placeholder="Plak de letterlijke vraag of opdracht waar dit stuk antwoord op geeft…"
                      className="min-h-[96px]"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setCustomDocOpen(false)}>
                      Annuleren
                    </Button>
                    <Button onClick={addCustomDraft} disabled={!customDocTitle.trim()}>
                      <Plus size={14} /> Toevoegen
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Uit de leidraadanalyse: elk schrijfstuk wordt apart geschreven — zelfde opbouw en stem, inhoud gericht op
            de vraag van dat stuk. Klik op een stuk om het te openen; stadium, opmerkingen en export gelden per stuk.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {drafts.map((item) => {
              const active = item.id === activeDraftId
              const html = active ? draft : item.html
              const status = isStartDraft(html) ? 'niet gestart' : draftStatusLabel({ ...item, html })
              const itemStage = active ? stage : item.stage
              const started = !isStartDraft(html)
              const words = started ? countWords(html) : 0
              const limits = formatDocumentLimits(item.requested)
              // Elk stuk aan zijn eigen limieten toetsen: een te lang stuk valt op vorm af,
              // ook als de rest van de inschrijving klopt.
              const itemChecks = started
                ? checkVolume(
                    { words, chars: countCharacters(html), pages: active ? pageCount : otherDraftPages.get(item.id) },
                    documentLimits(item.requested, analysis),
                  )
                : []
              const itemLevel = volumeLevel(itemChecks)
              const itemOver = overLimitSummary(itemChecks)
              const wordCheck = itemChecks.find((check) => check.unit === 'woorden')
              const pageCheck = itemChecks.find((check) => check.unit === 'paginas')
              return (
                <div
                  key={item.id}
                  className={cn(
                    'group relative flex min-w-0 flex-col gap-1 rounded-lg border bg-background p-2.5 text-left transition-colors',
                    active ? 'border-primary ring-1 ring-primary/30' : 'hover:border-primary/40',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => switchDraft(item.id)}
                    disabled={generating}
                    className="min-w-0 text-left"
                    aria-pressed={active}
                    title={item.requested.question || item.title}
                  >
                    <span className="flex items-start gap-2">
                      <span
                        className={cn(
                          'mt-0.5 grid size-6 flex-none place-items-center rounded-md',
                          active ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
                        )}
                      >
                        <FileText size={13} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{item.title}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
                          {item.job ? (
                            <span
                              data-testid="draft-job-badge"
                              className="flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0 font-bold uppercase tracking-wide text-primary"
                              title="De schrijfagent werkt op de server aan dit stuk; sluiten van het tabblad stopt dat niet."
                            >
                              <Loader2 size={10} className="animate-spin" /> schrijft
                            </span>
                          ) : null}
                          <span
                            className={cn(
                              'rounded-full px-1.5 py-0 font-bold uppercase tracking-wide',
                              status === 'niet gestart'
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
                            )}
                          >
                            {status === 'niet gestart' ? 'niet gestart' : stageMeta[itemStage].label}
                          </span>
                          {started ? (
                            <span
                              className={cn(
                                'tabular-nums',
                                itemLevel === 'over' && 'font-bold text-red-600 dark:text-red-400',
                                itemLevel === 'krap' && 'font-semibold text-amber-700 dark:text-amber-400',
                              )}
                              title={itemOver ? `Over de limiet: ${itemOver}` : undefined}
                            >
                              {words.toLocaleString('nl-NL')}
                              {wordCheck ? `/${wordCheck.max.toLocaleString('nl-NL')}` : ''} w
                              {pageCheck ? ` · ${printedPages(pageCheck.used)}/${pageCheck.max} p` : ''}
                            </span>
                          ) : limits ? (
                            <span>{limits}</span>
                          ) : null}
                          {item.source === 'eigen' ? <span>· eigen stuk</span> : null}
                        </span>
                      </span>
                    </span>
                  </button>
                  {drafts.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1 h-6 px-1.5 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                      title={`"${item.title}" uit dit project verwijderen`}
                      aria-label={`Verwijder stuk ${item.title}`}
                      onClick={() => removeDraft(item.id)}
                      disabled={generating}
                    >
                      <Trash2 size={12} />
                    </Button>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>

        <nav className="my-3 grid grid-cols-2 gap-[10px] sm:grid-cols-3" aria-label="Schrijfstadia">
          {(['brons', 'zilver', 'goud'] as Stage[]).map((item) => {
            const meta = stageMeta[item]
            const Icon = meta.Icon
            const active = stage === item
            return (
              <button
                key={item}
                type="button"
                className={cn(
                  'flex items-center gap-3 rounded-xl border bg-card p-[11px] text-left transition-all hover:-translate-y-px hover:shadow-md',
                  active && 'border-primary bg-accent ring-1 ring-primary/30',
                )}
                onClick={() => selectStage(item)}
                aria-pressed={active}
              >
                <span
                  className={cn(
                    'inline-flex size-[38px] flex-shrink-0 items-center justify-center rounded-full',
                    active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                  )}
                  aria-hidden="true"
                >
                  <Icon size={18} strokeWidth={2.2} />
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <strong className="text-sm font-bold leading-tight">{meta.label}</strong>
                  <span className="text-xs leading-tight text-muted-foreground">{meta.hint}</span>
                </span>
              </button>
            )
          })}
        </nav>

        {activeDraft?.round && !notStarted ? (
          <ImprovementRoundPanel
            round={activeDraft.round}
            currentStage={stage}
            busy={generating || reviewing}
            onChange={updateRound}
            onApply={() => void applyImprovements()}
            onReview={() => void runAiReview()}
          />
        ) : null}

        {appliedEvidence.length ? (
          <div className="mb-[14px] rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              <Library size={14} /> Bewijs waaruit dit stuk mag citeren ({appliedEvidence.length})
            </p>
            <ul className="grid gap-1 text-sm text-emerald-900 dark:text-emerald-100" data-testid="applied-evidence">
              {appliedEvidence.map((block) => {
                const value = evidenceValueLabel(block)
                return (
                  <li key={block.id} className="flex gap-1.5">
                    <Check size={15} className="mt-0.5 flex-none text-emerald-600" />
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-emerald-700 dark:text-emerald-300">
                        {evidenceHandle(block.id)}
                      </span>{' '}
                      <strong>{evidenceKindLabels[block.kind]}:</strong> {value ? `${value} — ` : ''}
                      {block.title}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        {appliedLessons.length ? (
          <div className="mb-[14px] rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              <GraduationCap size={14} /> Toegepaste leerpunten ({appliedLessons.length})
            </p>
            <ul className="grid gap-1 text-sm text-amber-900 dark:text-amber-100">
              {appliedLessons.map((lesson) => (
                <li key={lesson.id} className="flex gap-1.5">
                  <Check size={15} className="mt-0.5 flex-none text-amber-600" />
                  <span className="min-w-0">
                    {lesson.category ? <strong>{lesson.category}: </strong> : null}
                    {lesson.lesson}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className="mb-[14px] grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => setShowScoreDetails((v) => !v)}
            aria-expanded={showScoreDetails}
            className="min-w-0 rounded-md border border-blue-200 bg-blue-50 p-3 text-left transition hover:border-blue-300 hover:bg-blue-100/60 dark:border-blue-900/50 dark:bg-blue-950/40 dark:hover:bg-blue-900/40"
          >
            <span className="flex items-baseline gap-2">
              <span className="block text-[22px] font-extrabold text-blue-700 dark:text-blue-300">{stats.score}%</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-600/80 dark:text-blue-300/80">
                {opportunityLevelLabel[opportunity.level]}
              </span>
            </span>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              Kansscore
              <ChevronRight
                size={13}
                className={cn('transition-transform', showScoreDetails && 'rotate-90')}
              />
            </p>
            <Progress value={stats.score} className="mt-2" />
          </button>
          {volumeTiles.map((tile) => (
            <VolumeTile key={tile.unit} {...tile} />
          ))}
          <div className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/40">
            <span className="block text-[22px] font-extrabold text-emerald-700 dark:text-emerald-300">{stats.leidraad ? 'Ja' : 'Nee'}</span>
            <p className="mt-1 text-xs text-muted-foreground">Leidraad</p>
          </div>
          <div className="min-w-0 rounded-md border border-violet-200 bg-violet-50 p-3 dark:border-violet-900/50 dark:bg-violet-950/40">
            <span className="block text-[22px] font-extrabold text-violet-700 dark:text-violet-300">{stats.sources}</span>
            <p className="mt-1 text-xs text-muted-foreground">Bronnen</p>
          </div>
        </section>

        {showScoreDetails ? (
          <section className="mb-[14px] rounded-md border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold">
                Kansscore-opbouw — {stats.score}% ({opportunityLevelLabel[opportunity.level]})
              </h3>
              <span className="text-xs text-muted-foreground">
                Match profiel × uitvraag, referenties, harde eisen en concurrentie
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {opportunity.factors.map((factor) => (
                <div key={factor.key} className="rounded-md border bg-muted/40 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{factor.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {factor.score}% · weegt {Math.round(factor.weight * 100)}%
                    </span>
                  </div>
                  <Progress value={factor.score} className="mt-2" />
                  <p className="mt-2 text-xs font-medium text-foreground">{factor.summary}</p>
                  {factor.signals.length ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {factor.signals.map((signal, i) => (
                        <li key={i}>{signal}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
            {opportunity.caveats.length ? (
              <ul className="mt-3 space-y-1 text-xs text-amber-700 dark:text-amber-400">
                {opportunity.caveats.map((caveat, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    {caveat}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        <div className="mb-[14px] flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <ScanSearch size={16} /> Leidraadanalyse
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] gap-3 overflow-auto sm:max-w-xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-primary">
                  <ScanSearch size={18} /> Leidraadanalyse
                </DialogTitle>
              </DialogHeader>
              <Button variant="outline" className="w-full" onClick={() => void runAnalysis()}>
                <Search size={16} /> Analyseer dossier
              </Button>
              {analysis ? (
                <div className="space-y-3">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {analysis.aiAnalyzed ? (
                      <Badge className="mr-1 align-middle">AI-analyse{analysis.analysisModel ? ` · ${analysis.analysisModel}` : ''}</Badge>
                    ) : (
                      <Badge variant="secondary" className="mr-1 align-middle">Heuristisch</Badge>
                    )}{' '}
                    {analysis.summary}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{analysis.contentRequirements.length} vragen/onderwerpen</Badge>
                    <Badge variant="secondary">{analysis.documentRequirements.length} documenten</Badge>
                    <Badge variant="secondary">{analysis.submissionRequirements.length} inschrijvingseisen</Badge>
                    <Badge variant="secondary">{analysis.wordLimits.length} limieten</Badge>
                    <Badge variant="secondary">{analysis.requirements?.length ?? 0} eisen in het register</Badge>
                    <Badge>{writableDocuments(analysis).length} op te stellen stukken</Badge>
                  </div>
                  <div className="space-y-2 rounded-md border bg-accent/40 p-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
                      <Files size={15} /> Op te stellen documenten
                    </h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      De stukken die de inschrijver zelf moet schrijven, elk met de vraag uit de leidraad waarop het stuk
                      antwoord geeft. De schrijfagent schrijft ze apart, in dezelfde opbouw en stijl.
                    </p>
                    {!analysis.requestedDocuments.some((doc) => doc.kind === 'schrijfstuk') ? (
                      <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                        Geen losse schrijfstukken herkend — de schrijfagent schrijft één inschrijfstuk met alle
                        inhoudseisen. Voeg zo nodig een eigen stuk toe in de middenkolom.
                      </p>
                    ) : null}
                    <ul className="grid gap-2">
                      {writableDocuments(analysis).map((doc) => {
                        const limits = formatDocumentLimits(doc)
                        return (
                          <li key={doc.id} className="rounded-md border bg-card p-2.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <strong className="min-w-0 break-words text-sm">{doc.title}</strong>
                              <Badge variant="outline" className="text-[10px] uppercase">{requestedDocumentKindLabels[doc.kind]}</Badge>
                              {doc.mandatory ? <span className="text-[11px] font-semibold text-destructive">verplicht</span> : null}
                            </div>
                            {doc.question ? (
                              <p className="mt-1 break-words text-xs leading-relaxed text-foreground">
                                <strong>Vraag:</strong> {doc.question}
                              </p>
                            ) : null}
                            {doc.criteria.length ? (
                              <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                                <strong>Beoordeeld op:</strong> {doc.criteria.join('; ')}
                              </p>
                            ) : null}
                            {doc.topics.length ? (
                              <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                                <strong>Onderwerpen:</strong> {doc.topics.join(' · ')}
                              </p>
                            ) : null}
                            {limits || doc.format ? (
                              <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                                {limits ? <><strong>Limiet:</strong> {limits}</> : null}
                                {limits && doc.format ? ' · ' : ''}
                                {doc.format ? <><strong>Vorm:</strong> {doc.format}</> : null}
                              </p>
                            ) : null}
                            <p className="mt-1 text-[11px] text-muted-foreground">Bron: {doc.source}</p>
                          </li>
                        )
                      })}
                    </ul>
                    {nonWritableDocuments(analysis).length ? (
                      <>
                        <h4 className="text-xs font-semibold text-primary">Daarnaast aan te leveren (formulieren en bewijsstukken)</h4>
                        <ul className="list-disc pl-[18px] text-xs leading-relaxed text-muted-foreground">
                          {nonWritableDocuments(analysis).map((doc) => (
                            <li key={doc.id}>
                              {doc.title} <span className="text-[10px] uppercase">({requestedDocumentKindLabels[doc.kind]})</span>
                              {doc.mandatory ? ' — verplicht' : ''}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </div>
                  {analysis.underlyingIntent ? (
                    <div className="space-y-2 rounded-md border bg-accent/40 p-3">
                      <h3 className="text-sm font-semibold text-primary">Vraag achter de vraag</h3>
                      <p className="text-xs leading-relaxed text-foreground">
                        <strong>Expliciet gevraagd:</strong> {analysis.underlyingIntent.explicitQuestion}
                      </p>
                      <p className="text-xs font-semibold leading-relaxed text-primary">{analysis.underlyingIntent.questionBehindQuestion}</p>
                      <p className="text-xs leading-relaxed text-foreground">
                        <strong>Onderliggende behoefte:</strong> {analysis.underlyingIntent.underlyingNeed}
                      </p>
                      {analysis.underlyingIntent.buyerPriorities.length > 0 ? (
                        <>
                          <h4 className="text-xs font-semibold text-primary">Prioriteiten opdrachtgever</h4>
                          <ul className="list-disc pl-[18px] text-xs leading-relaxed text-muted-foreground">
                            {analysis.underlyingIntent.buyerPriorities.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs font-semibold text-primary">Intern teambrief (niet indienen)</summary>
                        <pre className="mt-2 whitespace-pre-wrap rounded-md border border-dashed bg-card p-[10px] text-xs leading-relaxed font-sans text-muted-foreground">
                          {analysis.underlyingIntent.teamBrief}
                        </pre>
                      </details>
                    </div>
                  ) : null}
                  {analysis.leidraadSource ? (
                    <p className="text-xs text-muted-foreground"><strong>Leidraad:</strong> {analysis.leidraadSource}</p>
                  ) : null}
                  <h3 className="text-sm font-semibold text-primary">Schrijfstijl (inschrijver × opdrachtgever)</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">{analysis.styleProfile.blendedGuidance}</p>
                  <ul className="list-disc pl-[18px] text-xs leading-relaxed text-muted-foreground">
                    {analysis.styleProfile.companySignals.map((signal) => (
                      <li key={signal}><strong>Inschrijver:</strong> {signal}</li>
                    ))}
                    {analysis.styleProfile.buyerSignals.map((signal) => (
                      <li key={signal}><strong>Opdrachtgever:</strong> {signal}</li>
                    ))}
                  </ul>
                  {analysis.wordLimits.length > 0 ? (
                    <>
                      <h3 className="text-sm font-semibold text-primary">Formele eisen</h3>
                      <ul className="list-disc pl-[18px] text-xs leading-relaxed text-muted-foreground">
                        {analysis.wordLimits.map((limit) => (
                          <li key={`${limit.label}-${limit.max}`}>
                            {limit.section ?? limit.label}:{' '}
                            {limit.max ? `max. ${limit.max} ${limit.unit}` : limit.min ? `min. ${limit.min} ${limit.unit}` : limit.unit}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {analysis.documentRequirements.length > 0 ? (
                    <>
                      <h3 className="text-sm font-semibold text-primary">Verplichte documenten</h3>
                      <ul className="list-disc pl-[18px] text-xs leading-relaxed text-muted-foreground">
                        {analysis.documentRequirements.map((req) => (
                          <li key={req.name}>{req.name}{req.mandatory ? ' (verplicht)' : ''}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {analysis.submissionRequirements.length > 0 ? (
                    <>
                      <h3 className="text-sm font-semibold text-primary">Specifieke eisen aan de inschrijving</h3>
                      <ul className="list-none space-y-1 text-xs leading-relaxed text-muted-foreground">
                        {analysis.submissionRequirements.map((req, index) => (
                          <li key={`${req.category}-${index}`} className={req.mandatory ? 'text-foreground' : ''}>
                            <Badge variant="outline" className="mr-1 align-middle text-[10px] uppercase">{req.category}</Badge> {req.requirement}
                            {req.mandatory ? <span className="font-semibold text-destructive"> verplicht</span> : null}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {analysis.gaps.length > 0 ? (
                    <>
                      <h3 className="text-sm font-semibold text-primary">Gaps</h3>
                      <ul className="list-disc pl-[18px] text-xs leading-relaxed text-destructive">
                        {analysis.gaps.map((gap) => (
                          <li key={gap}>{gap}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Analyseer de leidraad en aanbestedingsstukken voor woordlimieten, onderwerpen, documenten en schrijfstijl.</p>
              )}
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Brain size={16} /> AI-review
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] gap-3 overflow-auto sm:max-w-xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-primary">
                  <Brain size={18} /> AI-review agent
                </DialogTitle>
              </DialogHeader>
              <Button variant="outline" className="w-full" onClick={() => void runAiReview()} disabled={reviewing}>
                {reviewing ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                {reviewing ? 'Review uitvoeren…' : 'Review uitvoeren'}
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                De review toetst het concept aan eisen en bronnen en vraagt gericht informatie op waar feitelijke
                onderbouwing ontbreekt. Vragen en voorstellen (verbeteren of de uitvraag overtreffen) verschijnen in de
                verbeterronde onder de schrijfstadia; na jouw antwoord en goedkeuring verwerkt de schrijfagent ze in de
                volgende versie.
              </p>

              {claimChecks.length ? (
                <section className="grid gap-2 rounded-md border bg-muted/40 p-[10px]" data-testid="claim-check">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
                      <Library size={16} /> Bewijscheck
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {claimChecks.length - claimCheckSummary.unproven} van {claimChecks.length} claims onderbouwd
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Elke feitelijke claim is teruggelegd op een bouwsteen uit de bewijsbibliotheek of op een bron.
                    Claims zonder bewijs staan hieronder én zijn rood gemarkeerd in het concept: onderbouw ze met een
                    bouwsteen of schrap ze vóór indiening.
                  </p>
                  <div className="grid gap-[7px]">
                    {claimChecks.map((claim) => (
                      <article
                        key={claim.id}
                        data-testid={claim.status === 'onbewezen' ? 'claim-unproven' : 'claim-proven'}
                        className={cn(
                          'rounded-md border bg-card p-[9px]',
                          claim.status === 'onbewezen'
                            ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
                            : 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {claim.status === 'onbewezen' ? <Flag size={14} /> : <BadgeCheck size={14} />}
                          <strong className="text-xs uppercase tracking-wide">
                            {claim.status === 'onbewezen' ? 'Zonder bewijs' : 'Onderbouwd'}
                          </strong>
                          {claim.evidence ? (
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {claim.evidence}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 break-words text-xs italic leading-relaxed">&laquo;{claim.fragment}&raquo;</p>
                        <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{claim.note}</p>
                      </article>
                    ))}
                  </div>
                  {claimCheckSummary.unproven ? (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={clearClaimHighlights}>
                        Markeringen in de tekst wissen
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link href="/bewijs">Bewijs toevoegen</Link>
                      </Button>
                    </div>
                  ) : null}
                </section>
              ) : null}
              <div className="grid gap-[9px]">
                {findings.map((finding) => (
                  <article
                    key={finding.id}
                    data-testid="review-finding"
                    className={cn(
                      'rounded-md border bg-card p-[10px]',
                      finding.priority === 'kritiek' && 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40',
                      finding.priority === 'hoog' && 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40',
                      finding.priority === 'normaal' && 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0">
                        {finding.priority === 'kritiek' ? <Flag size={15} /> : finding.priority === 'hoog' ? <ShieldCheck size={15} /> : <BadgeCheck size={15} />}
                      </span>
                      <strong className="min-w-0 break-words text-sm">{finding.title}</strong>
                    </div>
                    <p className="mt-1.5 break-words text-xs leading-relaxed text-muted-foreground">{finding.detail}</p>
                  </article>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Building2 size={16} /> Bronmatrix
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] gap-3 overflow-auto sm:max-w-xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-primary">
                  <Building2 size={18} /> Bronmatrix
                </DialogTitle>
              </DialogHeader>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Overzicht van de bronnen die bij dit project horen. Het bedrijfsprofiel, het schrijfkader en leerpunten
                gelden voor alle projecten en staan hier niet tussen.
              </p>
              {documents.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nog geen bronnen in dit project. Voeg documenten of tekst toe onder Bronnen.</p>
              ) : null}
              <div className="grid gap-[9px]">
                {documents.map((doc, index) => {
                  const quality = assessSourceContent(doc.content)
                  // Projecteigen bedrijfsinfo wordt bij het schrijven verdrongen door het centrale bedrijfsprofiel.
                  const overridden = doc.type === 'company' && companyConfigActive
                  const statusColor =
                    quality.quality === 'ok'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : quality.quality === 'warning'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-red-600 dark:text-red-400'
                  return (
                    <article key={`${doc.type}-${doc.name}-${index}`} className="rounded-md border bg-card p-[10px]">
                      <Badge variant="secondary" className="mb-1.5">{sourceLabels[doc.type]}</Badge>
                      <strong className="block break-words text-sm">{doc.name}</strong>
                      <p className={cn('mt-1 break-words text-xs font-medium', statusColor)}>
                        {quality.label} · {quality.words} woorden
                      </p>
                      {overridden ? (
                        <p className="mt-1 break-words text-xs text-amber-600 dark:text-amber-400">
                          Niet gebruikt: het centrale bedrijfsprofiel vervangt projecteigen bedrijfsinfo.
                        </p>
                      ) : null}
                      <p className="mt-1.5 break-words text-xs leading-relaxed text-muted-foreground">{summarize(doc.content, 120)}</p>
                    </article>
                  )
                })}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {batchProgress ? (
          <div
            className="mb-[10px] rounded-md border border-primary/30 bg-primary/5 p-3"
            data-testid="batch-progress"
            role="status"
            aria-live="polite"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-primary">
                <Loader2 size={15} className="shrink-0 animate-spin" />
                <span className="min-w-0 break-words">
                  Stuk {batchProgress.done + 1} van {batchProgress.total}: {batchProgress.title}
                </span>
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={batchStopRef.current}
                onClick={() => {
                  batchStopRef.current = true
                  setSyncStatus('Stoppen na dit stuk…')
                  setBatchProgress((current) => (current ? { ...current } : current))
                }}
              >
                {batchStopRef.current ? 'Stopt na dit stuk…' : 'Stoppen na dit stuk'}
              </Button>
            </div>
            <Progress value={(batchProgress.done / batchProgress.total) * 100} className="mt-2" />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {batchProgress.done} van {batchProgress.total} klaar — je kunt dit tabblad sluiten; de stukken worden op
              de server geschreven.
            </p>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-md border bg-card">
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b bg-muted px-3 py-[10px] text-sm text-muted-foreground">
            <div className="flex min-w-0 items-center gap-2">
              {generating ? <Loader2 size={17} className="shrink-0 animate-spin" /> : <Bot size={17} className="shrink-0" />}
              <span className="min-w-0 break-words">
                {generating
                  ? 'Concept wordt op de server opgebouwd — je kunt dit tabblad sluiten; het stuk staat er als je terugkomt.'
                  : notStarted
                    ? 'De schrijfagent is nog niet gestart — het veld toont alleen een samenvatting van de aanbesteding.'
                    : stagePrompts[stage]}
              </span>
            </div>
            {notStarted ? (
              <Button size="sm" className="shrink-0" onClick={() => void analyzeAndGenerate(stage)} disabled={generating}>
                {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {generating ? 'Genereren…' : 'Start schrijfagent'}
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => void applyAiRewrite()} disabled={generating}>
                {generating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                <span className="sr-only sm:not-sr-only">{generating ? 'Verwerken…' : 'Verwerk opmerkingen'}</span>
              </Button>
            )}
          </div>
          {volume.over ? (
            <p
              role="alert"
              data-testid="volume-alert"
              className="flex items-start gap-2 border-b border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold leading-snug text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">
                Over de limiet van de leidraad — {volume.over}. Kort dit stuk in vóór indiening: op vorm kan de
                inschrijving worden uitgesloten.
              </span>
            </p>
          ) : null}
          <div
            ref={editorRef}
            className={cn('document-editor min-w-0 break-words', generating && 'is-generating')}
            contentEditable={!generating && !notStarted}
            suppressContentEditableWarning
            onMouseUp={captureSelection}
            onKeyUp={captureSelection}
            onClick={handleEditorClick}
            onInput={syncDraftFromEditor}
            onBlur={syncDraftFromEditor}
          />
        </div>

        <ConfirmDialog
          open={draftToRemove !== null}
          onOpenChange={(open) => {
            if (!open) setDraftToRemove(null)
          }}
          title={`"${draftToRemove?.title ?? 'Stuk'}" verwijderen?`}
          description="Dit stuk is geschreven. Na verwijderen kun je het tien seconden lang terughalen via de melding; daarna is het weg."
          details={draftToRemove?.details ?? []}
          confirmLabel="Stuk verwijderen"
          onConfirm={() => {
            if (draftToRemove) performRemoveDraft(draftToRemove.id)
            setDraftToRemove(null)
          }}
        />

        <VersionHistoryDialog
          open={versionDialogOpen}
          onOpenChange={setVersionDialogOpen}
          draftTitle={activeDraft?.title ?? 'Stuk'}
          versions={activeVersions}
          currentHtml={draft}
          currentStage={stage}
          busy={generating || Boolean(rewritingId)}
          onRestore={restoreVersion}
        />
      </section>

      <aside className="h-auto min-w-0 space-y-[14px] overflow-auto border-t bg-muted/30 p-4 sm:p-[18px] xl:h-screen xl:border-l xl:border-t-0">
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <MessageSquarePlus size={17} />
              <h2 className="text-sm font-semibold">Menselijke review</h2>
            </div>
            <p className="flex items-center gap-2 rounded-md border bg-muted p-2 text-xs leading-snug text-muted-foreground">
              <Highlighter size={15} className="shrink-0" /> Selecteer tekst in het concept; er verschijnt een knop om een opmerking te plaatsen.
            </p>
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">Of plaats een algemene opmerking</summary>
              <div className="mt-2 space-y-2">
                <Textarea
                  placeholder="Algemene opmerking (zonder tekstselectie)..."
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                />
                <Button className="w-full" variant="secondary" onClick={addGeneralComment} disabled={!commentText.trim()}>
                  <MessageSquarePlus size={16} /> Algemene opmerking plaatsen
                </Button>
              </div>
            </details>
            <div ref={commentsListRef} className="grid gap-[9px]">
              {comments.map((comment) => {
                const anchored = comment.fragment !== GENERAL_COMMENT_FRAGMENT
                const statusMeta = commentStatusMeta[comment.status]
                return (
                  <article key={comment.id} data-comment-card={comment.id} className={cn('rounded-md border bg-card p-[10px] scroll-mt-4', comment.status === 'akkoord' && 'opacity-60')}>
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => focusComment(comment.id)}
                        className={cn('min-w-0 flex-1 break-words text-left text-sm font-semibold', anchored && 'cursor-pointer hover:underline')}
                        title={anchored ? 'Ga naar de gemarkeerde tekst' : undefined}
                      >
                        {comment.fragment}
                      </button>
                      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', statusMeta.className)}>
                        {statusMeta.label}
                      </span>
                    </div>
                    <p className="mt-1.5 break-words text-xs leading-relaxed text-muted-foreground">{comment.note}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {comment.status === 'open' ? (
                        <>
                          {anchored ? (
                            <Button
                              size="sm"
                              onClick={() => void applyTargetedRewrite(comment)}
                              disabled={generating || rewritingId !== null}
                              title="Laat de schrijfagent dit onderdeel gericht herschrijven op basis van deze opmerking"
                            >
                              {rewritingId === comment.id ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                              {rewritingId === comment.id ? 'Herschrijven…' : 'Verwerk'}
                            </Button>
                          ) : null}
                          <Button variant="secondary" size="sm" onClick={() => setCommentResolved(comment, true)}>
                            <Check size={14} /> Afvinken
                          </Button>
                        </>
                      ) : null}
                      {comment.status === 'verwerkt' ? (
                        <>
                          <Button size="sm" onClick={() => approveComment(comment)}>
                            <Check size={14} /> Akkoord
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => revertComment(comment)}>
                            <Undo2 size={14} /> Terugdraaien
                          </Button>
                        </>
                      ) : null}
                      {comment.status === 'akkoord' ? (
                        <Button variant="secondary" size="sm" onClick={() => setCommentResolved(comment, false)}>
                          <Undo2 size={14} /> Heropen
                        </Button>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {analysis ? (
          <RequirementsCard
            analysis={analysis}
            statuses={requirementStatuses}
            writtenDocumentIds={writtenDocumentIds}
            onSetStatus={setRequirementStatus}
          />
        ) : null}
      </aside>
    </main>
  )
}
