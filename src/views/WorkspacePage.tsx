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
  FileText,
  Flag,
  FolderOpen,
  GitCompareArrows,
  GraduationCap,
  Highlighter,
  Import,
  Loader2,
  Medal,
  MessageSquarePlus,
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
import { analyzeTenderDocuments, countCharacters, countWords, reviewAgainstAnalysis } from '../lib/tenderAnalysis'
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
import type { TenderAnalysis } from '../types/tenderAnalysis'
import { exportPdfFromHtml } from '../lib/documentExport'
import { isNeonConfigured, isWriterConfigured, migrateLegacyNeonUrl } from '../lib/apiConfig'
import { generateDraftViaApi, fetchWriterStatus, isNoAiConfigError, type WriterStatus } from '../lib/writeDraftApi'
import { rewriteFragmentViaApi } from '../lib/rewriteFragmentApi'
import { reviewDraftViaApi } from '../lib/reviewDraftApi'
import { getCompanyConfig, isCompanyConfigured, mergeDocumentsWithCompanyConfig } from '../lib/companyConfig'
import { computeOpportunityScore, type OpportunityLevel } from '../lib/opportunityScore'
import { fetchStyleDocuments } from '../lib/styleDocumentsApi'
import { mergeDocumentsWithStyleDocuments } from '../lib/styleDocumentMerge'
import { getSchrijfkaderAanpassingen, hasAanpassingen } from '../lib/schrijfkader'
import type { StyleDocument } from '../types/styleDocument'
import EvaluationDialog from '../components/EvaluationDialog'
import { fetchLessons, lessonsToPromptContent, selectRelevantLessons } from '../lib/lessonsLearnedApi'
import type { LessonLearned } from '../types/lessonLearned'
import type { WriteDraftDocument } from '../types/writeDraft'
import { downloadTenderToDatabase, getSavedTenders } from '../lib/tenderDatabase'
import { fetchPublicationDetail } from '../lib/tenderNedApi'
import { buildTenderSourceDocuments } from '../lib/projectFactory'
import type { SavedTender, SavedTenderDocument } from '../types/tenderNed'
import type {
  CommentStatus,
  DossierSnapshot,
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

/** Verwijder editor-only annotaties (markeringen, herschrijf-ankers) uit HTML vóór export/AI. */
function stripCommentMarks(html: string): string {
  if (typeof document === 'undefined') return html
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll('.comment-mark').forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) return
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
  })
  template.content.querySelectorAll('[data-rewrite-of]').forEach((el) => el.removeAttribute('data-rewrite-of'))
  return template.innerHTML
}

