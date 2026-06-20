import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  BookmarkCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  ExternalLink,
  FileText,
  Filter,
  LoaderCircle,
  RefreshCw,
  Search,
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
import type { TenderDocument, TenderListItem } from '../types/tenderNed'
import '../TenderBrowser.css'

type DocListState = TenderDocument[] | 'loading' | 'error'

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`
  return `${bytes} B`
}

export default function TenderBrowserPage() {
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
  const [scannedPages, setScannedPages] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [docLists, setDocLists] = useState<Record<string, DocListState>>({})

  const cpvOptions = useMemo(() => collectCpvCodes(items), [items])

  const refreshSaved = () => {
    const saved = getSavedTenders()
    setSavedCount(saved.length)
    setSavedIds(new Set(saved.map((tender) => tender.publicatieId)))
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

  const visibleItems = useMemo(
    () => items.filter((item) => matchesFilters(item, { cpvPrefix: '', query: '', onlyOpen })),
    [items, onlyOpen],
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
    <main className="tender-browser">
      <header className="tender-topbar">
        <div>
          <Link className="secondary tender-link" to="/">
            <ArrowLeft size={16} /> Terug naar werkplek
          </Link>
          <h1>TenderNed catalogus</h1>
          <p>
            Bron:{' '}
            <a href="https://data.overheid.nl/dataset/aankondigingen-van-overheidsopdrachten---tenderned" target="_blank" rel="noreferrer">
              Aankondigingen van overheidsopdrachten (TenderNed)
            </a>
            {' '}via de publieke TNS-webservice.
          </p>
        </div>
        <div className="tender-actions">
          <button className="secondary" onClick={() => loadPage(0)} disabled={loading}>
            <RefreshCw size={16} /> Ververs lijst
          </button>
          <button className="secondary" onClick={syncNeon}>
            <Database size={16} /> Sync Neon ({savedCount})
          </button>
        </div>
      </header>

      <section className="tender-filters panel">
        <div className="panel-heading">
          <Filter size={17} />
          <h2>Zoeken &amp; voorselectie</h2>
        </div>
        <div className="filter-grid">
          <label>
            CPV-code (prefix)
            <input
              placeholder="bijv. 45210000"
              value={cpvPrefix}
              onChange={(event) => setCpvPrefix(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && runFilteredSearch()}
            />
          </label>
          <label>
            Zoekterm
            <input
              placeholder="Titel, opdrachtgever, omschrijving"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && runFilteredSearch()}
            />
          </label>
          <label className="admin-toggle">
            <input type="checkbox" checked={onlyOpen} onChange={(event) => setOnlyOpen(event.target.checked)} />
            Alleen openstaande inschrijvingen
          </label>
        </div>
        <div className="filter-actions">
          <button className="primary" onClick={runFilteredSearch} disabled={loading}>
            {loading ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />}
            Zoek in catalogus
          </button>
          <button className="secondary" onClick={() => loadPage(page)} disabled={loading}>
            Toon pagina {page + 1}
          </button>
        </div>
        {cpvOptions.length > 0 ? (
          <div className="cpv-chips">
            {cpvOptions.slice(0, 12).map((cpv) => (
              <button key={cpv.code} className="cpv-chip" onClick={() => setCpvPrefix(cpv.code.slice(0, 8))}>
                {cpv.code} — {cpv.omschrijving}
              </button>
            ))}
          </div>
        ) : null}
        <p className="status">{status}{scannedPages ? ` (${scannedPages} pagina('s) gescand)` : ''}</p>
      </section>

      <section className="tender-toolbar">
        <div className="tender-toolbar-info">
          <label className="select-all">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              ref={(el) => {
                if (el) el.indeterminate = selected.size > 0 && !allVisibleSelected
              }}
              onChange={toggleSelectAll}
              disabled={!visibleItems.length}
            />
            Selecteer alles
          </label>
          <span className="tender-count">
            <strong>{selected.size}</strong> geselecteerd · <strong>{visibleItems.length}</strong> zichtbaar
          </span>
        </div>
        <div className="tender-toolbar-actions">
          {selected.size > 0 ? (
            <button className="ghost" onClick={() => setSelected(new Set())} disabled={loading}>
              <X size={15} /> Wis selectie
            </button>
          ) : null}
          <button className="primary" onClick={downloadSelected} disabled={!selected.size || loading}>
            {loading ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
            Download {selected.size > 0 ? `${selected.size} ` : ''}naar database
          </button>
        </div>
      </section>

      <section className="tender-list">
        {visibleItems.map((item) => {
          const isSelected = selected.has(item.publicatieId)
          const isBusy = busyIds.has(item.publicatieId)
          const isSaved = savedIds.has(item.publicatieId)
          const isExpanded = expanded.has(item.publicatieId)
          const docState = docLists[item.publicatieId]
          const isOpen = item.aantalDagenTotSluitingsDatum >= 0
          return (
            <article
              key={item.publicatieId}
              className={isSelected ? 'tender-card selected' : 'tender-card'}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('a, button, input')) return
                toggleSelect(item.publicatieId)
              }}
            >
              <label className="tender-select" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(item.publicatieId)}
                />
              </label>
              <div className="tender-body">
                <div className="tender-head">
                  <strong>{item.aanbestedingNaam}</strong>
                  <span className={`tender-status ${isOpen ? 'open' : 'closed'}`}>
                    {isOpen ? `${item.aantalDagenTotSluitingsDatum} dagen` : 'Gesloten'}
                  </span>
                </div>
                <p className="tender-meta">
                  {item.opdrachtgeverNaam} · TN-{item.kenmerk} · sluit {new Date(item.sluitingsDatum).toLocaleDateString('nl-NL')}
                  {isSaved ? <span className="saved-pill"><CheckCircle2 size={13} /> opgeslagen</span> : null}
                </p>
                <p className="tender-desc">{item.opdrachtBeschrijving.slice(0, 220)}{item.opdrachtBeschrijving.length > 220 ? '...' : ''}</p>
                {item.cpvCodes?.length ? (
                  <div className="cpv-row">
                    {item.cpvCodes.slice(0, 4).map((cpv) => (
                      <span key={cpv.code} className={cpv.isHoofdOpdracht ? 'cpv-main' : ''}>
                        {cpv.code}
                      </span>
                    ))}
                  </div>
                ) : (
                  <button className="secondary tiny" disabled={isBusy} onClick={() => loadCpv(item.publicatieId)}>
                    CPV laden
                  </button>
                )}

                <div className="tender-card-actions">
                  <button className="ghost tiny" onClick={() => toggleExpand(item.publicatieId)}>
                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <FileText size={14} /> Documenten
                  </button>
                  {item.link ? (
                    <a className="tender-ext-link" href={item.link} target="_blank" rel="noreferrer">
                      <ExternalLink size={13} /> TenderNed
                    </a>
                  ) : null}
                </div>

                {isExpanded ? (
                  <div className="tender-docs">
                    {docState === 'loading' ? (
                      <p className="tender-docs-status"><LoaderCircle size={14} className="spin" /> Documenten laden...</p>
                    ) : docState === 'error' ? (
                      <p className="tender-docs-status error">Documentenlijst kon niet worden geladen.</p>
                    ) : docState && docState.length ? (
                      <>
                        <p className="tender-docs-status">{docState.length} document(en) — worden allemaal gedownload bij opslaan.</p>
                        <ul>
                          {docState.map((doc) => (
                            <li key={doc.documentId}>
                              <span className="doc-type">{doc.type}</span>
                              <span className="doc-name" title={doc.documentNaam}>{doc.documentNaam}</span>
                              <span className="doc-size">{formatBytes(doc.grootte)}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="tender-docs-status">Geen losse documenten bij deze publicatie.</p>
                    )}
                  </div>
                ) : null}
              </div>
              <button
                className="icon-button"
                title="Alle documenten downloaden en opslaan"
                disabled={isBusy}
                onClick={() => saveSingle(item)}
              >
                {isBusy ? <LoaderCircle size={18} className="spin" /> : <BookmarkCheck size={18} />}
              </button>
            </article>
          )
        })}
        {!visibleItems.length && !loading ? <p className="status">Geen resultaten. Pas CPV-filter aan of laad een pagina.</p> : null}
      </section>

      <footer className="tender-pagination">
        <button className="secondary" disabled={page <= 0 || loading} onClick={() => loadPage(page - 1)}>
          Vorige
        </button>
        <span>{totalElements ? `${totalElements.toLocaleString('nl-NL')} totaal · ` : ''}Pagina {page + 1} / {totalPages.toLocaleString('nl-NL') || '?'}</span>
        <button className="secondary" disabled={page >= totalPages - 1 || loading} onClick={() => loadPage(page + 1)}>
          Volgende
        </button>
      </footer>
    </main>
  )
}
