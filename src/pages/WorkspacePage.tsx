import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Award,
  BadgeCheck,
  BookOpen,
  Bot,
  Brain,
  Building2,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Crown,
  Download,
  Eye,
  FileDown,
  FileText,
  Flag,
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
  XCircle,
} from 'lucide-react'
import { buildHtmlDraft } from '../lib/buildDraft'
import { revealDraftProgressively } from '../lib/draftProgress'
import { analyzeTenderDocuments, countCharacters, countWords, reviewAgainstAnalysis } from '../lib/tenderAnalysis'
import { assessSourceContent } from '../lib/sourceQuality'
import { readFileContent } from '../lib/extractTextApi'
import FileUploadZone from '../components/FileUploadZone'
import { acceptedStyleExtensions } from '../types/styleDocument'
import type { TenderAnalysis } from '../types/tenderAnalysis'
import { exportPdfFromHtml, exportWordDocument } from '../lib/documentExport'
import { isNeonConfigured, isWriterConfigured, migrateLegacyNeonUrl } from '../lib/apiConfig'
import { generateDraftViaApi, fetchWriterStatus, isNoAiConfigError, type WriterStatus } from '../lib/writeDraftApi'
import { isCompanyConfigured, mergeDocumentsWithCompanyConfig } from '../lib/companyConfig'
import { fetchStyleDocuments } from '../lib/styleDocumentsApi'
import { mergeDocumentsWithStyleDocuments } from '../lib/styleDocumentMerge'
import type { StyleDocument } from '../types/styleDocument'
import { getSavedTenders } from '../lib/tenderDatabase'
import { loadStored } from '../lib/storage'
import '../styles/proposalDocument.css'
import '../App.css'

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
  const storedAnalysis = loadStored<TenderAnalysis | null>('bid-agent-analysis', null)
  const draft = storedDraft ?? buildHtmlDraft(stage, project, documents, comments, storedAnalysis)
  return { project, documents, comments, stage, draft, analysis: storedAnalysis }
}

