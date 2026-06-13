import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  BookmarkCheck,
  Database,
  Download,
  Filter,
  LoaderCircle,
  RefreshCw,
  Search,
} from 'lucide-react'
import {
  collectCpvCodes,
  enrichWithCpv,
  fetchPublicationsPage,
  fetchPublicationDetail,
  matchesFilters,
  searchPublications,
} from '../lib/tenderNedApi'
import {
  downloadTenderToDatabase,
  getSavedTenders,
  syncPendingTendersToNeon,
} from '../lib/tenderDatabase'
import type { TenderListItem } from '../types/tenderNed'
import '../TenderBrowser.css'

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
  const [scannedPages, setScannedPages] = useState(0)

  const cpvOptions = useMemo(() => collectCpvCodes(items), [items])

  const refreshSavedCount = () => setSavedCount(getSavedTenders().length)

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

  const selectAllVisible = () => {
    setSelected(new Set(visibleItems.map((item) => item.publicatieId)))
  }

  const downloadSelected = async () => {
    if (!selected.size) return
    setLoading(true)
    let done = 0
    for (const id of selected) {
      setBusyIds((current) => new Set(current).add(id))
      try {
        const detail = await fetchPublicationDetail(id)
        await downloadTenderToDatabase(detail)
        done += 1
      } catch {
        // skip failed item
      } finally {
        setBusyIds((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
      }
    }
    refreshSavedCount()
    setSelected(new Set())
    setLoading(false)
    setStatus(`${done} aanbesteding(en) opgeslagen in lokale database.`)
  }

  const syncNeon = async () => {
    const result = await syncPendingTendersToNeon()
    refreshSavedCount()
    setStatus(result.message)
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
          <h2>CPV-voorselectie</h2>
        </div>
        <div className="filter-grid">
          <label>
            CPV-code (prefix)
            <input
              placeholder="bijv. 45210000"
              value={cpvPrefix}
              onChange={(event) => setCpvPrefix(event.target.value)}
            />
          </label>
          <label>
            Zoekterm
            <input
              placeholder="Titel, opdrachtgever, omschrijving"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
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
        <div>
          <strong>{selected.size}</strong> geselecteerd · <strong>{visibleItems.length}</strong> zichtbaar
        </div>
        <div className="tender-toolbar-actions">
          <button className="secondary" onClick={selectAllVisible} disabled={!visibleItems.length}>
            Selecteer zichtbaar
          </button>
          <button className="primary" onClick={downloadSelected} disabled={!selected.size || loading}>
            <Download size={16} /> Download selectie naar database
          </button>
        </div>
      </section>

      <section className="tender-list">
        {visibleItems.map((item) => (
          <article key={item.publicatieId} className={selected.has(item.publicatieId) ? 'selected' : ''}>
            <label className="tender-select">
              <input
                type="checkbox"
                checked={selected.has(item.publicatieId)}
                onChange={() => toggleSelect(item.publicatieId)}
              />
            </label>
            <div className="tender-body">
              <div className="tender-head">
                <strong>{item.aanbestedingNaam}</strong>
                <span className={item.aantalDagenTotSluitingsDatum >= 0 ? 'open' : 'closed'}>
                  {item.aantalDagenTotSluitingsDatum >= 0
                    ? `${item.aantalDagenTotSluitingsDatum} dagen`
                    : 'Gesloten'}
                </span>
              </div>
              <p className="tender-meta">
                {item.opdrachtgeverNaam} · TN-{item.kenmerk} · sluit {new Date(item.sluitingsDatum).toLocaleDateString('nl-NL')}
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
                <button
                  className="secondary tiny"
                  disabled={busyIds.has(item.publicatieId)}
                  onClick={async () => {
                    setBusyIds((current) => new Set(current).add(item.publicatieId))
                    try {
                      const detail = await fetchPublicationDetail(item.publicatieId)
                      setItems((current) =>
                        current.map((row) =>
                          row.publicatieId === item.publicatieId ? { ...row, cpvCodes: detail.cpvCodes } : row,
                        ),
                      )
                    } finally {
                      setBusyIds((current) => {
                        const next = new Set(current)
                        next.delete(item.publicatieId)
                        return next
                      })
                    }
                  }}
                >
                  CPV laden
                </button>
              )}
              {item.link ? (
                <a href={item.link} target="_blank" rel="noreferrer">Bekijk op TenderNed</a>
              ) : null}
            </div>
            <button
              className="icon-button"
              title="Opslaan in database"
              disabled={busyIds.has(item.publicatieId)}
              onClick={async () => {
                setBusyIds((current) => new Set(current).add(item.publicatieId))
                try {
                  const detail = await fetchPublicationDetail(item.publicatieId)
                  await downloadTenderToDatabase(detail)
                  refreshSavedCount()
                  setStatus(`Opgeslagen: ${detail.aanbestedingNaam}`)
                } finally {
                  setBusyIds((current) => {
                    const next = new Set(current)
                    next.delete(item.publicatieId)
                    return next
                  })
                }
              }}
            >
              <BookmarkCheck size={18} />
            </button>
          </article>
        ))}
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
