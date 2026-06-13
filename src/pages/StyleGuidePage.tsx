import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  FileText,
  PenLine,
  Trash2,
} from 'lucide-react'
import FileUploadZone from '../components/FileUploadZone'
import {
  deleteStyleDocument,
  fetchStyleDocuments,
  isRulesDocument,
  uploadStyleDocument,
} from '../lib/styleDocumentsApi'
import {
  acceptedStyleExtensions,
  styleCategoryDefaultPromptType,
  styleCategoryLabels,
  type StyleDocument,
  type StyleDocumentCategory,
} from '../types/styleDocument'
import '../Admin.css'
import '../StyleGuide.css'

export default function StyleGuidePage() {
  const [documents, setDocuments] = useState<StyleDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
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
      setStatus(`${uploaded.length} document(en) opgeslagen en beschikbaar voor de schrijfagent.`)
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
                Upload schrijfstijl en voorbeeldteksten voor toon en opmaak. Voor verplichte schrijfregels
                en kwaliteitsstandaarden gebruik je de pagina Schrijfregels.
              </p>
            </div>
          </div>

          <div className="style-guide-fields">
            <label>
              Categorie
              <select value={category} onChange={(event) => setCategory(event.target.value as StyleDocumentCategory)}>
                {(['schrijfstijl', 'voorbeeld'] as StyleDocumentCategory[]).map((key) => (
                  <option key={key} value={key}>{styleCategoryLabels[key]}</option>
                ))}
              </select>
            </label>
            <label>
              Weergavenaam (optioneel)
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Bijv. HU Schrijfwijzer 2025"
              />
            </label>
          </div>

          <FileUploadZone
            accept={acceptedStyleExtensions}
            loading={uploading}
            title="Sleep stijldocumenten hierheen of klik om te uploaden"
            hint="Voorbeeldteksten en schrijfstijlrichtlijnen voor toon en opmaak"
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
              <p>Deze bronnen worden automatisch meegenomen in de schrijfprompt als regels of training.</p>
            </div>
          </div>

          {loading ? (
            <p className="status">Bibliotheek laden…</p>
          ) : documents.length ? (
            <ul className="config-file-list style-guide-list">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <div>
                    <strong>{doc.name}</strong>
                    <span>
                      {styleCategoryLabels[doc.category]} · {doc.promptType === 'rules' ? 'regels' : 'training'} ·{' '}
                      {doc.fileName} · {doc.content.length.toLocaleString('nl-NL')} tekens
                    </span>
                  </div>
                  <button type="button" className="secondary tiny" onClick={() => void handleDelete(doc.id)}>
                    <Trash2 size={14} /> Verwijder
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="status">Nog geen documenten in de bibliotheek.</p>
          )}
        </section>
      </div>
    </main>
  )
}
