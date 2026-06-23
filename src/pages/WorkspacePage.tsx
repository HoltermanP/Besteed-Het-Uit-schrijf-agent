import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BadgeCheck,
  Bot,
  Brain,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Crown,
  Download,
  Eye,
  FileDown,
  FileText,
  Flag,
  FolderOpen,
  Highlighter,
  Import,
  Loader2,
  Medal,
  MessageSquarePlus,
  PenLine,
  RefreshCw,
  Search,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  XCircle,
} from 'lucide-react'
import { buildHtmlDraft } from '../lib/buildDraft'
import { revealDraftProgressively } from '../lib/draftProgress'
import { analyzeTenderDocuments, countCharacters, countWords, reviewAgainstAnalysis } from '../lib/tenderAnalysis'
import { analyzeTenderViaApi } from '../lib/analyzeTenderApi'
import { assessSourceContent } from '../lib/sourceQuality'
import { readFileContent } from '../lib/extractTextApi'
import FileUploadZone from '../components/FileUploadZone'
import { acceptedStyleExtensions } from '../types/styleDocument'
import type { TenderAnalysis } from '../types/tenderAnalysis'
import { exportPdfFromHtml, exportWordDocument } from '../lib/documentExport'
import { isNeonConfigured, isWriterConfigured, migrateLegacyNeonUrl } from '../lib/apiConfig'
import { generateDraftViaApi, fetchWriterStatus, isNoAiConfigError, type WriterStatus } from '../lib/writeDraftApi'
import { rewriteFragmentViaApi } from '../lib/rewriteFragmentApi'
import { getCompanyConfig, isCompanyConfigured, mergeDocumentsWithCompanyConfig } from '../lib/companyConfig'
import { computeOpportunityScore, type OpportunityLevel } from '../lib/opportunityScore'
import { fetchStyleDocuments } from '../lib/styleDocumentsApi'
import { mergeDocumentsWithStyleDocuments } from '../lib/styleDocumentMerge'
import type { StyleDocument } from '../types/styleDocument'
import { getSavedTenders } from '../lib/tenderDatabase'
import type { SavedTender } from '../types/tenderNed'
import {
  getActiveDossierId,
  getDossierUpdatedAt,
  hasDossier,
  loadDossier,
  saveDossier,
  setActiveDossierId,
} from '../lib/dossier'
import { loadStored } from '../lib/storage'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { ModeToggle } from '@/components/mode-toggle'
import { cn } from '@/lib/utils'
import '../styles/proposalDocument.css'

type Stage = 'brons' | 'zilver' | 'goud'
type SourceType = 'tender' | 'company' | 'rules' | 'training'
type Priority = 'kritiek' | 'hoog' | 'normaal'

type SourceDocument = {
  id: string
  name: string
  type: SourceType
  content: string
  importedAt: string
}

type ReviewComment = {
  id: string
  fragment: string
  note: string
  resolved: boolean
}

type ReviewFinding = {
  id: string
  priority: Priority
  title: string
  detail: string
}

type TenderProject = {
  title: string
  tendernedId: string
  buyer: string
  deadline: string
  neonUrl?: string
}

