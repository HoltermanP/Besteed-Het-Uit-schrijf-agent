import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  FileText,
  Loader2,
  PenLine,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import FileUploadZone from '../components/FileUploadZone'
import {
  analyzeStyleDocument,
  deleteStyleDocument,
  fetchStyleDocuments,
  isRulesDocument,
  uploadStyleDocument,
} from '../lib/styleDocumentsApi'
import {
  acceptedStyleExtensions,
  isAnalyzableCategory,
  sourceProfileLabels,
  styleCategoryDefaultPromptType,
  styleCategoryLabels,
  type SourceProfile,
  type StyleDocument,
  type StyleDocumentCategory,
} from '../types/styleDocument'
import '../Admin.css'
import '../StyleGuide.css'

const selectableCategories: StyleDocumentCategory[] = ['schrijfstijl', 'voorbeeld', 'aanbesteding']

export default function StyleGuidePage() {
  const [documents, setDocuments] = useState<StyleDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [analyzingIds, setAnalyzingIds] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState<StyleDocumentCategory>('schrijfstijl')
  const [displayName, setDisplayName] = useState('')

  const loadDocuments = async () => {
    setLoading(true)
    try {
      const items = await fetchStyleDocuments()
      const styleItems = items.filter((doc) => !isRulesDocument(doc))
      setDocuments(styleItems)
      setStatus(styleItems.length ? `${styleItems.length} document(en) in bibliotheek.` : 'Nog geen documenten geüpload.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDocuments()
  }, [])

  const runAnalysis = async (id: string) => {
    setAnalyzingIds((current) => [...current, id])
    try {
      const updated = await analyzeStyleDocument(id)
      setDocuments((current) => current.map((doc) => (doc.id === id ? updated : doc)))
      return true
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'AI-analyse mislukt.')
      return false
    } finally {
      setAnalyzingIds((current) => current.filter((value) => value !== id))
    }
  }

  const handleAnalyze = async (id: string) => {
    setStatus('AI analyseert het document…')
    const ok = await runAnalysis(id)
    if (ok) setStatus('Analyse voltooid — profiel beschikbaar voor de schrijfagent.')
  }

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return

    setUploading(true)
    setStatus('Bestanden worden verwerkt en opgeslagen…')
    try {
      const uploaded: StyleDocument[] = []
      for (const file of Array.from(files)) {
        const document = await uploadStyleDocument({
          file,
          name: displayName.trim() || file.name,
          category,
          promptType: styleCategoryDefaultPromptType[category],
        })
        uploaded.push(document)
      }
      setDocuments((current) => [...uploaded, ...current])
      setDisplayName('')

      if (isAnalyzableCategory(category)) {
        setStatus(`${uploaded.length} document(en) opgeslagen. AI analyseert ${uploaded.length === 1 ? 'het document' : 'de documenten'}…`)
        let analyzed = 0
        for (const document of uploaded) {
          if (await runAnalysis(document.id)) analyzed += 1
        }
        setStatus(
          analyzed === uploaded.length
            ? `${analyzed} document(en) geanalyseerd en beschikbaar voor de schrijfagent.`
            : `${analyzed}/${uploaded.length} geanalyseerd. Niet-geanalyseerde documenten kun je handmatig opnieuw analyseren.`,
        )
      } else {
        setStatus(`${uploaded.length} document(en) opgeslagen en beschikbaar voor de schrijfagent.`)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upload mislukt.')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteStyleDocument(id)
      setDocuments((current) => current.filter((doc) => doc.id !== id))
      setStatus('Document verwijderd.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Verwijderen mislukt.')
    }
  }

  const analyzable = isAnalyzableCategory(category)

  return (
    <main className="admin-shell style-guide-shell">
      <header className="admin-topbar">
        <div className="brand">
          <div className="brand-mark"><PenLine size={20} /></div>
          <div>
            <strong>Schrijfstijl &amp; kwaliteit</strong>
            <span>Besteed Het Uit</span>
          </div>
        </div>
        <div className="admin-topbar-actions">
          <Link className="secondary admin-link" to="/schrijfregels">
            Schrijfregels
          </Link>
          <Link className="secondary admin-link" to="/">
            <ArrowLeft size={16} /> Terug naar werkplek
          </Link>
        </div>
      </header>

      <div className="admin-grid style-guide-grid">
        <section className="admin-card config-card-wide">
          <div className="admin-card-header">
            <BookOpen size={20} />
            <div>
              <h2>Stijlbibliotheek</h2>
              <p>
                Upload schrijfstijl en voorbeeldteksten voor toon en opmaak. Kies{' '}
                <strong>Eerdere aanbesteding &amp; achtergrond</strong> om documenten door AI te laten
                analyseren op schrijfstijl, kennis, ervaringen en achtergrond. Voor verplichte
                schrijfregels gebruik je de pagina Schrijfregels.
              </p>
            </div>
          </div>

          <div className="style-guide-fields">
            <label>
              Categorie
              <select value={category} onChange={(event) => setCategory(event.target.value as StyleDocumentCategory)}>
                {selectableCategories.map((key) => (
                  <option key={key} value={key}>{styleCategoryLabels[key]}</option>
                ))}
              </select>
            </label>
            <label>
              Weergavenaam (optioneel)
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Bijv. Aanbesteding gemeente X 2025"
              />
            </label>
          </div>

          <FileUploadZone
            accept={acceptedStyleExtensions}
            loading={uploading}
            title={analyzable ? 'Sleep eerdere aanbestedingen of achtergrondstukken hierheen' : 'Sleep stijldocumenten hierheen of klik om te uploaden'}
            hint={analyzable ? 'Worden na upload automatisch door AI geanalyseerd tot een bruikbaar profiel' : 'Voorbeeldteksten en schrijfstijlrichtlijnen voor toon en opmaak'}
            formatsLabel="PDF, Word, PowerPoint, Excel, txt, md, csv — max. 12 MB per bestand"
            onFiles={handleUpload}
          />
          {status ? <p className="status style-guide-status">{status}</p> : null}
        </section>

        <section className="admin-card config-card-wide">
          <div className="admin-card-header">
            <FileText size={20} />
            <div>
              <h2>Opgeslagen documenten</h2>
              <p>Deze bronnen worden automatisch meegenomen in de schrijfprompt. Geanalyseerde documenten leveren een gedistilleerd profiel.</p>
            </div>
          </div>

          {loading ? (
            <p className="status">Bibliotheek laden…</p>
          ) : documents.length ? (
            <ul className="config-file-list style-guide-list">
              {documents.map((doc) => {
                const isAnalyzing = analyzingIds.includes(doc.id)
                const canAnalyze = isAnalyzableCategory(doc.category)
                return (
                  <li key={doc.id} className="style-doc-item">
                    <div className="style-doc-head">
                      <div>
                        <strong>{doc.name}</strong>
                        <span>
                          {styleCategoryLabels[doc.category]} · {doc.fileName} ·{' '}
                          {doc.content.length.toLocaleString('nl-NL')} tekens
                          {canAnalyze ? (
                            doc.analysis ? (
                              <span className="style-doc-badge ok"> · geanalyseerd</span>
                            ) : (
                              <span className="style-doc-badge"> · niet geanalyseerd</span>
                            )
                          ) : null}
                        </span>
                      </div>
                      <div className="style-doc-actions">
                        {canAnalyze ? (
                          <button
                            type="button"
                            className="secondary tiny"
                            disabled={isAnalyzing}
                            onClick={() => void handleAnalyze(doc.id)}
                          >
                            {isAnalyzing ? (
                              <><Loader2 size={14} className="spin" /> Analyseren…</>
                            ) : doc.analysis ? (
                              <><RefreshCw size={14} /> Heranalyseer</>
                            ) : (
                              <><Sparkles size={14} /> Analyseer</>
                            )}
                          </button>
                        ) : null}
                        <button type="button" className="secondary tiny" onClick={() => void handleDelete(doc.id)}>
                          <Trash2 size={14} /> Verwijder
                        </button>
                      </div>
                    </div>
                    {doc.analysis ? <SourceProfileView profile={doc.analysis} /> : null}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="status">Nog geen documenten in de bibliotheek.</p>
          )}
        </section>
      </div>
    </main>
  )
}

function SourceProfileView({ profile }: { profile: SourceProfile }) {
  const sections = (Object.keys(sourceProfileLabels) as Array<keyof SourceProfile>)
    .map((key) => ({ key, label: sourceProfileLabels[key], value: profile[key]?.trim() }))
    .filter((section) => Boolean(section.value))

  if (!sections.length) {
    return <p className="style-doc-profile-empty">AI vond geen bruikbare inhoud om te distilleren.</p>
  }

  return (
    <details className="style-doc-profile">
      <summary>AI-profiel ({sections.length} {sections.length === 1 ? 'aspect' : 'aspecten'})</summary>
      <dl>
        {sections.map((section) => (
          <div key={section.key}>
            <dt>{section.label}</dt>
            <dd>{section.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