function summarize(text: string, max = 220) {
  const clean = text.replace(/\s+/g, ' ').trim()
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
  const [savedTenderId, setSavedTenderId] = useState('')
  const savedTenders = getSavedTenders()
  const [syncStatus, setSyncStatus] = useState('Lokaal opgeslagen')
  const [generating, setGenerating] = useState(false)
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

  const stats = useMemo(() => {
    const words = countWords(draft)
    const wordTarget = analysis?.targetWordCount
    const charTarget = analysis?.targetCharCount
    return {
      words,
      chars: countCharacters(draft),
      sources: effectiveDocuments.length,
      unresolved: comments.filter((comment) => !comment.resolved).length,
      score: Math.min(100, 45 + keywordScore(draft, ['kwaliteit', 'risico', 'bewijs', 'duurzaamheid', 'implementatie']) * 9),
      wordTarget,
      charTarget,
      leidraad: analysis?.leidraadFound ?? false,
    }
  }, [analysis, comments, draft, effectiveDocuments.length])

  const runAnalysis = () => {
    const result = analyzeTenderDocuments(effectiveDocuments, project.buyer)
    setAnalysis(result)
    setSyncStatus(`Leidraadanalyse: ${result.contentRequirements.length} eisen, ${result.documentRequirements.length} documenten`)
    return result
  }

  const analyzeAndGenerate = async (targetStage = stage) => {
    setGenerating(true)
    setSyncStatus('Leidraad analyseren…')
    const result = runAnalysis()
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
      setSyncStatus(message)
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

  const importSavedTender = () => {
    const tender = savedTenders.find((item) => item.publicatieId === savedTenderId)
    if (!tender) return
    addDocument({
      name: tender.aanbestedingNaam,
      type: 'tender',
      content: tender.documentText || tender.opdrachtBeschrijving,
    })
    if (tender.opdrachtBeschrijving && tender.opdrachtBeschrijving !== tender.documentText) {
      addDocument({
        name: `${tender.aanbestedingNaam} — samenvatting`,
        type: 'tender',
        content: tender.opdrachtBeschrijving,
      })
    }
    setProject((current) => ({
      ...current,
      title: tender.aanbestedingNaam,
      buyer: tender.opdrachtgeverNaam,
      tendernedId: `TN-${tender.kenmerk}`,
      deadline: tender.sluitingsDatum.slice(0, 10),
    }))
    setTendernedQuery(`TN-${tender.kenmerk}`)
    setSyncStatus(`Geïmporteerd uit database: ${tender.aanbestedingNaam}`)
  }

  const generateStage = (targetStage = stage) => {
    void analyzeAndGenerate(targetStage)
  }

  const applyAiRewrite = async () => {
    const openComments = comments.filter((comment) => !comment.resolved)
    if (!openComments.length) {
      setSyncStatus('Geen open opmerkingen om te verwerken.')
      return
    }

    setGenerating(true)
    setSyncStatus('Schrijfagent verwerkt opmerkingen…')
    const result = analysis ?? runAnalysis()

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
        fragment: selectedFragment || 'Algemene opmerking',
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
    <main className="workspace">
      <aside className="rail">
        <div className="brand">
          <div className="brand-mark"><PenLine size={20} /></div>
          <div>
            <strong>Bid Writer</strong>
            <span>Besteed Het Uit</span>
          </div>
        </div>
        <Link className="secondary config-nav-link" to="/configuratie">
          <Building2 size={16} /> Bedrijfsconfiguratie
        </Link>
        <Link className="secondary config-nav-link" to="/schrijfregels">
          <ClipboardList size={16} /> Schrijfregels
        </Link>
        <Link className="secondary config-nav-link" to="/schrijfstijl">
          <BookOpen size={16} /> Schrijfstijl &amp; kwaliteit
        </Link>

        <section className="panel">
          <div className="panel-heading">
            <FileText size={17} />
            <h2>Dossier</h2>
          </div>
          <label>
            Titel
            <input value={project.title} onChange={(event) => setProject({ ...project, title: event.target.value })} />
          </label>
          <label>
            Opdrachtgever
            <input value={project.buyer} onChange={(event) => setProject({ ...project, buyer: event.target.value })} />
          </label>
          <label>
            Deadline
            <input type="date" value={project.deadline} onChange={(event) => setProject({ ...project, deadline: event.target.value })} />
          </label>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <Import size={17} />
            <h2>TenderNed</h2>
          </div>
          <div className="inline">
            <input value={tendernedQuery} onChange={(event) => setTendernedQuery(event.target.value)} />
            <button className="icon-button" onClick={importTenderned} title="Importeer TenderNed dossier">
              <Download size={18} />
            </button>
          </div>
          <Link className="secondary tender-browser-link" to="/aanbestedingen">
            <Search size={16} /> CPV-catalogus &amp; download
          </Link>
          {savedTenders.length ? (
            <div className="saved-tender-import">
              <label>
                Uit database ({savedTenders.length})
                <select value={savedTenderId} onChange={(event) => setSavedTenderId(event.target.value)}>
                  <option value="">Kies opgeslagen aanbesteding</option>
                  {savedTenders.map((tender) => (
                    <option key={tender.publicatieId} value={tender.publicatieId}>
                      TN-{tender.kenmerk} — {tender.aanbestedingNaam.slice(0, 48)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="secondary" onClick={importSavedTender} disabled={!savedTenderId}>
                <Download size={16} /> Importeer in dossier
              </button>
            </div>
          ) : null}
        </section>

        <p className="status workspace-status">
          {syncStatus}
          {writerActive
            ? ` · Schrijfagent actief${serverWriter.available && !isWriterConfigured() ? ' (server)' : ''}`
            : ' · Schrijfagent niet actief'}
          {companyConfigActive ? ' · Bedrijfsconfig actief' : ''}
          {styleLibraryActive ? ' · Stijlbibliotheek actief' : ''}
        </p>

        <section className="panel source-panel">
          <div className="panel-heading">
            <Upload size={17} />
            <h2>Bronnen ({documents.length})</h2>
          </div>
          <div className="segmented">
            {(Object.keys(sourceLabels) as SourceType[]).map((type) => (
              <button key={type} className={activeType === type ? 'active' : ''} onClick={() => setActiveType(type)}>
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
          <p className="source-upload-help">
            Of plak tekst handmatig hieronder. Voor vaste schrijfregels gebruik je ook de pagina{' '}
            <Link to="/schrijfregels">schrijfregelspagina</Link>.
          </p>
          {uploadNotice ? (
            <p className={`source-upload-notice source-upload-notice-${uploadNotice.tone}`}>{uploadNotice.message}</p>
          ) : null}
          <input placeholder="Naam bron" value={manualName} onChange={(event) => setManualName(event.target.value)} />
          <textarea placeholder="Plak broninformatie, rules of training..." value={manualText} onChange={(event) => setManualText(event.target.value)} />
          <button
            className="secondary"
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
          </button>

          <div className="source-panel-toolbar">
            <button className="secondary source-filter-btn" onClick={() => setShowAllSources((current) => !current)}>
              {showAllSources ? 'Filter op tab' : 'Toon alle bronnen'}
            </button>
          </div>

          <div className="source-library">
            {visibleSources.length ? (
              visibleSources.map((doc) => {
                const quality = assessSourceContent(doc.content)
                const StatusIcon =
                  quality.quality === 'ok' ? CheckCircle2 : quality.quality === 'warning' ? AlertTriangle : XCircle
                return (
                  <article
                    key={doc.id}
                    className={`source-card source-card-${quality.quality}${selectedSourceId === doc.id ? ' selected' : ''}`}
                  >
                    <div className="source-card-head">
                      <span className="source-type-badge">{sourceLabels[doc.type]}</span>
                      <span className={`source-status source-status-${quality.quality}`}>
                        <StatusIcon size={14} /> {quality.label}
                      </span>
                    </div>
                    <strong>{doc.name}</strong>
                    <p className="source-card-meta">
                      {quality.words.toLocaleString('nl-NL')} woorden · {quality.chars.toLocaleString('nl-NL')} tekens · {doc.importedAt}
                    </p>
                    <p>{summarize(doc.content, 140)}</p>
                    <div className="source-card-actions">
                      <button className="secondary" onClick={() => setSelectedSourceId(doc.id)}>
                        <Eye size={14} /> Bekijken
                      </button>
                      <button className="secondary source-delete-btn" onClick={() => removeDocument(doc.id)}>
                        <Trash2 size={14} /> Verwijder
                      </button>
                    </div>
                  </article>
                )
              })
            ) : (
              <p className="status">Nog geen bronnen in deze categorie. Upload of plak tekst hierboven.</p>
            )}
          </div>

          {selectedSource ? (
            <div className="source-preview">
              <div className="source-preview-head">
                <h3>{selectedSource.name}</h3>
                <button className="secondary" onClick={() => setSelectedSourceId(null)}>Sluiten</button>
              </div>
              <p className="source-card-meta">
                {sourceLabels[selectedSource.type]} · {assessSourceContent(selectedSource.content).words.toLocaleString('nl-NL')} woorden
              </p>
              <pre className="source-preview-body">{selectedSource.content}</pre>
            </div>
          ) : null}
        </section>
      </aside>

      <section className="compose">
        <header className="topbar">
          <div>
            <p className="eyebrow">Aanbestedingsanalyse en inschrijving</p>
            <h1>{project.title}</h1>
          </div>
          <div className="actions">
            <button className="secondary" onClick={exportPdf} disabled={exportingPdf}>
              <FileDown size={17} /> {exportingPdf ? 'PDF...' : 'PDF'}
            </button>
            <button className="secondary" onClick={exportWord}><FileDown size={17} /> Word</button>
            <button
              className="primary"
              disabled={generating}
              onClick={() => void analyzeAndGenerate(stage)}
            >
              {generating ? <Loader2 size={17} className="spin" /> : <Sparkles size={17} />}
              {generating ? 'Genereren…' : 'Genereer'}
            </button>
          </div>
        </header>

        <nav className="stagebar" aria-label="Schrijfstadia">
          {(['brons', 'zilver', 'goud'] as Stage[]).map((item) => {
            const meta = stageMeta[item]
            const Icon = meta.Icon
            return (
              <button
                key={item}
                type="button"
                className={`stage-chip stage-${item}${stage === item ? ' active' : ''}`}
                onClick={() => generateStage(item)}
                aria-pressed={stage === item}
              >
                <span className="stage-icon" aria-hidden="true">
                  <Icon size={18} strokeWidth={2.2} />
                </span>
                <span className="stage-copy">
                  <strong>{meta.label}</strong>
                  <span>{meta.hint}</span>
                </span>
              </button>
            )
          })}
        </nav>

        <section className="metrics">
          <div><span>{stats.score}%</span><p>Kansscore</p></div>
          <div><span>{stats.words}{stats.wordTarget ? `/${stats.wordTarget}` : ''}</span><p>Woorden{stats.wordTarget ? ' (max)' : ''}</p></div>
          {stats.charTarget ? (
            <div><span>{stats.chars.toLocaleString('nl-NL')}/{stats.charTarget.toLocaleString('nl-NL')}</span><p>Karakters (max)</p></div>
          ) : null}
          <div><span>{stats.leidraad ? 'Ja' : 'Nee'}</span><p>Leidraad</p></div>
          <div><span>{stats.sources}</span><p>Bronnen</p></div>
        </section>

        <div className="editor-shell">
          <div className="editor-toolbar">
            <div>
              {generating ? <Loader2 size={17} className="spin" /> : <Bot size={17} />}
              {generating ? 'Concept wordt opgebouwd…' : stagePrompts[stage]}
            </div>
            <button className="secondary" onClick={() => void applyAiRewrite()} disabled={generating}>
              {generating ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
              {generating ? 'Verwerken…' : 'Verwerk opmerkingen'}
            </button>
          </div>
          <div
            ref={editorRef}
            className={`document-editor${generating ? ' is-generating' : ''}`}
            contentEditable={!generating}
            suppressContentEditableWarning
            onMouseUp={captureSelection}
            onKeyUp={captureSelection}
            onInput={syncDraftFromEditor}
            onBlur={syncDraftFromEditor}
          />
        </div>
      </section>

      <aside className="review">
        <section className="panel analysis-panel">
          <div className="panel-heading">
            <ScanSearch size={17} />
            <h2>Leidraadanalyse</h2>
          </div>
          <button className="secondary" onClick={runAnalysis}><Search size={16} /> Analyseer dossier</button>
          {analysis ? (
            <div className="analysis-results">
              <p className="analysis-summary">{analysis.summary}</p>
              <div className="analysis-chips">
                <span>{analysis.contentRequirements.length} inhoudseisen</span>
                <span>{analysis.documentRequirements.length} documenten</span>
                <span>{analysis.wordLimits.length} limieten</span>
              </div>
              {analysis.leidraadSource ? (
                <p className="analysis-meta"><strong>Leidraad:</strong> {analysis.leidraadSource}</p>
              ) : null}
              <h3>Schrijfstijl (inschrijver × opdrachtgever)</h3>
              <p className="analysis-style">{analysis.styleProfile.blendedGuidance}</p>
              <ul className="analysis-style-list">
                {analysis.styleProfile.companySignals.map((signal) => (
                  <li key={signal}><strong>Inschrijver:</strong> {signal}</li>
                ))}
                {analysis.styleProfile.buyerSignals.map((signal) => (
                  <li key={signal}><strong>Opdrachtgever:</strong> {signal}</li>
                ))}
              </ul>
              {analysis.wordLimits.length > 0 ? (
                <>
                  <h3>Formele eisen</h3>
                  <ul className="analysis-list">
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
                  <h3>Verplichte documenten</h3>
                  <ul className="analysis-list">
                    {analysis.documentRequirements.map((req) => (
                      <li key={req.name}>{req.name}{req.mandatory ? ' (verplicht)' : ''}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {analysis.gaps.length > 0 ? (
                <>
                  <h3>Gaps</h3>
                  <ul className="analysis-gaps">
                    {analysis.gaps.map((gap) => (
                      <li key={gap}>{gap}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : (
            <p className="status">Analyseer de leidraad en aanbestedingsstukken voor woordlimieten, onderwerpen, documenten en schrijfstijl.</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <MessageSquarePlus size={17} />
            <h2>Menselijke review</h2>
          </div>
          <p className="selection"><Highlighter size={15} /> {selectedFragment || 'Selecteer tekst in het concept'}</p>
          <textarea placeholder="Plaats opmerking of wijzigingsinstructie..." value={commentText} onChange={(event) => setCommentText(event.target.value)} />
          <button className="primary" onClick={addComment}><MessageSquarePlus size={16} /> Opmerking plaatsen</button>
          <div className="comment-list">
            {comments.map((comment) => (
              <article key={comment.id} className={comment.resolved ? 'resolved' : ''}>
                <strong>{comment.fragment}</strong>
                <p>{comment.note}</p>
                <button onClick={() => setComments((current) => current.map((item) => item.id === comment.id ? { ...item, resolved: !item.resolved } : item))}>
                  <Check size={14} /> {comment.resolved ? 'Heropen' : 'Afvinken'}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <Brain size={17} />
            <h2>AI-review agent</h2>
          </div>
          <button className="secondary" onClick={() => setFindings(reviewDraft(draft, effectiveDocuments, analysis))}><Search size={16} /> Review uitvoeren</button>
          <div className="finding-list">
            {findings.map((finding) => (
              <article key={finding.id} className={`finding ${finding.priority}`}>
                <div>
                  {finding.priority === 'kritiek' ? <Flag size={15} /> : finding.priority === 'hoog' ? <ShieldCheck size={15} /> : <BadgeCheck size={15} />}
                  <strong>{finding.title}</strong>
                </div>
                <p>{finding.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <Building2 size={17} />
            <h2>Bronmatrix</h2>
          </div>
          <div className="source-list">
            {effectiveDocuments.map((doc, index) => {
              const quality = assessSourceContent(doc.content)
              const isAuto = !documents.some((item) => item.name === doc.name && item.type === doc.type)
              return (
                <article key={`${doc.type}-${doc.name}-${index}`}>
                  <span>{sourceLabels[doc.type]}{isAuto ? ' · auto' : ''}</span>
                  <strong>{doc.name}</strong>
                  <p className={`source-status-inline source-status-${quality.quality}`}>
                    {quality.label} · {quality.words} woorden
                  </p>
                  <p>{summarize(doc.content, 120)}</p>
                </article>
              )
            })}
          </div>
        </section>
      </aside>
    </main>
  )
}