// Oudere, opgeslagen analyses (localStorage) missen mogelijk nieuwere array-velden zoals
// submissionRequirements. Zonder deze normalisatie crasht een `.length`/.map` in de render.
function normalizeStoredAnalysis(analysis: TenderAnalysis | null): TenderAnalysis | null {
  if (!analysis) return analysis
  return {
    ...analysis,
    wordLimits: analysis.wordLimits ?? [],
    contentRequirements: analysis.contentRequirements ?? [],
    documentRequirements: analysis.documentRequirements ?? [],
    submissionRequirements: analysis.submissionRequirements ?? [],
    evaluationCriteria: analysis.evaluationCriteria ?? [],
    gaps: analysis.gaps ?? [],
  }
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
  return {
    project,
    documents,
    comments,
    stage,
    draft,
    analysis,
    tenderDocuments,
    analysisSource: snapshot?.analysisSource ?? null,
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

function reviewDraft(html: string, documents: SourceDocument[], analysis: TenderAnalysis | null) {
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
    reviewAgainstAnalysis(html, analysis).forEach((item) => {
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

  // Markeer dit project als "laatst geopend"; sommige onderdelen (zoals de leerpunten)
  // gebruiken de actieve-dossier-pointer.
  useEffect(() => {
    setActiveDossierId(projectId)
  }, [projectId])

  // Bewaar het open project continu als dossier-snapshot en houd de projectenlijst
  // (titel/opdrachtgever/tijd) actueel, zodat je het later precies terugvindt.
  useEffect(() => {
    const updatedAt = new Date().toISOString()
    const snapshot: DossierSnapshot = {
      project,
      documents,
      tenderDocuments,
      comments,
      stage,
      draft: liveDraftHtml(),
      analysis,
      analysisSource,
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
  }, [projectId, project, documents, tenderDocuments, comments, stage, draft, analysis, analysisSource])

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

  // Zolang de schrijfagent nog niet is gestart, bevat het veld alleen een samenvatting
  // van de aanbesteding (geen concept). Die samenvatting volgt de bronnen en
  // projectgegevens, bijvoorbeeld nadat een aanbesteding aan dit project is gekoppeld.
  const notStarted = isStartDraft(draft)
  useEffect(() => {
    if (!isStartDraft(draft)) return
    const next = buildStartDraft(project, documents)
    if (next !== draft) setDraft(next)
  }, [draft, documents, project])

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
    const wordTarget = analysis?.targetWordCount
    const charTarget = analysis?.targetCharCount
    return {
      words,
      chars: notStarted ? 0 : countCharacters(draft),
      sources: effectiveDocuments.length,
      unresolved: comments.filter((comment) => comment.status === 'open').length,
      score: opportunity.score,
      wordTarget,
      charTarget,
      leidraad: analysis?.leidraadFound ?? false,
    }
  }, [analysis, comments, draft, effectiveDocuments.length, notStarted, opportunity.score])

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
        const extract = reused ?? (await analyzeDocumentViaApi(doc, project.buyer))
        return extract ? { name: doc.name, extract } : null
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
      setAnalysis(enriched.analysis)
      setAnalysisSource(analysisFingerprintFor(effectiveDocuments, project.buyer))
      setSyncStatus(
        `Uitvraag-analyse door ${enriched.provider} (${enriched.model}): ${enriched.analysis.contentRequirements.length} vragen, ${enriched.analysis.documentRequirements.length} documenten, ${enriched.analysis.submissionRequirements.length} inschrijvingseisen`,
      )
      return enriched.analysis
    }

    setSyncStatus(
      `Heuristische analyse: ${baseline.contentRequirements.length} vragen, ${baseline.documentRequirements.length} documenten, ${baseline.submissionRequirements.length} inschrijvingseisen`,
    )
    return baseline
  }

  const analyzeAndGenerate = async (targetStage = stage) => {
    // Bewaar de huidige tekst, zodat een mislukte generatie het concept niet wist.
    const previousDraft = liveDraftHtml()
    setGenerating(true)
    // Hergebruik de bestaande AI-analyse zolang bronnen en opdrachtgever
    // ongewijzigd zijn; dat scheelt de volledige analyse-pijplijn per generatie.
    let result: TenderAnalysis
    if (analysis && analysisSource === analysisFingerprintFor(effectiveDocuments, project.buyer)) {
      result = analysis
      setSyncStatus('Leidraadanalyse hergebruikt (bronnen ongewijzigd)…')
    } else {
      setSyncStatus('Leidraad analyseren…')
      result = await runAnalysis()
    }
    setStage(targetStage)
    const lessonDocuments = await gatherLessonDocuments(result)
    const distilledById = await gatherDistilledDocuments()
    updateEditorHtml('<p class="generation-placeholder">Concept wordt opgebouwd…</p>')

    try {
      setSyncStatus(
        lessonDocuments.length
          ? 'Schrijfagent schrijft concept met toegepaste leerpunten…'
          : 'Schrijfagent schrijft concept…',
      )
      const aiResult = await generateDraftViaApi(
        {
          stage: targetStage,
          project,
          documents: [...applyDistillates(effectiveDocuments, distilledById), ...lessonDocuments],
          comments: toLegacyComments(comments),
          analysis: result,
          currentDraft: targetStage === 'brons' || isStartDraft(draft) ? undefined : stripCommentMarks(draft),
        },
        (accumulated) => {
          updateEditorHtml(accumulated || '<p class="generation-placeholder">Concept wordt opgebouwd…</p>')
        },
        (message) => setSyncStatus(message),
      )
      updateEditorHtml(aiResult.html)
      setFindings(reviewDraft(aiResult.html, effectiveDocuments, result))
      setSyncStatus(
        isNeonConfigured()
          ? `Concept gegenereerd met ${aiResult.provider} (${aiResult.model})`
          : `Concept gegenereerd met ${aiResult.provider} (${aiResult.model}), opgeslagen in database`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Genereren mislukt.'
      if (isNoAiConfigError(message)) {
        setSyncStatus('Geen AI geconfigureerd — lokaal concept wordt gebouwd…')
        const nextDraft = buildHtmlDraft(targetStage, project, effectiveDocuments, toLegacyComments(comments), result)
        await revealDraftProgressively(nextDraft, updateEditorHtml)
        setFindings(reviewDraft(nextDraft, effectiveDocuments, result))
        setSyncStatus(isNeonConfigured() ? 'Analyse, concept en Neon-sync gereed' : 'Analyse en concept opgeslagen')
        return
      }
      // Generatie mislukt om een andere reden: zet de vorige tekst terug i.p.v. een leeg vel.
      updateEditorHtml(previousDraft)
      setSyncStatus(`Genereren mislukt — vorige tekst hersteld. ${message}`)
    } finally {
      setGenerating(false)
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
    setProject((current) => ({
      ...current,
      title: current.title && current.title !== 'Nieuw project' ? current.title : tender.aanbestedingNaam,
      buyer: current.buyer || tender.opdrachtgeverNaam,
      tendernedId: `TN-${tender.kenmerk}`,
      deadline: current.deadline || (tender.sluitingsDatum?.slice(0, 10) ?? ''),
    }))
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
      setSyncStatus(
        error instanceof Error ? `Ophalen bij TenderNed mislukt: ${error.message}` : 'Ophalen bij TenderNed mislukt.',
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
      setGenerating(true)
      try {
        const result = analysis ?? (await runAnalysis())
        let done = 0
        for (const comment of openComments) {
          setSyncStatus(`Opmerking ${done + 1}/${openComments.length} gericht verwerken…`)
          if (await rewriteCommentSection(comment, result)) done += 1
        }
        setFindings(reviewDraft(liveDraftHtml(), effectiveDocuments, result))
        setSyncStatus(
          done === openComments.length
            ? `${done} opmerking(en) gericht verwerkt — beoordeel per sectie: akkoord of terugdraaien`
            : `${done}/${openComments.length} opmerkingen gericht verwerkt; de overige staan nog open`,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Verwerken mislukt.'
        setSyncStatus(
          isNoAiConfigError(message)
            ? 'Geen AI geconfigureerd — stel de schrijfagent in via API-beheer om opmerkingen te verwerken.'
            : message,
        )
      } finally {
        setGenerating(false)
      }
      return
    }

    setGenerating(true)
    setSyncStatus('Schrijfagent verwerkt opmerkingen…')
    const result = analysis ?? (await runAnalysis())
    const lessonDocuments = await gatherLessonDocuments(result)
    const distilledById = await gatherDistilledDocuments()

    try {
      const aiResult = await generateDraftViaApi(
        {
          stage: 'zilver',
          project,
          documents: [...applyDistillates(effectiveDocuments, distilledById), ...lessonDocuments],
          comments: toLegacyComments(comments),
          analysis: result,
          currentDraft: stripCommentMarks(draft),
        },
        (accumulated) => {
          updateEditorHtml(accumulated || draft)
        },
      )
      updateEditorHtml(aiResult.html)
      setComments((current) => current.map((comment) => (comment.status === 'open' ? { ...comment, status: 'akkoord' } : comment)))
      setFindings(reviewDraft(aiResult.html, effectiveDocuments, result))
      setSyncStatus(`Opmerkingen verwerkt met ${aiResult.provider} (${aiResult.model})`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Verwerken mislukt.'
      if (isNoAiConfigError(message)) {
        const additions = openComments
          .map((comment) => `<p><strong>Review verwerkt:</strong> ${summarize(comment.note, 220)}</p>`)
          .join('')
        const reviewBlock = `<section><h2>AI-verwerking review</h2>${additions}</section>`
        const next = draft.replace('</article>', `${reviewBlock}</article>`)
        updateEditorHtml(next)
        setComments((current) => current.map((comment) => (comment.status === 'open' ? { ...comment, status: 'akkoord' } : comment)))
        setFindings(reviewDraft(next, effectiveDocuments, result))
        setSyncStatus('Opmerkingen lokaal verwerkt (geen AI geconfigureerd)')
        return
      }
      setSyncStatus(message)
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
      analysis: result,
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

    setRewritingId(comment.id)
    setSyncStatus('Schrijfagent herschrijft het betreffende onderdeel…')

    try {
      const result = analysis ?? (await runAnalysis())
      const rewrite = await rewriteCommentSection(comment, result)
      if (!rewrite) {
        setSyncStatus('Kon het bijbehorende tekstdeel niet terugvinden. Selecteer het fragment opnieuw of gebruik "Verwerk opmerkingen".')
        return
      }
      setFindings(reviewDraft(liveDraftHtml(), effectiveDocuments, result))
      setSyncStatus(`Onderdeel herschreven met ${rewrite.provider} (${rewrite.model}) — beoordeel: akkoord of terugdraaien`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Herschrijven mislukt.'
      setSyncStatus(
        isNoAiConfigError(message)
          ? 'Geen AI geconfigureerd — stel de schrijfagent in via API-beheer om opmerkingen gericht te verwerken.'
          : message,
      )
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
    setFindings(reviewDraft(editor?.innerHTML ?? draft, effectiveDocuments, analysis))
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
      const baselineFindings = reviewDraft(html, effectiveDocuments, result)
      const baseline = baselineFindings.map(({ priority, title, detail }) => ({ priority, title, detail }))
      const distilledById = await gatherDistilledDocuments()
      const ai = await reviewDraftViaApi({
        stage,
        project,
        draft: stripCommentMarks(html),
        documents: applyDistillates(effectiveDocuments, distilledById),
        comments: toLegacyComments(comments),
        analysis: result,
        baseline,
      })
      if (ai && ai.findings.length) {
        setFindings(ai.findings.map((finding) => ({ id: makeId(), ...finding })))
        setSyncStatus(
          ai.enriched
            ? `AI-review uitgevoerd met ${ai.provider} (${ai.model})`
            : 'Review uitgevoerd (heuristisch — AI gaf geen extra punten)',
        )
      } else {
        setFindings(baselineFindings)
        setSyncStatus('AI-review niet beschikbaar — heuristische review getoond')
      }
    } catch {
      setFindings(reviewDraft(html, effectiveDocuments, analysis))
      setSyncStatus('AI-review mislukt — heuristische review getoond')
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
  const getExportHtml = () => stripCommentMarks(liveDraftHtml())

  const exportPdf = async () => {
    syncDraftFromEditor()
    const html = getExportHtml()
    const filename = `${project.title.toLowerCase().replace(/\s+/g, '-')}-${stage}.pdf`
    setExportingPdf(true)
    setSyncStatus('PDF genereren…')
    try {
      await exportPdfFromHtml(html, filename)
      setSyncStatus('PDF gedownload.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PDF genereren mislukt.'
      setSyncStatus(`PDF genereren mislukt: ${message}`)
    } finally {
      setExportingPdf(false)
    }
  }

  const exportWord = async () => {
    syncDraftFromEditor()
    const html = getExportHtml()
    const filename = `${project.title.toLowerCase().replace(/\s+/g, '-')}-${stage}.docx`
    setSyncStatus('Word genereren…')
    try {
      const { exportDocxDocument } = await import('../lib/docxExport')
      await exportDocxDocument(html, project.title, filename)
      setSyncStatus('Word-document gedownload.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Word-export mislukt.'
      setSyncStatus(`Word-export mislukt: ${message}`)
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
              <Input
                id="project-deadline"
                type="date"
                value={project.deadline}
                onChange={(event) => setProject({ ...project, deadline: event.target.value })}
              />
            </div>
          </CardContent>
        </Card>


        <nav className="mb-4 grid grid-cols-2 gap-1.5" aria-label="Onderdelen">
          {[
            { href: '/configuratie', label: 'Bedrijfsconfiguratie', Icon: Building2, count: 0 },
            { href: '/schrijfregels', label: 'Schrijfkader', Icon: ClipboardList, count: 0 },
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

        <p className="mt-[10px] text-xs leading-snug text-muted-foreground">
          {syncStatus}
          {writerActive
            ? ` · Schrijfagent actief${serverWriter.available && !isWriterConfigured() ? ' (server)' : ''}`
            : ' · Schrijfagent niet actief'}
          {companyConfigActive ? ' · Bedrijfsconfig actief' : ''}
          {schrijfkaderActive ? ' · Schrijfkader actief' : ' · Schrijfkader: basis'}
        </p>

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
        <header className="mb-[14px] flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-[5px] text-xs font-bold uppercase text-muted-foreground">Besteed Het Uit · AI-Schrijfagent</p>
            <h1 className="break-words text-[25px] leading-tight font-bold">{project.title}</h1>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
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
            <Button disabled={generating} onClick={() => void analyzeAndGenerate(stage)}>
              {generating ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
              {generating ? 'Genereren…' : notStarted ? 'Start schrijfagent' : 'Genereer'}
            </Button>
          </div>
        </header>

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
          <div className="min-w-0 rounded-md border border-violet-200 bg-violet-50 p-3 dark:border-violet-900/50 dark:bg-violet-950/40">
            <span className="block text-[22px] font-extrabold text-violet-700 dark:text-violet-300">
              {stats.words}{stats.wordTarget ? `/${stats.wordTarget}` : ''}
            </span>
            <p className="mt-1 text-xs text-muted-foreground">Woorden{stats.wordTarget ? ' (max)' : ''}</p>
          </div>
          {stats.charTarget ? (
            <div className="min-w-0 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/40">
              <span className="block text-[22px] font-extrabold text-amber-700 dark:text-amber-300">
                {stats.chars.toLocaleString('nl-NL')}/{stats.charTarget.toLocaleString('nl-NL')}
              </span>
              <p className="mt-1 text-xs text-muted-foreground">Karakters (max)</p>
            </div>
          ) : null}
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

        <div className="overflow-hidden rounded-md border bg-card">
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b bg-muted px-3 py-[10px] text-sm text-muted-foreground">
            <div className="flex min-w-0 items-center gap-2">
              {generating ? <Loader2 size={17} className="shrink-0 animate-spin" /> : <Bot size={17} className="shrink-0" />}
              <span className="min-w-0 break-words">
                {generating
                  ? 'Concept wordt opgebouwd…'
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

      </aside>
    </main>
  )
}
