'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  BookmarkCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Library,
  LoaderCircle,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import {
  collectCpvCodes,
  enrichWithCpv,
  fetchPublicationsPage,
  fetchPublicationDetail,
  fetchPublicationDocumentList,
  matchesFilters,
  searchPublications,
} from '../lib/tenderNedApi'
import {
  downloadTenderToDatabase,
  getSavedTenders,
  syncPendingTendersToNeon,
} from '../lib/tenderDatabase'
import {
  getTenderPreselection,
  preselectionIsStale,
  runCpvPreselection,
  sortTenders,
  TENDER_SORT_OPTIONS,
  updatePreselectionItems,
  type PreselectionProgress,
} from '../lib/tenderPreselection'
import { createProjectFromTender } from '../lib/projectFactory'
import { mapWithConcurrency } from '../lib/analyzeDocumentApi'
import { currentProfileStamp, getTenderScores, scoreTendersForCompany } from '../lib/tenderScoreApi'
import { cpvSignificantPrefix, matchesCompanyCpv } from '../lib/cpv'
import { getCompanyConfig, isCompanyConfigured } from '../lib/companyConfig'
import { getApiConfig, isWriterConfigured } from '../lib/apiConfig'
import { loadStored, saveStored } from '../lib/storage'
import { fetchWriterStatus } from '../lib/writeDraftApi'
import { blobViewUrl } from '../lib/blobFiles'
import type {
  SavedTender,
  SavedTenderDocument,
  TenderDocument,
  TenderListItem,
  TenderPreselection,
  TenderSortKey,
} from '../types/tenderNed'
import type { StoredTenderScore } from '../types/tenderScore'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ModeToggle } from '@/components/mode-toggle'
import { cn } from '@/lib/utils'

type DocListState = TenderDocument[] | 'loading' | 'error'
type ViewMode = 'voorselectie' | 'catalogus'
type ScoreFilter = 'alle' | 'sterk' | 'passend' | 'ongescoord'

const LIST_PAGE_SIZE = 25
const SORT_STORAGE_KEY = 'bid-agent-tender-sort'

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`
  return `${bytes} B`
}

function formatDate(value: string): string {
  if (!value) return 'onbekend'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'onbekend' : date.toLocaleDateString('nl-NL')
}

function formatDateTime(value: string): string {
  if (!value) return 'onbekend'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'onbekend'
  return `${date.toLocaleDateString('nl-NL')} ${date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
}

// Kleurenklasse per scoreband, aansluitend op de rubriek van de AI-score
// (70+ goed passend, 40-69 gedeeltelijk, daaronder weinig passend).
function scoreTier(score: number) {
  if (score >= 70) {
    return {
      label: 'Sterke match',
      text: 'text-emerald-600 dark:text-emerald-400',
      stroke: 'stroke-emerald-500',
      panel: 'border-emerald-500/30 bg-emerald-500/10',
    }
  }
  if (score >= 40) {
    return {
      label: 'Deels passend',
      text: 'text-amber-600 dark:text-amber-400',
      stroke: 'stroke-amber-500',
      panel: 'border-amber-500/30 bg-amber-500/10',
    }
  }
  return {
    label: 'Weinig passend',
    text: 'text-destructive',
    stroke: 'stroke-destructive',
    panel: 'border-destructive/30 bg-destructive/10',
  }
}

/** Donutring met de AI-geschiktheidsscore (0-100) groot in het midden. */
function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const tier = scoreTier(score)
  const strokeWidth = 5
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100)
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(tier.stroke, 'transition-[stroke-dashoffset] duration-700 ease-out')}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={cn('text-xl font-bold tabular-nums', tier.text)}>{score}</span>
        <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">/ 100</span>
      </div>
    </div>
  )
}

function scanProgressLabel(progress: PreselectionProgress | null): string {
  if (!progress) return ''
  if (progress.phase === 'lijst') return `lijst ophalen (${progress.done}${progress.total ? `/${progress.total}` : ''})`
  return `CPV-codes bijladen (${progress.done}/${progress.total})`
}

