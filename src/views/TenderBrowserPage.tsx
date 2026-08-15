'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
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
import { mapWithConcurrency } from '../lib/analyzeDocumentApi'
import { currentProfileStamp, getTenderScores, scoreTendersForCompany } from '../lib/tenderScoreApi'
import { matchesCompanyCpv } from '../lib/cpv'
import { getCompanyConfig } from '../lib/companyConfig'
import type { SavedTenderDocument, TenderDocument, TenderListItem } from '../types/tenderNed'
import type { StoredTenderScore } from '../types/tenderScore'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ModeToggle } from '@/components/mode-toggle'
import { cn } from '@/lib/utils'

type DocListState = TenderDocument[] | 'loading' | 'error'

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

export default function TenderBrowserPage() {
  const router = useRouter()
  const [items, setItems] = useState<TenderListItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [cpvPrefix, setCpvPrefix] = useState('')
  const [query, setQuery] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(true)
  const [loading, setLoading] = useState(false)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState('Laad de TenderNed-catalogus via de publieke TNS-webservice.')
  const [savedCount, setSavedCount] = useState(() => getSavedTenders().length)
  const [savedIds, setSavedIds] = useState<Set<string>>(
    () => new Set(getSavedTenders().map((tender) => tender.publicatieId)),
  )
  const [savedDocsById, setSavedDocsById] = useState<Record<string, SavedTenderDocument[]>>(
    () => Object.fromEntries(getSavedTenders().map((tender) => [tender.publicatieId, tender.documents ?? []])),
  )
  const [scannedPages, setScannedPages] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [docLists, setDocLists] = useState<Record<string, DocListState>>({})
  const [scores, setScores] = useState<Record<string, StoredTenderScore>>(() => getTenderScores())
  const [scoring, setScoring] = useState(false)
  // Scores van een ouder bedrijfsprofiel worden verborgen; opnieuw scoren ververst ze.
  const profileStamp = useMemo(() => currentProfileStamp(), [])
  // Relevantiefilter: toon alleen tenders waarvan de CPV-codes matchen met de
  // CPV-codes van het actieve bedrijf (ingesteld in de bedrijfsconfiguratie).
  const [onlyRelevant, setOnlyRelevant] = useState(false)
  const companyConfig = useMemo(() => getCompanyConfig(), [])
  const companyCpvCodes = companyConfig.cpvCodes

  const cpvOptions = useMemo(() => collectCpvCodes(items), [items])

  const refreshSaved = () => {
    const saved = getSavedTenders()
    setSavedCount(saved.length)
    setSavedIds(new Set(saved.map((tender) => tender.publicatieId)))
    setSavedDocsById(Object.fromEntries(saved.map((tender) => [tender.publicatieId, tender.documents ?? []])))
  }

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

  useEffect(() => {
    // Initiële catalogus-lading bij mount (TNS-webservice).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch na mount is bedoeld
    void loadPage(0)
  }, [loadPage])

  const runFilteredSearch = async () => {
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

  // CPV-codes staan niet op lijstitems; bij het relevantiefilter worden ze per
  // item bijgeladen via de detail-endpoint (beperkte parallelliteit, en de ref
  // voorkomt herhaalde pogingen). Items zonder CPV-registratie krijgen na de
  // poging een lege lijst, zodat de laadteller niet blijft hangen.
  const cpvAttemptedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!onlyRelevant) return
    const missing = items.filter(
      (item) => !item.cpvCodes && !cpvAttemptedRef.current.has(item.publicatieId),
    )
    if (!missing.length) return
    missing.forEach((item) => cpvAttemptedRef.current.add(item.publicatieId))
    void mapWithConcurrency(missing, 4, async (item) => {
      try {
        const detail = await fetchPublicationDetail(item.publicatieId)
        setItems((current) =>
          current.map((row) =>
            row.publicatieId === item.publicatieId ? { ...row, cpvCodes: detail.cpvCodes ?? [] } : row,
          ),
        )
      } catch {
        setItems((current) =>
          current.map((row) => (row.publicatieId === item.publicatieId ? { ...row, cpvCodes: [] } : row)),
        )
      }
    })
  }, [items, onlyRelevant])

  const pendingCpvCount = useMemo(
    () => (onlyRelevant ? items.filter((item) => !item.cpvCodes).length : 0),
    [items, onlyRelevant],
  )

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (!matchesFilters(item, { cpvPrefix: '', query: '', onlyOpen })) return false
        if (onlyRelevant && companyCpvCodes.length) {
          return matchesCompanyCpv(item.cpvCodes ?? [], companyCpvCodes)
        }
        return true
      }),
    [items, onlyOpen, onlyRelevant, companyCpvCodes],
  )

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

  // Documentenlijsten automatisch ophalen zodra publicaties geladen zijn, zodat
  // per kaart direct zichtbaar is hoeveel en welke documenten erbij horen.
  // Beperkte parallelliteit om de TenderNed-proxy niet te overvragen; de ref
  // voorkomt dubbele requests wanneer items opnieuw renderen.
  const requestedDocListsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const missing = items.filter((item) => !requestedDocListsRef.current.has(item.publicatieId))
    if (!missing.length) return
    missing.forEach((item) => requestedDocListsRef.current.add(item.publicatieId))
    void mapWithConcurrency(missing, 4, (item) => loadDocList(item.publicatieId))
  }, [items, loadDocList])

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

  const saveTender = async (id: string): Promise<number> => {
    setBusyIds((current) => new Set(current).add(id))
    try {
      const detail = await fetchPublicationDetail(id)
      const saved = await downloadTenderToDatabase(detail)
      return saved.documents?.filter((doc) => doc.status === 'ok').length ?? 0
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
        totalDocs += await saveTender(id)
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
      const docCount = await saveTender(item.publicatieId)
      refreshSaved()
      setStatus(`Opgeslagen: ${item.aanbestedingNaam} (${docCount} document(en)).`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Opslaan mislukt.')
    }
  }

  // Eén klik: alle documenten downloaden én meteen het dossier openen in de werkplek.
  const downloadAndOpen = async (item: TenderListItem) => {
    try {
      setStatus(`Alle documenten van "${item.aanbestedingNaam}" downloaden…`)
      await saveTender(item.publicatieId)
      refreshSaved()
      router.push(`/?open=${encodeURIComponent(item.publicatieId)}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Downloaden mislukt.')
    }
  }

  const scoreSelected = async () => {
    if (!selected.size || scoring) return
    const targets = items.filter((item) => selected.has(item.publicatieId))
    if (!targets.length) return
    setScoring(true)
    setStatus('AI-score berekenen…')
    try {
      // CPV-codes zijn het belangrijkste matchsignaal, maar ontbreken op
      // lijstitems; eerst bijladen via de detail-endpoint.
      const enriched = await enrichWithCpv(targets)
      const byId = new Map(enriched.map((item) => [item.publicatieId, item]))
      setItems((current) => current.map((row) => byId.get(row.publicatieId) ?? row))

      const result = await scoreTendersForCompany(enriched, {
        onProgress: ({ done, total }) => setStatus(`AI-score berekenen… ${done}/${total} tenders.`),
      })
      setScores({ ...result.scores })
      const parts = [`${result.scored} gescoord`]
      if (result.fromCache) parts.push(`${result.fromCache} uit cache`)
      if (result.failed) parts.push(`${result.failed} mislukt`)
      setStatus(`AI-score klaar: ${parts.join(', ')}.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'AI-score berekenen mislukt.')
    } finally {
      setScoring(false)
    }
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
      setItems((current) =>
        current.map((row) => (row.publicatieId === id ? { ...row, cpvCodes: detail.cpvCodes } : row)),
      )
    } finally {
      setBusyIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <Link
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        href="/"
      >
        <ArrowLeft size={16} /> <span className="sr-only sm:not-sr-only">Terug naar werkplek</span>
      </Link>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Library size={18} />
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate font-semibold">TenderNed catalogus</h1>
            <div className="truncate text-sm text-muted-foreground">Publieke TNS-webservice</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={() => loadPage(0)} disabled={loading}>
            <RefreshCw size={16} /> <span className="sr-only sm:not-sr-only">Ververs lijst</span>
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

      <Card className="mb-3.5">
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Filter size={17} />
            <h2 className="text-lg font-semibold">Zoeken &amp; voorselectie</h2>
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
                    ? `Toont alleen tenders waarvan de CPV-codes matchen met de ${companyCpvCodes.length} CPV-code(s) van ${companyConfig.name || 'het actieve bedrijf'}.`
                    : 'Stel eerst CPV-codes in bij Configuratie → CPV-codes om op relevantie te filteren.'
                }
              >
                <Checkbox
                  checked={onlyRelevant}
                  disabled={!companyCpvCodes.length}
                  onCheckedChange={(checked) => setOnlyRelevant(checked === true)}
                />
                Alleen relevant voor {companyConfig.name.trim() || 'mijn bedrijf'}
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
            <Button onClick={runFilteredSearch} disabled={loading}>
              {loading ? <LoaderCircle size={16} className="animate-spin" /> : <Search size={16} />}
              Zoek in catalogus
            </Button>
            <Button variant="outline" onClick={() => loadPage(page)} disabled={loading}>
              Toon pagina {page + 1}
            </Button>
          </div>
          {cpvOptions.length > 0 ? (
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
          ) : null}
          <p className="text-sm text-muted-foreground">{status}{scannedPages ? ` (${scannedPages} pagina('s) gescand)` : ''}</p>
        </CardContent>
      </Card>

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
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {selected.size > 0 ? (
            <Button variant="ghost" onClick={() => setSelected(new Set())} disabled={loading}>
              <X size={15} /> Wis selectie
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={scoreSelected}
            disabled={!selected.size || scoring || loading}
            title="Laat AI per geselecteerde tender scoren (0-100) hoe goed die past bij het bedrijfsprofiel"
          >
            {scoring ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Scoor {selected.size > 0 ? `${selected.size} ` : ''}met AI
          </Button>
          <Button onClick={downloadSelected} disabled={!selected.size || loading}>
            {loading ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}
            Download {selected.size > 0 ? `${selected.size} ` : ''}naar database
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
          const rawScore = scores[item.publicatieId]
          const score = rawScore && rawScore.profileStamp === profileStamp ? rawScore : undefined
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
                  <span className="flex shrink-0 items-start gap-1.5">
                    {score ? (
                      <Badge
                        variant="outline"
                        title={score.toelichting || 'AI-geschiktheidsscore voor het bedrijfsprofiel'}
                        className={cn(
                          'whitespace-nowrap rounded-full font-semibold',
                          score.score >= 70
                            ? 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
                            : score.score >= 40
                              ? 'border-amber-500/50 text-amber-600 dark:text-amber-400'
                              : 'border-destructive/50 text-destructive',
                        )}
                      >
                        <Sparkles size={12} /> {score.score}/100
                      </Badge>
                    ) : null}
                    <Badge
                      variant={isOpen ? 'default' : 'secondary'}
                      className="whitespace-nowrap rounded-full"
                    >
                      {isOpen ? `${item.aantalDagenTotSluitingsDatum} dagen` : 'Gesloten'}
                    </Badge>
                  </span>
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-1 break-words text-sm text-muted-foreground">
                  {item.opdrachtgeverNaam} · TN-{item.kenmerk} · sluit {formatDate(item.sluitingsDatum)}
                  {isSaved ? (
                    <Badge variant="outline" className="ml-2 gap-1 rounded-full text-xs font-normal">
                      <CheckCircle2 size={13} /> opgeslagen
                    </Badge>
                  ) : null}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.opdrachtBeschrijving.slice(0, 220)}{item.opdrachtBeschrijving.length > 220 ? '...' : ''}</p>
                {score?.toelichting ? (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                    <Sparkles size={13} className="mt-0.5 shrink-0" />
                    <span className="min-w-0 break-words">{score.toelichting}</span>
                  </p>
                ) : null}
                {item.cpvCodes?.length ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {item.cpvCodes.slice(0, 4).map((cpv) => (
                      <Badge
                        key={cpv.code}
                        variant={cpv.isHoofdOpdracht ? 'default' : 'secondary'}
                        className="break-all rounded-full font-normal"
                      >
                        {cpv.code}
                      </Badge>
                    ))}
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
                                  href={doc.fileUrl}
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
                <Button
                  size="sm"
                  title="Alle documenten downloaden en meteen openen in de werkplek"
                  disabled={isBusy}
                  onClick={() => downloadAndOpen(item)}
                >
                  {isBusy ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                  Download &amp; open
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
        {!visibleItems.length && !loading ? <p className="text-sm text-muted-foreground">Geen resultaten. Pas CPV-filter aan of laad een pagina.</p> : null}
      </section>

      <footer className="mt-4 flex items-center justify-center gap-3.5">
        <Button variant="outline" disabled={page <= 0 || loading} onClick={() => loadPage(page - 1)}>
          Vorige
        </Button>
        <span className="text-sm text-muted-foreground">{totalElements ? `${totalElements.toLocaleString('nl-NL')} totaal · ` : ''}Pagina {page + 1} / {totalPages.toLocaleString('nl-NL') || '?'}</span>
        <Button variant="outline" disabled={page >= totalPages - 1 || loading} onClick={() => loadPage(page + 1)}>
          Volgende
        </Button>
      </footer>
    </main>
  )
}