// Volledige momentopname van een dossier; per gedownloade aanbesteding bewaard zodat je
// later verder kunt waar je was gebleven.
type DossierSnapshot = {
  project: TenderProject
  documents: SourceDocument[]
  comments: ReviewComment[]
  stage: Stage
  draft: string
  analysis: TenderAnalysis | null
  updatedAt: string
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

const initialProject: TenderProject = {
  title: 'Winnende inschrijving dienstverlening',
  tendernedId: 'TN-2026-00421',
  buyer: 'Publieke opdrachtgever',
  deadline: '2026-07-17',
}

const seedDocuments: SourceDocument[] = [
  {
    id: 'doc-leidraad-1',
    name: 'Aanbestedingsleidraad',
    type: 'tender',
    importedAt: '2026-06-12 15:54',
    content:
      'Aanbestedingsleidraad dienstverlening. Inschrijvers dienen een plan van aanpak in van maximaal 3500 woorden en maximaal 15 pagina\'s. Verplichte bijlagen: referentielijst, teamoverzicht met CV\'s, invullingsblad EMVI. Beoordeling kwaliteit 70%, prijs 30%. Subcriteria kwaliteit: plan van aanpak (30%), team en competenties (25%), continuiteit (15%), duurzaamheid (15%), implementatie (15%). Schrijf formeel en toetsbaar; vermijd promotionele taal. De opdrachtgever beoordeelt objectief op aansluiting, onderbouwing en uitvoerbaarheid.',
  },
  {
    id: 'doc-tender-1',
    name: 'Programma van Eisen',
    type: 'tender',
    importedAt: '2026-06-12 15:55',
    content:
      'De opdrachtgever zoekt een betrouwbare partner die aantoonbaar kwaliteit levert, risico’s actief beheerst, duurzaam werkt en binnen vier weken na gunning kan starten. Beoordeling: kwaliteit 70%, prijs 30%. Subcriteria: plan van aanpak, team, continuiteit, duurzaamheid en implementatie.',
  },
  {
    id: 'doc-company-1',
    name: 'Bedrijfsprofiel',
    type: 'company',
    importedAt: '2026-06-12 15:56',
    content:
      'Besteed Het Uit combineert senior bidmanagement, domeinkennis en AI-ondersteunde kwaliteitscontrole. Het team werkt met vaste reviewmomenten, bewezen formats, bronverwijzingen en een pragmatische implementatieaanpak.',
  },
  {
    id: 'doc-rules-1',
    name: 'Schrijfregels tenders',
    type: 'rules',
    importedAt: '2026-06-12 15:57',
    content:
      'Schrijf concreet, bewijs elke claim, gebruik actieve zinnen, sluit elke paragraaf aan op het beoordelingscriterium, benoem risico’s inclusief beheersmaatregel en vermijd generieke marketingtaal.',
  },
]

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

function loadInitialState() {
  const storedProject = loadStored<TenderProject>('bid-agent-project', initialProject)
  migrateLegacyNeonUrl(storedProject.neonUrl)
  const project: TenderProject = {
    title: storedProject.title,
    tendernedId: storedProject.tendernedId,
    buyer: storedProject.buyer,
    deadline: storedProject.deadline,
  }
  if (storedProject.neonUrl) {
    localStorage.setItem('bid-agent-project', JSON.stringify(project))
  }
  const documents = loadStored('bid-agent-documents', seedDocuments)
  const comments = loadStored<ReviewComment[]>('bid-agent-comments', [])
  const stage = loadStored<Stage>('bid-agent-stage', 'brons')
  const storedDraft = localStorage.getItem('bid-agent-draft')
  const storedAnalysis = normalizeStoredAnalysis(loadStored<TenderAnalysis | null>('bid-agent-analysis', null))
  const draft = storedDraft ?? buildHtmlDraft(stage, project, documents, comments, storedAnalysis)
  return { project, documents, comments, stage, draft, analysis: storedAnalysis }
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

export default function WorkspacePage() {
  const initial = useMemo(() => loadInitialState(), [])
  const [project, setProject] = useState<TenderProject>(initial.project)
  const [documents, setDocuments] = useState<SourceDocument[]>(initial.documents)
  const [stage, setStage] = useState<Stage>(initial.stage)
  const [draft, setDraft] = useState(initial.draft)
  const [comments, setComments] = useState<ReviewComment[]>(initial.comments)
  const [findings, setFindings] = useState<ReviewFinding[]>([])
  const [analysis, setAnalysis] = useState<TenderAnalysis | null>(initial.analysis)
  const [activeType, setActiveType] = useState<SourceType>('tender')
  const [manualText, setManualText] = useState('')
  const [manualName, setManualName] = useState('')
  const [selectedFragment, setSelectedFragment] = useState('')
  const [commentText, setCommentText] = useState('')
  const [tendernedQuery, setTendernedQuery] = useState('TN-2026-00421')
  const [activeTenderId, setActiveTenderId] = useState(() => getActiveDossierId())
  const [dossierSearch, setDossierSearch] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const savedTenders = getSavedTenders()
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
  const [syncStatus, setSyncStatus] = useState('Lokaal opgeslagen')
  const [generating, setGenerating] = useState(false)
  const [rewritingId, setRewritingId] = useState<string | null>(null)
  const [uploadNotice, setUploadNotice] = useState<{ tone: 'ok' | 'warning' | 'error'; message: string } | null>(null)
  const [showAllSources, setShowAllSources] = useState(false)
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [serverWriter, setServerWriter] = useState<WriterStatus>({ available: false, provider: null, model: null })
  const writerActive = isWriterConfigured() || serverWriter.available
  const [styleDocuments, setStyleDocuments] = useState<StyleDocument[]>([])
  const effectiveDocuments = useMemo(
    () => mergeDocumentsWithStyleDocuments(mergeDocumentsWithCompanyConfig(documents), styleDocuments),
    [documents, styleDocuments],
  )
  const companyConfigActive = isCompanyConfigured()
  const styleLibraryActive = styleDocuments.length > 0
  const [exportingPdf, setExportingPdf] = useState(false)
  const editorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void fetchWriterStatus().then(setServerWriter)
  }, [])

  useEffect(() => {
    void fetchStyleDocuments()
      .then(setStyleDocuments)
      .catch(() => setStyleDocuments([]))
  }, [])

  useEffect(() => {
    if (analysis) {
      localStorage.setItem('bid-agent-analysis', JSON.stringify(analysis))
    }
  }, [analysis])

  useEffect(() => {
    localStorage.setItem('bid-agent-project', JSON.stringify(project))
  }, [project])

  useEffect(() => {
    localStorage.setItem('bid-agent-documents', JSON.stringify(documents))
  }, [documents])

  useEffect(() => {
    localStorage.setItem('bid-agent-comments', JSON.stringify(comments))
  }, [comments])

  useEffect(() => {
    localStorage.setItem('bid-agent-stage', JSON.stringify(stage))
  }, [stage])

  useEffect(() => {
    localStorage.setItem('bid-agent-draft', draft)
  }, [draft])

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

  const visibleSources = useMemo(() => {
    const list = showAllSources ? documents : documents.filter((doc) => doc.type === activeType)
    return list
  }, [activeType, documents, showAllSources])

  const selectedSource = useMemo(
    () => documents.find((doc) => doc.id === selectedSourceId) ?? null,
    [documents, selectedSourceId],
  )

  const opportunity = useMemo(
    () => computeOpportunityScore(getCompanyConfig(), analysis, effectiveDocuments),
    [analysis, effectiveDocuments],
  )

  const stats = useMemo(() => {
    const words = countWords(draft)
    const wordTarget = analysis?.targetWordCount
    const charTarget = analysis?.targetCharCount
    return {
      words,
      chars: countCharacters(draft),
      sources: effectiveDocuments.length,
      unresolved: comments.filter((comment) => !comment.resolved).length,
      score: opportunity.score,
      wordTarget,
      charTarget,
      leidraad: analysis?.leidraadFound ?? false,
    }
  }, [analysis, comments, draft, effectiveDocuments.length, opportunity.score])

  const [showScoreDetails, setShowScoreDetails] = useState(false)

  const runAnalysis = async () => {
    const baseline = analyzeTenderDocuments(effectiveDocuments, project.buyer)
    setAnalysis(baseline)
    setSyncStatus('AI analyseert de uitvraag (documenten, limieten, vragen, eisen, stijl)…')

    const enriched = await analyzeTenderViaApi(project.buyer, effectiveDocuments, baseline)
    if (enriched?.enriched) {
      setAnalysis(enriched.analysis)
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
    const previousDraft = editorRef.current?.innerHTML ?? draft
    setGenerating(true)
    setSyncStatus('Leidraad analyseren…')
    const result = await runAnalysis()
    setStage(targetStage)
    updateEditorHtml('<p class="generation-placeholder">Concept wordt opgebouwd…</p>')

    try {
      setSyncStatus('Schrijfagent schrijft concept…')
      const aiResult = await generateDraftViaApi(
        {
          stage: targetStage,
          project,
          documents: effectiveDocuments,
          comments,
          analysis: result,
          currentDraft: targetStage === 'brons' ? undefined : draft,
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
          : `Concept gegenereerd met ${aiResult.provider} (${aiResult.model}), lokaal opgeslagen`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Genereren mislukt.'
      if (isNoAiConfigError(message)) {
        setSyncStatus('Geen AI geconfigureerd — lokaal concept wordt gebouwd…')
        const nextDraft = buildHtmlDraft(targetStage, project, effectiveDocuments, comments, result)
        await revealDraftProgressively(nextDraft, updateEditorHtml)
        setFindings(reviewDraft(nextDraft, effectiveDocuments, result))
        setSyncStatus(isNeonConfigured() ? 'Analyse, concept en Neon-sync gereed' : 'Analyse en concept lokaal opgeslagen')
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
    setDocuments((current) => current.filter((doc) => doc.id !== id))
    setSelectedSourceId((current) => (current === id ? null : current))
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files?.length) return
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
        message: skipped.join(' · '),
      })
    }

    setUploadingFiles(false)
  }

  const importTenderned = () => {
    addDocument({
      name: `TenderNed import ${tendernedQuery}`,
      type: 'tender',
      content: `TenderNed dossier ${tendernedQuery}: leidraad, opdrachtbeschrijving, Nota van Inlichtingen, beoordelingsmatrix, planning, uitsluitingsgronden en gunningscriteria opgehaald. Plan van aanpak maximaal 3500 woorden. Verplichte bijlagen: referentielijst, teamoverzicht met CV's, invullingsblad EMVI. Kwaliteit 70%, prijs 30%. Schrijf formeel en toetsbaar.`,
    })
    setProject((current) => ({ ...current, tendernedId: tendernedQuery }))
    setSyncStatus(
      isNeonConfigured()
        ? 'TenderNed dossier klaargezet voor Neon-sync'
        : 'TenderNed dossier geïmporteerd (Neon nog niet geconfigureerd in admin)',
    )
  }

  const nowImportedLabel = () =>
    new Date().toLocaleString('nl-NL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

  // Verse werkruimte voor een aanbesteding waar nog niet in is gewerkt.
  const buildFreshDossier = (tender: SavedTender): DossierSnapshot => {
    const documents: SourceDocument[] = [
      {
        id: makeId(),
        name: tender.aanbestedingNaam,
        type: 'tender',
        content: tender.documentText || tender.opdrachtBeschrijving,
        importedAt: nowImportedLabel(),
      },
    ]
    if (tender.opdrachtBeschrijving && tender.opdrachtBeschrijving !== tender.documentText) {
      documents.push({
        id: makeId(),
        name: `${tender.aanbestedingNaam} — samenvatting`,
        type: 'tender',
        content: tender.opdrachtBeschrijving,
        importedAt: nowImportedLabel(),
      })
    }
    const project: TenderProject = {
      title: tender.aanbestedingNaam,
      buyer: tender.opdrachtgeverNaam,
      tendernedId: `TN-${tender.kenmerk}`,
      deadline: tender.sluitingsDatum?.slice(0, 10) ?? '',
    }
    return {
      project,
      documents,
      comments: [],
      stage: 'brons',
      draft: buildHtmlDraft('brons', project, documents, [], null),
      analysis: null,
      updatedAt: new Date().toISOString(),
    }
  }

  // Momentopname van het dossier dat nu open staat (gebruik de live editor-HTML).
  const captureCurrentDossier = (): DossierSnapshot => ({
    project,
    documents,
    comments,
    stage,
    draft: editorRef.current?.innerHTML ?? draft,
    analysis,
    updatedAt: new Date().toISOString(),
  })

  const applyDossier = (snapshot: DossierSnapshot) => {
    setProject(snapshot.project)
    setDocuments(snapshot.documents)
    setComments(snapshot.comments)
    setStage(snapshot.stage)
    setAnalysis(snapshot.analysis)
    setFindings([])
    updateEditorHtml(snapshot.draft)
    setSelectedSourceId(snapshot.documents[0]?.id ?? null)
    setTendernedQuery(snapshot.project.tendernedId)
  }

  // Open een gedownloade aanbesteding: bewaar eerst het huidige dossier, herstel daarna
  // het doel-dossier (of maak een vers dossier als er nog niet in gewerkt is).
  const openDossier = (tender: SavedTender) => {
    const targetId = tender.publicatieId
    if (targetId === activeTenderId) {
      setSyncStatus(`Dossier staat al open: ${tender.aanbestedingNaam}`)
      return
    }
    if (activeTenderId) {
      saveDossier(activeTenderId, captureCurrentDossier())
    }
    const restored = loadDossier<DossierSnapshot>(targetId)
    applyDossier(restored ?? buildFreshDossier(tender))
    setActiveTenderId(targetId)
    setActiveDossierId(targetId)
    setDossierSearch('')
    setSyncStatus(
      restored
        ? `Verder met dossier: ${tender.aanbestedingNaam}`
        : `Dossier geopend: ${tender.aanbestedingNaam}`,
    )
  }

  // Open automatisch een aanbesteding die via de catalogus is doorgegeven (/?open=<id>).
  const openParamHandled = useRef(false)
  useEffect(() => {
    if (openParamHandled.current) return
    const openId = searchParams.get('open')
    if (!openId) return
    openParamHandled.current = true
    const tender = getSavedTenders().find((item) => item.publicatieId === openId)
    // Eénmalige open-actie na navigatie vanuit de catalogus; bewuste setState na mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tender) openDossier(tender)
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('open')
        return next
      },
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Wissel alleen het stadium; de bestaande tekst blijft staan. (Re)genereren gebeurt
  // bewust via de knop "Genereer", niet door op een stadium te klikken.
  const selectStage = (targetStage: Stage) => {
    setStage(targetStage)
    setSyncStatus(`Stadium: ${stageMeta[targetStage].label}. Klik "Genereer" om dit niveau te (her)schrijven.`)
  }

  const applyAiRewrite = async () => {
    const openComments = comments.filter((comment) => !comment.resolved)
    if (!openComments.length) {
      setSyncStatus('Geen open opmerkingen om te verwerken.')
      return
    }

    setGenerating(true)
    setSyncStatus('Schrijfagent verwerkt opmerkingen…')
    const result = analysis ?? (await runAnalysis())

    try {
      const aiResult = await generateDraftViaApi(
        {
          stage: 'zilver',
          project,
          documents: effectiveDocuments,
          comments,
          analysis: result,
          currentDraft: draft,
        },
        (accumulated) => {
          updateEditorHtml(accumulated || draft)
        },
      )
      updateEditorHtml(aiResult.html)
      setComments((current) => current.map((comment) => ({ ...comment, resolved: true })))
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
        setComments((current) => current.map((comment) => ({ ...comment, resolved: true })))
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

    const target = findSectionForFragment(comment.fragment)
    if (!target) {
      setSyncStatus('Kon het bijbehorende tekstdeel niet terugvinden. Selecteer het fragment opnieuw of gebruik "Verwerk opmerkingen".')
      return
    }

    setRewritingId(comment.id)
    setSyncStatus('Schrijfagent herschrijft het betreffende onderdeel…')

    try {
      const result = analysis ?? (await runAnalysis())
      const rewrite = await rewriteFragmentViaApi({
        stage,
        project,
        fragment: comment.fragment,
        note: comment.note,
        sectionHtml: target.outerHTML,
        documents: effectiveDocuments,
        analysis: result,
      })

      const template = document.createElement('template')
      template.innerHTML = rewrite.html.trim()
      const replacement = template.content.firstElementChild
      if (!replacement) throw new Error('Het herschreven onderdeel was leeg.')
      target.replaceWith(replacement)

      const editor = editorRef.current
      if (editor) updateEditorHtml(editor.innerHTML)
      setComments((current) => current.map((item) => (item.id === comment.id ? { ...item, resolved: true } : item)))
      setFindings(reviewDraft(editorRef.current?.innerHTML ?? draft, effectiveDocuments, result))
      setSyncStatus(`Onderdeel herschreven met ${rewrite.provider} (${rewrite.model})`)
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

  const captureSelection = () => {
    const selection = window.getSelection()?.toString().trim()
    if (selection) setSelectedFragment(selection)
  }

  const addComment = () => {
    if (!commentText.trim()) return
    setComments((current) => [
      {
        id: makeId(),
        fragment: selectedFragment || GENERAL_COMMENT_FRAGMENT,
        note: commentText.trim(),
        resolved: false,
      },
      ...current,
    ])
    setCommentText('')
    setSelectedFragment('')
  }

  const getExportHtml = () => editorRef.current?.innerHTML ?? draft

  const exportPdf = async () => {
    syncDraftFromEditor()
    const html = editorRef.current?.innerHTML ?? draft
    const filename = `${project.title.toLowerCase().replace(/\s+/g, '-')}-${stage}.pdf`
    setExportingPdf(true)
    try {
      await exportPdfFromHtml(html, filename)
    } finally {
      setExportingPdf(false)
    }
  }

  const exportWord = () => {
    syncDraftFromEditor()
    const html = getExportHtml()
    const filename = `${project.title.toLowerCase().replace(/\s+/g, '-')}-${stage}.doc`
    exportWordDocument(html, project.title, filename)
  }

  return (
    <main className="grid min-h-screen grid-cols-1 bg-background text-foreground xl:grid-cols-[340px_minmax(0,1fr)_350px]">
      <aside className="h-auto min-w-0 overflow-auto border-b bg-muted/30 p-4 sm:p-[18px] xl:h-screen xl:border-b-0 xl:border-r">
        <div className="mb-[18px] flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-[10px]">
            <div className="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
              <PenLine size={20} />
            </div>
            <div className="min-w-0 leading-tight">
              <strong className="block truncate">Bid Writer</strong>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">Besteed Het Uit</span>
            </div>
          </div>
          <ModeToggle />
        </div>
        <nav className="mb-4 grid gap-1.5">
          <Link
            to="/configuratie"
            className="group flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm font-semibold shadow-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <span className="grid size-8 flex-none place-items-center rounded-lg bg-primary/10 text-primary">
              <Building2 size={16} />
            </span>
            <span className="min-w-0 flex-1">Bedrijfsconfiguratie</span>
            <ChevronRight size={16} className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
          <Link
            to="/schrijfregels"
            className="group flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm font-semibold shadow-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <span className="grid size-8 flex-none place-items-center rounded-lg bg-primary/10 text-primary">
              <ClipboardList size={16} />
            </span>
            <span className="min-w-0 flex-1">Schrijfkader</span>
            <ChevronRight size={16} className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        </nav>

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

        <Card className="mb-[14px]">
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <Import size={17} />
              <h2 className="text-sm font-semibold">TenderNed</h2>
            </div>

            <Button asChild className="h-auto w-full justify-start whitespace-normal py-2.5 text-left leading-snug">
              <Link to="/aanbestedingen">
                <Search size={16} className="shrink-0" /> <span className="min-w-0">Zoek &amp; download aanbestedingen</span>
              </Link>
            </Button>

            <Separator />

            <div className="space-y-2">
              <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                Jouw aanbestedingen
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
                        const isActive = tender.publicatieId === activeTenderId
                        const worked = hasDossier(tender.publicatieId)
                        return (
                          <li key={tender.publicatieId} className="min-w-0">
                            <button
                              type="button"
                              onClick={() => openDossier(tender)}
                              className={cn(
                                'flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors',
                                isActive
                                  ? 'border-primary bg-primary/5'
                                  : 'bg-card hover:border-primary/40 hover:bg-primary/5',
                              )}
                            >
                              <span
                                className={cn(
                                  'mt-0.5 grid size-6 flex-none place-items-center rounded-md',
                                  isActive ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
                                )}
                              >
                                {isActive ? <FolderOpen size={13} /> : <FileText size={13} />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold">{tender.aanbestedingNaam}</span>
                                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                  TN-{tender.kenmerk}
                                  {isActive ? (
                                    <Badge variant="default" className="rounded-full px-1.5 py-0 text-[10px] font-normal">
                                      open
                                    </Badge>
                                  ) : worked ? (
                                    <Badge variant="outline" className="gap-1 rounded-full px-1.5 py-0 text-[10px] font-normal">
                                      <Clock size={10} /> bewerkt
                                    </Badge>
                                  ) : null}
                                </span>
                              </span>
                              {!isActive ? <ArrowRight size={14} className="mt-0.5 flex-none text-muted-foreground" /> : null}
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
                  Nog niets opgeslagen. Open de catalogus om alle documenten van een publicatie te downloaden — je werkt er daarna meteen in verder.
                </p>
              )}
            </div>

            <details className="mt-1">
              <summary className="cursor-pointer select-none py-1 text-xs font-semibold text-primary">
                Handmatig kenmerk invoeren
              </summary>
              <div className="mt-2 flex gap-2">
                <Input
                  value={tendernedQuery}
                  onChange={(event) => setTendernedQuery(event.target.value)}
                  placeholder="bijv. TN-2026-00421"
                />
                <Button variant="outline" size="icon" onClick={importTenderned} title="Importeer TenderNed dossier">
                  <Download size={18} />
                </Button>
              </div>
            </details>
          </CardContent>
        </Card>

        <p className="mt-[10px] text-xs leading-snug text-muted-foreground">
          {syncStatus}
          {writerActive
            ? ` · Schrijfagent actief${serverWriter.available && !isWriterConfigured() ? ' (server)' : ''}`
            : ' · Schrijfagent niet actief'}
          {companyConfigActive ? ' · Bedrijfsconfig actief' : ''}
          {styleLibraryActive ? ' · Stijlbibliotheek actief' : ''}
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
              formatsLabel="PDF, Word, PowerPoint, Excel, txt, md, csv — max. 12 MB per bestand"
              onFiles={handleFileUpload}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Of plak tekst handmatig hieronder. Vaste schrijfregels, schrijfwijze en kwaliteit beheer je in het{' '}
              <Link to="/schrijfregels" className="font-medium text-primary underline-offset-2 hover:underline">
                Schrijfkader
              </Link>
              .
            </p>
            {uploadNotice ? (
              <p
                className={cn(
                  'rounded-md border px-[10px] py-2 text-xs leading-snug',
                  uploadNotice.tone === 'ok' && 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
                  uploadNotice.tone === 'warning' && 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
                  uploadNotice.tone === 'error' && 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
                )}
              >
                {uploadNotice.message}
              </p>
            ) : null}
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
            <Button variant="outline" onClick={exportWord}>
              <FileDown size={17} /> Word
            </Button>
            <Button disabled={generating} onClick={() => void analyzeAndGenerate(stage)}>
              {generating ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
              {generating ? 'Genereren…' : 'Genereer'}
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

        <div className="overflow-hidden rounded-md border bg-card">
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b bg-muted px-3 py-[10px] text-sm text-muted-foreground">
            <div className="flex min-w-0 items-center gap-2">
              {generating ? <Loader2 size={17} className="shrink-0 animate-spin" /> : <Bot size={17} className="shrink-0" />}
              <span className="min-w-0 break-words">{generating ? 'Concept wordt opgebouwd…' : stagePrompts[stage]}</span>
            </div>
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => void applyAiRewrite()} disabled={generating}>
              {generating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              <span className="sr-only sm:not-sr-only">{generating ? 'Verwerken…' : 'Verwerk opmerkingen'}</span>
            </Button>
          </div>
          <div
            ref={editorRef}
            className={cn('document-editor min-w-0 break-words', generating && 'is-generating')}
            contentEditable={!generating}
            suppressContentEditableWarning
            onMouseUp={captureSelection}
            onKeyUp={captureSelection}
            onInput={syncDraftFromEditor}
            onBlur={syncDraftFromEditor}
          />
        </div>
      </section>

      <aside className="h-auto min-w-0 space-y-[14px] overflow-auto border-t bg-muted/30 p-4 sm:p-[18px] xl:h-screen xl:border-l xl:border-t-0">
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <ScanSearch size={17} />
              <h2 className="text-sm font-semibold">Leidraadanalyse</h2>
            </div>
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
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <MessageSquarePlus size={17} />
              <h2 className="text-sm font-semibold">Menselijke review</h2>
            </div>
            <p className="flex min-h-9 items-center gap-2 rounded-md border bg-muted p-2 text-xs leading-snug text-muted-foreground">
              <Highlighter size={15} /> {selectedFragment || 'Selecteer tekst in het concept'}
            </p>
            <Textarea
              placeholder="Plaats opmerking of wijzigingsinstructie..."
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
            />
            <Button className="w-full" onClick={addComment}>
              <MessageSquarePlus size={16} /> Opmerking plaatsen
            </Button>
            <div className="grid gap-[9px]">
              {comments.map((comment) => (
                <article key={comment.id} className={cn('rounded-md border bg-card p-[10px]', comment.resolved && 'opacity-60')}>
                  <strong className="block break-words text-sm">{comment.fragment}</strong>
                  <p className="mt-1.5 break-words text-xs leading-relaxed text-muted-foreground">{comment.note}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!comment.resolved && comment.fragment !== GENERAL_COMMENT_FRAGMENT ? (
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
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setComments((current) => current.map((item) => item.id === comment.id ? { ...item, resolved: !item.resolved } : item))}
                    >
                      <Check size={14} /> {comment.resolved ? 'Heropen' : 'Afvinken'}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <Brain size={17} />
              <h2 className="text-sm font-semibold">AI-review agent</h2>
            </div>
            <Button variant="outline" className="w-full" onClick={() => setFindings(reviewDraft(draft, effectiveDocuments, analysis))}>
              <Search size={16} /> Review uitvoeren
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
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <Building2 size={17} />
              <h2 className="text-sm font-semibold">Bronmatrix</h2>
            </div>
            <div className="grid gap-[9px]">
              {effectiveDocuments.map((doc, index) => {
                const quality = assessSourceContent(doc.content)
                const isAuto = !documents.some((item) => item.name === doc.name && item.type === doc.type)
                const statusColor =
                  quality.quality === 'ok'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : quality.quality === 'warning'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400'
                return (
                  <article key={`${doc.type}-${doc.name}-${index}`} className="rounded-md border bg-card p-[10px]">
                    <Badge variant="secondary" className="mb-1.5">{sourceLabels[doc.type]}{isAuto ? ' · auto' : ''}</Badge>
                    <strong className="block break-words text-sm">{doc.name}</strong>
                    <p className={cn('mt-1 break-words text-xs font-medium', statusColor)}>
                      {quality.label} · {quality.words} woorden
                    </p>
                    <p className="mt-1.5 break-words text-xs leading-relaxed text-muted-foreground">{summarize(doc.content, 120)}</p>
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