export default function TenderBrowserPage() {
  const router = useRouter()
  const companyConfig = useMemo(() => getCompanyConfig(), [])
  const companyCpvCodes = companyConfig.cpvCodes
  const companyName = companyConfig.name.trim() || 'het actieve bedrijf'
  // Scores van een ouder bedrijfsprofiel worden verborgen; opnieuw scoren ververst ze.
  const profileStamp = useMemo(() => currentProfileStamp(), [])

  // ── Voorselectie (stap 1: CPV, stap 2: AI-score) ─────────────────────────
  // De voorselectie staat in de werkruimte-opslag (database); bij terugkeer op
  // deze pagina verschijnt de lijst direct, zonder opnieuw ophalen of scoren.
  const [preselection, setPreselection] = useState<TenderPreselection | null>(() => getTenderPreselection())
  const [mode, setMode] = useState<ViewMode>(() =>
    getTenderPreselection() || companyCpvCodes.length ? 'voorselectie' : 'catalogus',
  )
  const [sortKey, setSortKeyState] = useState<TenderSortKey>(() => loadStored<TenderSortKey>(SORT_STORAGE_KEY, 'score'))
  const setSortKey = (key: TenderSortKey) => {
    setSortKeyState(key)
    saveStored(SORT_STORAGE_KEY, key)
    setListPage(0)
  }
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('alle')
  const [listPage, setListPage] = useState(0)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<PreselectionProgress | null>(null)

  // ── Catalogus (vrij zoeken) ──────────────────────────────────────────────
  const [items, setItems] = useState<TenderListItem[]>([])
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [cpvPrefix, setCpvPrefix] = useState('')
  const [query, setQuery] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(true)
  const [scannedPages, setScannedPages] = useState(0)
  // Relevantiefilter in de catalogus: toon alleen tenders waarvan de CPV-codes
  // matchen met de CPV-codes van het actieve bedrijf.
  const [onlyRelevant, setOnlyRelevant] = useState(false)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState('')
  const [savedCount, setSavedCount] = useState(() => getSavedTenders().length)
  const [savedIds, setSavedIds] = useState<Set<string>>(
    () => new Set(getSavedTenders().map((tender) => tender.publicatieId)),
  )
  const [savedDocsById, setSavedDocsById] = useState<Record<string, SavedTenderDocument[]>>(
    () => Object.fromEntries(getSavedTenders().map((tender) => [tender.publicatieId, tender.documents ?? []])),
  )
  const [savedAtById, setSavedAtById] = useState<Record<string, string>>(
    () => Object.fromEntries(getSavedTenders().map((tender) => [tender.publicatieId, tender.savedAt])),
  )
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [docLists, setDocLists] = useState<Record<string, DocListState>>({})
  const [scores, setScores] = useState<Record<string, StoredTenderScore>>(() => getTenderScores())
  const [scoring, setScoring] = useState(false)

  // Automatische AI-score (stap 2) over de voorselectie. Gaat pas aan als er
  // een bedrijfsprofiel én een werkende AI-configuratie is (key in /admin of
  // op de server), en schakelt zichzelf uit na een scorefout.
  const [autoScoreEnabled, setAutoScoreEnabled] = useState(false)
  useEffect(() => {
    if (!isCompanyConfigured()) return
    if (isWriterConfigured(getApiConfig())) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- eenmalige init na mount
      setAutoScoreEnabled(true)
      return
    }
    let cancelled = false
    void fetchWriterStatus().then((writerStatus) => {
      if (!cancelled && writerStatus.available) setAutoScoreEnabled(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  /** Alleen scores die bij het huidige bedrijfsprofiel horen. */
  const validScores = useMemo(() => {
    const result: Record<string, StoredTenderScore> = {}
    for (const [id, score] of Object.entries(scores)) {
      if (score.profileStamp === profileStamp) result[id] = score
    }
    return result
  }, [scores, profileStamp])

  const baseItems = mode === 'voorselectie' ? (preselection?.items ?? []) : items
  const cpvOptions = useMemo(() => collectCpvCodes(baseItems), [baseItems])

  const refreshSaved = () => {
    const saved = getSavedTenders()
    setSavedCount(saved.length)
    setSavedIds(new Set(saved.map((tender) => tender.publicatieId)))
    setSavedDocsById(Object.fromEntries(saved.map((tender) => [tender.publicatieId, tender.documents ?? []])))
    setSavedAtById(Object.fromEntries(saved.map((tender) => [tender.publicatieId, tender.savedAt])))
  }

  /** Werkt één tender bij in zowel de catalogus- als de voorselectielijst (en de opslag). */
  const patchItems = useCallback((updated: TenderListItem[]) => {
    if (!updated.length) return
    const byId = new Map(updated.map((item) => [item.publicatieId, item]))
    setItems((current) => current.map((row) => byId.get(row.publicatieId) ?? row))
    setPreselection((current) => {
      if (!current) return current
      if (!current.items.some((row) => byId.has(row.publicatieId))) return current
      const next = { ...current, items: current.items.map((row) => byId.get(row.publicatieId) ?? row) }
      updatePreselectionItems(updated)
      return next
    })
  }, [])

  // ── Stap 1: CPV-voorselectie ─────────────────────────────────────────────
  const scanningRef = useRef(false)
  const runPreselection = useCallback(async () => {
    if (!companyCpvCodes.length || scanningRef.current) return
    scanningRef.current = true
    setScanning(true)
    setMode('voorselectie')
    setStatus(`Stap 1 — voorselectie op CPV-codes van ${companyName} ophalen uit TenderNed…`)
    try {
      const result = await runCpvPreselection(companyCpvCodes, {
        onlyOpen: true,
        onProgress: (progress) => {
          setScanProgress(progress)
          setStatus(`Stap 1 — voorselectie op CPV-codes: ${scanProgressLabel(progress)}…`)
        },
      })
      setPreselection(result)
      setListPage(0)
      setSelected(new Set())
      const extra = result.totalMatches > result.items.length ? ` (van ${result.totalMatches.toLocaleString('nl-NL')} treffers in TenderNed; de nieuwste ${result.items.length} zijn opgehaald)` : ''
      setStatus(
        result.items.length
          ? `Stap 1 klaar: ${result.items.length} open tender(s) binnen ${result.cpvCodes.length} CPV-code(s)${extra}. Stap 2 — AI-score — volgt voor tenders zonder score.`
          : `Geen open tenders gevonden binnen de ${result.cpvCodes.length} CPV-code(s) van ${companyName}.`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Voorselectie ophalen mislukt.')
    } finally {
      scanningRef.current = false
      setScanning(false)
      setScanProgress(null)
    }
  }, [companyCpvCodes, companyName])

  const loadPage = useCallback(async (targetPage = 0) => {
    setLoading(true)
    setStatus('Aanbestedingen ophalen...')
    try {
      const result = await fetchPublicationsPage(targetPage, 25)
      const enriched = cpvPrefix.trim() ? await enrichWithCpv(result.items) : result.items
      setItems(enriched)
      setTotalPages(result.totalPages)
      setTotalElements(result.totalElements)
      setPage(result.page)
      setScannedPages(1)
      setStatus(`${result.totalElements.toLocaleString('nl-NL')} publicaties in TenderNed (pagina ${result.page + 1}/${result.totalPages}).`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'TenderNed laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [cpvPrefix])

  // Eerste lading bij mount: met CPV-codes start (of hergebruikt) de
  // voorselectie; zonder CPV-codes toont de pagina de open catalogus.
  const mountedRef = useRef(false)
  useEffect(() => {
    if (mountedRef.current) return
    mountedRef.current = true
    if (mode === 'voorselectie') {
      const stored = getTenderPreselection()
      if (!stored || preselectionIsStale(stored, companyCpvCodes)) {
        void runPreselection()
      } else {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- eenmalige init na mount
        setStatus(
          `Voorselectie uit de database: ${stored.items.length} open tender(s) binnen ${stored.cpvCodes.length} CPV-code(s), gescand op ${formatDateTime(stored.scannedAt)}.`,
        )
      }
    } else {
      void loadPage(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bewust alleen bij mount
  }, [])

  const openCatalog = () => {
    setMode('catalogus')
    setSelected(new Set())
    if (!items.length) void loadPage(0)
  }

  const openPreselection = () => {
    setMode('voorselectie')
    setSelected(new Set())
    if (!preselection && companyCpvCodes.length) void runPreselection()
  }

  const runFilteredSearch = async () => {
    setMode('catalogus')
    setLoading(true)
    setStatus('Zoeken met CPV/tekstfilter...')
    try {
      const result = await searchPublications(
        { cpvPrefix, query, onlyOpen },
        { maxPages: cpvPrefix.trim() || query.trim() ? 20 : 3, pageSize: 50, targetMatches: 50 },
      )
      setItems(result.items)
      setTotalElements(result.totalElements)
      setScannedPages(result.scannedPages)
      setTotalPages(Math.ceil(result.totalElements / 25))
      setPage(0)
      setStatus(
        `${result.items.length} treffers na ${result.scannedPages} pagina('s) (${result.totalElements.toLocaleString('nl-NL')} totaal in catalogus).`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Zoeken mislukt.')
    } finally {
      setLoading(false)
    }
  }

  // CPV-codes staan niet op catalogus-lijstitems; bij het relevantiefilter
  // worden ze per item bijgeladen via de detail-endpoint (beperkte
  // parallelliteit, en de ref voorkomt herhaalde pogingen).
  const cpvAttemptedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (mode !== 'catalogus' || !onlyRelevant) return
    const missing = items.filter(
      (item) => !item.cpvCodes && !cpvAttemptedRef.current.has(item.publicatieId),
    )
    if (!missing.length) return
    missing.forEach((item) => cpvAttemptedRef.current.add(item.publicatieId))
    void mapWithConcurrency(missing, 4, async (item) => {
      try {
        const detail = await fetchPublicationDetail(item.publicatieId)
        patchItems([{ ...item, cpvCodes: detail.cpvCodes ?? [] }])
      } catch {
        patchItems([{ ...item, cpvCodes: [] }])
      }
    })
  }, [items, mode, onlyRelevant, patchItems])

  const pendingCpvCount = useMemo(
    () => (mode === 'catalogus' && onlyRelevant ? items.filter((item) => !item.cpvCodes).length : 0),
    [items, mode, onlyRelevant],
  )

  // ── Zichtbare lijst: filteren, sorteren, pagineren ───────────────────────
  const filteredItems = useMemo(() => {
    if (mode === 'catalogus') {
      return items.filter((item) => {
        if (!matchesFilters(item, { cpvPrefix: '', query: '', onlyOpen })) return false
        if (onlyRelevant && companyCpvCodes.length) {
          return matchesCompanyCpv(item.cpvCodes ?? [], companyCpvCodes)
        }
        return true
      })
    }
    const list = preselection?.items ?? []
    if (scoreFilter === 'alle') return list
    return list.filter((item) => {
      const score = validScores[item.publicatieId]
      if (scoreFilter === 'ongescoord') return !score
      if (!score) return false
      return score.score >= (scoreFilter === 'sterk' ? 70 : 40)
    })
  }, [mode, items, onlyOpen, onlyRelevant, companyCpvCodes, preselection, scoreFilter, validScores])

  const sortedItems = useMemo(
    () => (mode === 'voorselectie' ? sortTenders(filteredItems, sortKey, validScores) : filteredItems),
    [mode, filteredItems, sortKey, validScores],
  )

  const listPageCount = Math.max(1, Math.ceil(sortedItems.length / LIST_PAGE_SIZE))
  const safeListPage = Math.min(listPage, listPageCount - 1)
  const visibleItems = useMemo(
    () =>
      mode === 'voorselectie'
        ? sortedItems.slice(safeListPage * LIST_PAGE_SIZE, (safeListPage + 1) * LIST_PAGE_SIZE)
        : sortedItems,
    [mode, sortedItems, safeListPage],
  )

  const scoreSummary = useMemo(() => {
    const list = preselection?.items ?? []
    let scored = 0
    let strong = 0
    let partial = 0
    for (const item of list) {
      const score = validScores[item.publicatieId]
      if (!score) continue
      scored += 1
      if (score.score >= 70) strong += 1
      else if (score.score >= 40) partial += 1
    }
    return { total: list.length, scored, strong, partial, unscored: list.length - scored }
  }, [preselection, validScores])

  const toggleSelect = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allVisibleSelected =
    visibleItems.length > 0 && visibleItems.every((item) => selected.has(item.publicatieId))

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(visibleItems.map((item) => item.publicatieId)))
    }
  }

  const loadDocList = useCallback(async (id: string) => {
    setDocLists((current) => ({ ...current, [id]: 'loading' }))
    try {
      const docs = await fetchPublicationDocumentList(id)
      setDocLists((current) => ({ ...current, [id]: docs }))
    } catch {
      setDocLists((current) => ({ ...current, [id]: 'error' }))
    }
  }, [])

  // Documentenlijsten automatisch ophalen voor de zichtbare pagina, zodat per
  // kaart direct zichtbaar is hoeveel en welke documenten erbij horen.
  // Beperkte parallelliteit om de TenderNed-proxy niet te overvragen; de ref
  // voorkomt dubbele requests wanneer items opnieuw renderen.
  const requestedDocListsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const missing = visibleItems.filter((item) => !requestedDocListsRef.current.has(item.publicatieId))
    if (!missing.length) return
    missing.forEach((item) => requestedDocListsRef.current.add(item.publicatieId))
    void mapWithConcurrency(missing, 4, (item) => loadDocList(item.publicatieId))
  }, [visibleItems, loadDocList])

  const toggleExpand = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        if (!docLists[id]) void loadDocList(id)
      }
      return next
    })
  }

  const saveTender = async (id: string): Promise<SavedTender> => {
    setBusyIds((current) => new Set(current).add(id))
    try {
      const detail = await fetchPublicationDetail(id)
      return await downloadTenderToDatabase(detail)
    } finally {
      setBusyIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  const downloadSelected = async () => {
    if (!selected.size) return
    setLoading(true)
    const ids = [...selected]
    let done = 0
    let totalDocs = 0
    for (const id of ids) {
      try {
        const saved = await saveTender(id)
        totalDocs += saved.documents?.filter((doc) => doc.status === 'ok').length ?? 0
        done += 1
        setStatus(`Downloaden... ${done}/${ids.length} aanbestedingen, ${totalDocs} document(en).`)
      } catch {
        // sla mislukte over
      }
    }
    refreshSaved()
    setSelected(new Set())
    setLoading(false)
    setStatus(`${done} aanbesteding(en) en ${totalDocs} document(en) opgeslagen in lokale database.`)
  }

  const saveSingle = async (item: TenderListItem) => {
    try {
      const saved = await saveTender(item.publicatieId)
      const docCount = saved.documents?.filter((doc) => doc.status === 'ok').length ?? 0
      refreshSaved()
      setStatus(`Opgeslagen: ${item.aanbestedingNaam} (${docCount} document(en)).`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Opslaan mislukt.')
    }
  }

  // Eén klik: alle documenten downloaden, direct een project aanmaken en dat openen.
  const downloadAndOpen = async (item: TenderListItem) => {
    try {
      setStatus(`Alle documenten van "${item.aanbestedingNaam}" downloaden…`)
      const saved = await saveTender(item.publicatieId)
      refreshSaved()
      const projectId = createProjectFromTender(saved)
      router.push(`/projecten/${encodeURIComponent(projectId)}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Downloaden mislukt.')
    }
  }

  // ── Stap 2: AI-score ─────────────────────────────────────────────────────
  const runScoring = useCallback(
    async (targets: TenderListItem[], options: { auto?: boolean; force?: boolean } = {}) => {
      if (!targets.length) return
      const label = options.auto ? 'Stap 2 — AI-score bepalen' : 'AI-score berekenen'
      setScoring(true)
      setStatus(`${label}…`)
      try {
        // CPV-codes zijn het belangrijkste matchsignaal; in de voorselectie
        // zijn ze al bijgeladen, bij catalogus-items gebeurt dat hier.
        const enriched = await enrichWithCpv(targets)
        patchItems(enriched.filter((item, index) => item !== targets[index]))

        const result = await scoreTendersForCompany(enriched, {
          force: options.force,
          onProgress: ({ done, total }) => setStatus(`${label}… ${done}/${total} tenders.`),
        })
        setScores({ ...result.scores })
        const parts = [`${result.scored} gescoord`]
        if (result.fromCache) parts.push(`${result.fromCache} al bekend`)
        if (result.failed) parts.push(`${result.failed} mislukt`)
        setStatus(`${options.auto ? 'Stap 2 klaar' : 'AI-score klaar'}: ${parts.join(', ')}. Scores zijn opgeslagen.`)
      } catch (error) {
        const message = error instanceof Error ? error.message : `${label} mislukt.`
        if (options.auto) {
          // Niet blijven proberen (en de gebruiker niet spammen) als bijv. de
          // API-key of het bedrijfsprofiel ontbreekt.
          setAutoScoreEnabled(false)
          setStatus(`Automatisch scoren gepauzeerd: ${message}`)
        } else {
          setStatus(message)
        }
      } finally {
        setScoring(false)
      }
    },
    [patchItems],
  )

  // Stap 2 start pas als stap 1 (de CPV-voorselectie) klaar is, en alleen voor
  // tenders uit de voorselectie zonder geldige score. De ref voorkomt
  // herhaalde pogingen voor hetzelfde item. De catalogus wordt nooit
  // automatisch gescoord — dat kost onnodig AI-credits.
  const autoScoreAttemptedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (mode !== 'voorselectie' || !autoScoreEnabled || scoring || scanning || loading || !preselection) return
    const targets = preselection.items.filter((item) => {
      if (autoScoreAttemptedRef.current.has(item.publicatieId)) return false
      return !validScores[item.publicatieId]
    })
    if (!targets.length) return
    targets.forEach((item) => autoScoreAttemptedRef.current.add(item.publicatieId))
    void runScoring(targets, { auto: true })
  }, [mode, preselection, autoScoreEnabled, scoring, scanning, loading, validScores, runScoring])

  const scoreSelected = async () => {
    if (!selected.size || scoring) return
    const targets = baseItems.filter((item) => selected.has(item.publicatieId))
    await runScoring(targets, { force: true })
  }

  const scoreMissing = async () => {
    if (!preselection || scoring) return
    const targets = preselection.items.filter((item) => !validScores[item.publicatieId])
    if (!targets.length) {
      setStatus('Alle tenders in de voorselectie hebben al een score.')
      return
    }
    await runScoring(targets)
  }

  const syncNeon = async () => {
    const result = await syncPendingTendersToNeon()
    refreshSaved()
    setStatus(result.message)
  }

  const loadCpv = async (id: string) => {
    setBusyIds((current) => new Set(current).add(id))
    try {
      const detail = await fetchPublicationDetail(id)
      const current = baseItems.find((row) => row.publicatieId === id)
      if (current) patchItems([{ ...current, cpvCodes: detail.cpvCodes }])
    } finally {
      setBusyIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  const busy = loading || scanning

  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <Link
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        href="/"
      >
        <ArrowLeft size={16} /> <span className="sr-only sm:not-sr-only">Terug naar projecten</span>
      </Link>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Library size={18} />
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate font-semibold">Tenders ophalen</h1>
            <div className="truncate text-sm text-muted-foreground">
              Voorselectie op CPV-codes, AI-score en downloaden incl. documenten (TenderNed TNS)
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            onClick={() => (mode === 'voorselectie' ? runPreselection() : loadPage(0))}
            disabled={busy || (mode === 'voorselectie' && !companyCpvCodes.length)}
            title={mode === 'voorselectie' ? 'Voorselectie opnieuw ophalen uit TenderNed (al gescoorde tenders houden hun score)' : 'Catalogus opnieuw laden'}
          >
            {scanning ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            <span className="sr-only sm:not-sr-only">{mode === 'voorselectie' ? 'Ververs voorselectie' : 'Ververs lijst'}</span>
          </Button>
          <Button variant="outline" onClick={syncNeon}>
            <Database size={16} /> <span className="sr-only sm:not-sr-only">Sync Neon</span> ({savedCount})
          </Button>
          <ModeToggle />
        </div>
      </header>
      <p className="mb-4 text-sm text-muted-foreground">
        Bron:{' '}
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href="https://data.overheid.nl/dataset/aankondigingen-van-overheidsopdrachten---tenderned"
          target="_blank"
          rel="noreferrer"
        >
          Aankondigingen van overheidsopdrachten (TenderNed)
        </a>
        {' '}via de publieke TNS-webservice.
      </p>

      {/* ── Voorselectie-paneel ─────────────────────────────────────────── */}
      <Card className="mb-3.5">
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={17} />
              <h2 className="text-lg font-semibold">Voorselectie voor {companyName}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={mode === 'voorselectie' ? 'default' : 'outline'}
                size="sm"
                onClick={openPreselection}
                disabled={!companyCpvCodes.length && !preselection}
                title={
                  companyCpvCodes.length
                    ? 'Toon de voorselectie op basis van de bedrijfs-CPV-codes'
                    : 'Stel eerst CPV-codes in bij Configuratie → CPV-codes.'
                }
              >
                <Sparkles size={15} /> Voorselectie
              </Button>
              <Button variant={mode === 'catalogus' ? 'default' : 'outline'} size="sm" onClick={openCatalog}>
                <Search size={15} /> Vrij zoeken in catalogus
              </Button>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Stap 1</strong> haalt puur op CPV-codes alle open tenders uit TenderNed
            (geen AI). <strong className="text-foreground">Stap 2</strong> geeft elke tender uit die lijst een
            AI-score (0-100) met onderbouwing. Beide resultaten worden in de database bewaard, dus terugkeren en
            bladeren is direct en kost geen nieuwe AI-credits.
          </p>

          {companyCpvCodes.length ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">
                CPV-codes van {companyName} (inclusief onderliggende codes):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {companyCpvCodes.map((cpv) => (
                  <button
                    key={cpv.code}
                    className={cn(
                      'max-w-full break-words rounded-full border px-2 py-0.5 text-left text-xs transition-colors',
                      cpvPrefix.trim() && cpvSignificantPrefix(cpv.code) === cpvSignificantPrefix(cpvPrefix)
                        ? 'border-primary bg-primary/10 font-medium text-primary'
                        : 'border-primary/40 bg-primary/5 text-primary hover:bg-primary/10',
                    )}
                    title={`Zoek in de catalogus op ${cpv.code} en alle onderliggende codes`}
                    onClick={() => {
                      setCpvPrefix(cpv.code.slice(0, 8))
                      setMode('catalogus')
                    }}
                  >
                    {cpv.code}
                    {cpv.omschrijving ? ` — ${cpv.omschrijving}` : ''}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Er zijn nog geen CPV-codes ingesteld voor {companyName}. Ga naar{' '}
              <Link className="underline underline-offset-2 hover:text-foreground" href="/configuratie">
                Configuratie → CPV-codes
              </Link>{' '}
              om de voorselectie te kunnen draaien; tot die tijd kun je vrij zoeken in de catalogus.
            </p>
          )}

          {mode === 'voorselectie' ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border bg-muted/40 p-2.5">
                  <div className="text-xs text-muted-foreground">Stap 1 · CPV-voorselectie</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {scanning ? <LoaderCircle size={18} className="inline animate-spin" /> : scoreSummary.total}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">open tender(s)</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {preselection ? `gescand ${formatDateTime(preselection.scannedAt)}` : scanning ? scanProgressLabel(scanProgress) || 'bezig…' : 'nog niet gescand'}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/40 p-2.5">
                  <div className="text-xs text-muted-foreground">Stap 2 · AI-score</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {scoreSummary.scored}
                    <span className="text-xs font-normal text-muted-foreground"> / {scoreSummary.total} gescoord</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {scoring ? (
                      <span className="inline-flex items-center gap-1"><LoaderCircle size={12} className="animate-spin" /> bezig…</span>
                    ) : scoreSummary.unscored ? (
                      `${scoreSummary.unscored} nog zonder score`
                    ) : scoreSummary.total ? (
                      'compleet'
                    ) : (
                      '—'
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5">
                  <div className="text-xs text-muted-foreground">Sterke match (≥ 70)</div>
                  <div className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{scoreSummary.strong}</div>
                  <button
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => {
                      setScoreFilter(scoreFilter === 'sterk' ? 'alle' : 'sterk')
                      setListPage(0)
                    }}
                  >
                    {scoreFilter === 'sterk' ? 'filter uitzetten' : 'alleen deze tonen'}
                  </button>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
                  <div className="text-xs text-muted-foreground">Deels passend (40-69)</div>
                  <div className="text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">{scoreSummary.partial}</div>
                  <button
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => {
                      setScoreFilter(scoreFilter === 'passend' ? 'alle' : 'passend')
                      setListPage(0)
                    }}
                  >
                    {scoreFilter === 'passend' ? 'filter uitzetten' : 'toon ≥ 40'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tender-sort" className="flex items-center gap-1 text-xs">
                    <ArrowUpDown size={13} /> Sorteren op
                  </Label>
                  <Select value={sortKey} onValueChange={(value) => setSortKey(value as TenderSortKey)}>
                    <SelectTrigger id="tender-sort" className="w-[260px]" aria-label="Sorteren op">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TENDER_SORT_OPTIONS.map((option) => (
                        <SelectItem key={option.key} value={option.key}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tender-score-filter" className="text-xs">Toon</Label>
                  <Select
                    value={scoreFilter}
                    onValueChange={(value) => {
                      setScoreFilter(value as ScoreFilter)
                      setListPage(0)
                    }}
                  >
                    <SelectTrigger id="tender-score-filter" className="w-[200px]" aria-label="Scorefilter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alle">Alle tenders</SelectItem>
                      <SelectItem value="sterk">Sterke match (≥ 70)</SelectItem>
                      <SelectItem value="passend">Passend (≥ 40)</SelectItem>
                      <SelectItem value="ongescoord">Nog zonder score</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  onClick={scoreMissing}
                  disabled={scoring || busy || !scoreSummary.unscored}
                  title="Scoor alleen de tenders die nog geen score hebben"
                >
                  {scoring ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  Scoor {scoreSummary.unscored ? `${scoreSummary.unscored} ` : ''}ontbrekende
                </Button>
              </div>
            </>
          ) : null}

          <p className="text-sm text-muted-foreground">{status}</p>
        </CardContent>
      </Card>

      {/* ── Catalogus: vrij zoeken ───────────────────────────────────────── */}
      {mode === 'catalogus' ? (
        <Card className="mb-3.5">
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Filter size={17} />
              <h2 className="text-lg font-semibold">Vrij zoeken in de catalogus</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
              <div className="space-y-2">
                <Label htmlFor="cpv-prefix">CPV-code (prefix)</Label>
                <Input
                  id="cpv-prefix"
                  placeholder="bijv. 45210000"
                  value={cpvPrefix}
                  onChange={(event) => setCpvPrefix(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && runFilteredSearch()}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="query">Zoekterm</Label>
                <Input
                  id="query"
                  placeholder="Titel, opdrachtgever, omschrijving"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && runFilteredSearch()}
                />
              </div>
              <div className="flex flex-col gap-2 md:pb-2.5">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={onlyOpen}
                    onCheckedChange={(checked) => setOnlyOpen(checked === true)}
                  />
                  Alleen openstaande inschrijvingen
                </label>
                <label
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    !companyCpvCodes.length && 'cursor-not-allowed opacity-60',
                  )}
                  title={
                    companyCpvCodes.length
                      ? `Toont alleen tenders waarvan de CPV-codes matchen met de ${companyCpvCodes.length} CPV-code(s) van ${companyName}.`
                      : 'Stel eerst CPV-codes in bij Configuratie → CPV-codes om op relevantie te filteren.'
                  }
                >
                  <Checkbox
                    checked={onlyRelevant}
                    disabled={!companyCpvCodes.length}
                    onCheckedChange={(checked) => setOnlyRelevant(checked === true)}
                  />
                  Alleen relevant voor {companyName}
                </label>
              </div>
            </div>
            {onlyRelevant && pendingCpvCount > 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <LoaderCircle size={13} className="animate-spin" /> CPV-codes laden voor {pendingCpvCount}{' '}
                aanbesteding(en) — de lijst vult zich terwijl dit loopt.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={runFilteredSearch} disabled={busy}>
                <Search size={16} />
                Zoek in catalogus
              </Button>
              <Button variant="outline" onClick={() => loadPage(page)} disabled={busy}>
                Toon pagina {page + 1}
              </Button>
            </div>
            {cpvOptions.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Codes uit de geladen resultaten (ter oriëntatie):</p>
                <div className="flex flex-wrap gap-1.5">
                  {cpvOptions.slice(0, 12).map((cpv) => (
                    <button
                      key={cpv.code}
                      className="max-w-full break-words rounded-full border bg-muted px-2 py-0.5 text-left text-xs text-muted-foreground hover:bg-accent"
                      onClick={() => setCpvPrefix(cpv.code.slice(0, 8))}
                    >
                      {cpv.code} — {cpv.omschrijving}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              In de catalogus wordt niet automatisch gescoord; selecteer tenders en kies &ldquo;Scoor met AI&rdquo;.
              {scannedPages ? ` (${scannedPages} pagina('s) gescand)` : ''}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <section className="sticky top-0 z-[5] mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <Checkbox
              checked={allVisibleSelected ? true : selected.size > 0 ? 'indeterminate' : false}
              onCheckedChange={toggleSelectAll}
              disabled={!visibleItems.length}
            />
            Selecteer alles
          </label>
          <span className="text-sm text-muted-foreground">
            <strong>{selected.size}</strong> geselecteerd · <strong>{visibleItems.length}</strong> zichtbaar
            {mode === 'voorselectie' && sortedItems.length > visibleItems.length
              ? ` van ${sortedItems.length}`
              : ''}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {selected.size > 0 ? (
            <Button variant="ghost" onClick={() => setSelected(new Set())} disabled={busy}>
              <X size={15} /> Wis selectie
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={scoreSelected}
            disabled={!selected.size || scoring || busy}
            title="Laat AI de geselecteerde tenders (opnieuw) scoren (0-100) op hoe goed ze bij het bedrijfsprofiel passen"
          >
            {scoring ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Scoor {selected.size > 0 ? `${selected.size} ` : ''}met AI
          </Button>
          <Button
            onClick={downloadSelected}
            disabled={!selected.size || busy}
            title="Downloadt de geselecteerde tenders inclusief álle bijbehorende documenten (met tekstextractie) naar de lokale database"
          >
            {loading ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}
            Download {selected.size > 0 ? `${selected.size} ` : ''}incl. documenten
          </Button>
        </div>
      </section>

      <section className="grid gap-2.5">
        {visibleItems.map((item) => {
          const isSelected = selected.has(item.publicatieId)
          const isBusy = busyIds.has(item.publicatieId)
          const isSaved = savedIds.has(item.publicatieId)
          const isExpanded = expanded.has(item.publicatieId)
          const docState = docLists[item.publicatieId]
          const isOpen = item.aantalDagenTotSluitingsDatum >= 0
          const score = validScores[item.publicatieId]
          return (
            <Card
              key={item.publicatieId}
              className={cn(
                'cursor-pointer flex-row items-start gap-3 p-3.5 transition-colors hover:border-ring',
                isSelected && 'border-primary bg-accent ring-2 ring-ring/30',
              )}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('a, button, input') ||
                  (event.target as HTMLElement).closest('[role="checkbox"]')) return
                toggleSelect(item.publicatieId)
              }}
            >
              <label
                className="flex cursor-pointer items-start pt-0.5"
                onClick={(event) => event.stopPropagation()}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleSelect(item.publicatieId)}
                />
              </label>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2.5">
                  <strong className="min-w-0 break-words">{item.aanbestedingNaam}</strong>
                  <Badge
                    variant={isOpen ? 'default' : 'secondary'}
                    className="shrink-0 whitespace-nowrap rounded-full"
                  >
                    {isOpen ? `${item.aantalDagenTotSluitingsDatum} dagen` : 'Gesloten'}
                  </Badge>
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-1 break-words text-sm text-muted-foreground">
                  <span>
                    {item.opdrachtgeverNaam} · TN-{item.kenmerk}
                    {item.publicatieDatum ? ` · gepubliceerd ${formatDate(item.publicatieDatum)}` : ''}
                    {` · sluit ${formatDate(item.sluitingsDatum)}`}
                  </span>
                  {item.typePublicatie && !/aankondiging van een opdracht/i.test(item.typePublicatie) ? (
                    <Badge variant="outline" className="ml-2 rounded-full text-xs font-normal">
                      {item.typePublicatie}
                    </Badge>
                  ) : null}
                  {Array.isArray(docState) ? (
                    <Badge variant="outline" className="ml-2 gap-1 rounded-full text-xs font-normal">
                      <FileText size={12} /> {docState.length} document{docState.length === 1 ? '' : 'en'}
                    </Badge>
                  ) : null}
                  {isSaved ? (
                    <Badge
                      variant="outline"
                      className="ml-2 gap-1 rounded-full text-xs font-normal"
                      title={
                        savedAtById[item.publicatieId]
                          ? `Gedownload op ${formatDateTime(savedAtById[item.publicatieId])}`
                          : undefined
                      }
                    >
                      <CheckCircle2 size={13} /> opgeslagen
                      {savedAtById[item.publicatieId] ? ` ${formatDate(savedAtById[item.publicatieId])}` : ''}
                    </Badge>
                  ) : null}
                </p>
                {item.fetchedAt ? (
                  <p className="mt-0.5 text-xs text-muted-foreground/80">
                    Opgehaald uit TenderNed op {formatDateTime(item.fetchedAt)}
                  </p>
                ) : null}
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.opdrachtBeschrijving.slice(0, 220)}{item.opdrachtBeschrijving.length > 220 ? '...' : ''}</p>
                {score ? (
                  <div
                    className={cn(
                      'mt-2.5 flex items-start gap-2 rounded-lg border p-2.5 text-xs leading-relaxed',
                      scoreTier(score.score).panel,
                    )}
                    title={`Gescoord op ${formatDateTime(score.scoredAt)}`}
                  >
                    <Sparkles size={14} className={cn('mt-0.5 shrink-0', scoreTier(score.score).text)} />
                    <span className="min-w-0 break-words">
                      <span className={cn('font-semibold', scoreTier(score.score).text)}>
                        AI-match: {scoreTier(score.score).label}
                      </span>
                      {score.toelichting ? <> — {score.toelichting}</> : null}
                    </span>
                  </div>
                ) : null}
                {item.cpvCodes?.length ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {item.cpvCodes.slice(0, 4).map((cpv) => {
                      const matchesCompany =
                        companyCpvCodes.length > 0 && matchesCompanyCpv([cpv], companyCpvCodes)
                      return (
                        <Badge
                          key={cpv.code}
                          variant={matchesCompany || cpv.isHoofdOpdracht ? 'default' : 'secondary'}
                          className={cn(
                            'break-all rounded-full font-normal',
                            matchesCompany && 'ring-2 ring-primary/40',
                          )}
                          title={
                            matchesCompany
                              ? `Valt binnen de CPV-codes van ${companyName}`
                              : cpv.omschrijving
                          }
                        >
                          {cpv.code}
                        </Badge>
                      )
                    })}
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    disabled={isBusy}
                    onClick={() => loadCpv(item.publicatieId)}
                  >
                    CPV laden
                  </Button>
                )}

                <div className="mt-3 flex items-center gap-2.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleExpand(item.publicatieId)}
                  >
                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <FileText size={14} /> Documenten{Array.isArray(docState) ? ` (${docState.length})` : ''}
                  </Button>
                  {docState === 'loading' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <LoaderCircle size={13} className="animate-spin" /> documenten tellen…
                    </span>
                  ) : null}
                  {item.link ? (
                    <a
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={13} /> TenderNed
                    </a>
                  ) : null}
                </div>

                {!isExpanded && Array.isArray(docState) ? (
                  <p className="mt-1.5 break-words text-xs text-muted-foreground">
                    {docState.length
                      ? `${docState
                          .slice(0, 3)
                          .map((doc) => doc.documentNaam)
                          .join(' · ')}${docState.length > 3 ? ` · +${docState.length - 3} meer` : ''}`
                      : 'Geen losse documenten bij deze publicatie.'}
                  </p>
                ) : null}

                {isExpanded ? (
                  <div className="mt-2.5 rounded-lg border bg-muted/40 p-3">
                    {isSaved && savedDocsById[item.publicatieId]?.length ? (
                      <>
                        <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                          {savedDocsById[item.publicatieId].length} document(en) gearchiveerd — tekst geëxtraheerd voor de werkplek.
                        </p>
                        <ul className="grid list-none gap-1 p-0">
                          {savedDocsById[item.publicatieId].map((doc, index) => (
                            <li
                              key={`${doc.naam}-${index}`}
                              className="grid grid-cols-[44px_minmax(0,1fr)_auto_auto] items-center gap-2 border-t py-1 text-xs first:border-t-0"
                            >
                              <span className="shrink-0 rounded bg-muted px-0 py-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{doc.type}</span>
                              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" title={doc.note ? `${doc.naam} — ${doc.note}` : doc.naam}>{doc.naam}</span>
                              <span
                                className={cn(
                                  'shrink-0 text-[10px] font-medium uppercase tracking-wide',
                                  doc.status === 'ok'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : doc.status === 'fout'
                                      ? 'text-destructive'
                                      : 'text-muted-foreground',
                                )}
                              >
                                {doc.status}
                              </span>
                              {doc.fileUrl ? (
                                <a
                                  className="inline-flex shrink-0 items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
                                  href={blobViewUrl(doc.fileUrl)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <ExternalLink size={12} /> Origineel
                                </a>
                              ) : (
                                <span className="shrink-0" />
                              )}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : docState === 'loading' ? (
                      <p className="m-0 flex items-center gap-1.5 text-xs text-muted-foreground"><LoaderCircle size={14} className="animate-spin" /> Documenten laden...</p>
                    ) : docState === 'error' ? (
                      <p className="m-0 flex items-center gap-1.5 text-xs text-destructive">Documentenlijst kon niet worden geladen.</p>
                    ) : docState && docState.length ? (
                      <>
                        <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">{docState.length} document(en) — worden allemaal gedownload bij opslaan.</p>
                        <ul className="grid list-none gap-1 p-0">
                          {docState.map((doc) => (
                            <li
                              key={doc.documentId}
                              className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 border-t py-1 text-xs first:border-t-0"
                            >
                              <span className="shrink-0 rounded bg-muted px-0 py-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{doc.type}</span>
                              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" title={doc.documentNaam}>{doc.documentNaam}</span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">{formatBytes(doc.grootte)}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="m-0 flex items-center gap-1.5 text-xs text-muted-foreground">Geen losse documenten bij deze publicatie.</p>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-1.5" onClick={(event) => event.stopPropagation()}>
                {score ? (
                  <div
                    className="mb-1 flex flex-col items-center gap-1"
                    title={score.toelichting || 'AI-geschiktheidsscore voor het bedrijfsprofiel'}
                  >
                    <ScoreRing score={score.score} />
                    <span
                      className={cn(
                        'text-[10px] font-semibold uppercase tracking-wide',
                        scoreTier(score.score).text,
                      )}
                    >
                      {scoreTier(score.score).label}
                    </span>
                  </div>
                ) : null}
                <Button
                  size="sm"
                  title="Alle documenten downloaden en direct als project openen"
                  disabled={isBusy}
                  onClick={() => downloadAndOpen(item)}
                >
                  {isBusy ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                  Maak project
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Alleen downloaden naar database (later openen)"
                  disabled={isBusy}
                  onClick={() => saveSingle(item)}
                >
                  {isSaved ? <CheckCircle2 size={15} /> : <BookmarkCheck size={15} />}
                  {isSaved ? 'Opgeslagen' : 'Alleen opslaan'}
                </Button>
              </div>
            </Card>
          )
        })}
        {!visibleItems.length && !busy ? (
          <p className="text-sm text-muted-foreground">
            {mode === 'voorselectie'
              ? scoreFilter !== 'alle'
                ? 'Geen tenders binnen dit scorefilter. Zet het filter op "Alle tenders".'
                : companyCpvCodes.length
                  ? 'Geen open tenders in de voorselectie. Ververs de voorselectie of controleer de CPV-codes bij Configuratie.'
                  : 'Stel CPV-codes in bij Configuratie om een voorselectie te maken.'
              : 'Geen resultaten. Pas CPV-filter aan of laad een pagina.'}
          </p>
        ) : null}
      </section>

      <footer className="mt-4 flex items-center justify-center gap-3.5">
        {mode === 'voorselectie' ? (
          <>
            <Button variant="outline" disabled={safeListPage <= 0} onClick={() => setListPage(safeListPage - 1)}>
              Vorige
            </Button>
            <span className="text-sm text-muted-foreground">
              {sortedItems.length} tender(s) · Pagina {safeListPage + 1} / {listPageCount}
            </span>
            <Button
              variant="outline"
              disabled={safeListPage >= listPageCount - 1}
              onClick={() => setListPage(safeListPage + 1)}
            >
              Volgende
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" disabled={page <= 0 || busy} onClick={() => loadPage(page - 1)}>
              Vorige
            </Button>
            <span className="text-sm text-muted-foreground">{totalElements ? `${totalElements.toLocaleString('nl-NL')} totaal · ` : ''}Pagina {page + 1} / {totalPages.toLocaleString('nl-NL') || '?'}</span>
            <Button variant="outline" disabled={page >= totalPages - 1 || busy} onClick={() => loadPage(page + 1)}>
              Volgende
            </Button>
          </>
        )}
      </footer>
    </main>
  )
}
