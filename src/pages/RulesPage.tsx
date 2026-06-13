import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  Loader2,
  PenLine,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  createRulesTextDocument,
  deleteStyleDocument,
  fetchStyleDocuments,
  isRulesDocument,
  updateStyleDocument,
  uploadStyleDocument,
} from '../lib/styleDocumentsApi'
import {
  acceptedStyleExtensions,
  rulesCategories,
  rulesCategoryLabels,
  styleCategoryLabels,
  type StyleDocument,
  type StyleDocumentCategory,
} from '../types/styleDocument'
import '../Admin.css'
import '../Rules.css'

type RulesCategory = keyof typeof rulesCategoryLabels

const emptyDraft = {
  name: '',
  category: 'richtlijnen' as RulesCategory,
  content: '',
}

export default function RulesPage() {
  const [documents, setDocuments] = useState<StyleDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [uploadName, setUploadName] = useState('')
  const [uploadCategory, setUploadCategory] = useState<RulesCategory>('richtlijnen')
  const [draft, setDraft] = useState(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDocuments = async () => {
    setLoading(true)
    try {
      const items = await fetchStyleDocuments()
      const rules = items.filter(isRulesDocument)
      setDocuments(rules)
      setStatus(
        rules.length
          ? `${rules.length} schrijfregel(s) opgeslagen.`
          : 'Nog geen schrijfregels opgeslagen.',
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDocuments()
  }, [])

  const resetDraft = () => {
    setDraft(emptyDraft)
    setEditingId(null)
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
          name: uploadName.trim() || file.name,
          category: uploadCategory,
          promptType: 'rules',
        })
        uploaded.push(document)
      }
      setDocuments((current) => [...uploaded, ...current])
      setUploadName('')
      setStatus(`${uploaded.length} regeldocument(en) opgeslagen.`)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upload mislukt.')
    } finally {
      setUploading(false)
    }
  }

  const handleSaveDraft = async () => {
    if (!draft.name.trim()) {
      setStatus('Vul een naam in voor de schrijfregel.')
      return
    }
    if (!draft.content.trim()) {
      setStatus('Vul de inhoud van de schrijfregel in.')
      return
    }

    setSaving(true)
    setStatus(editingId ? 'Schrijfregel bijwerken…' : 'Schrijfregel opslaan…')
    try {
      if (editingId) {
        const updated = await updateStyleDocument({
          id: editingId,
          name: draft.name.trim(),
          category: draft.category,
          content: draft.content,
        })
        setDocuments((current) => current.map((doc) => (doc.id === updated.id ? updated : doc)))
        setStatus('Schrijfregel bijgewerkt.')
      } else {
        const created = await createRulesTextDocument({
          name: draft.name.trim(),
          category: draft.category,
          content: draft.content,
        })
        setDocuments((current) => [created, ...current])
        setStatus('Schrijfregel opgeslagen.')
      }
      resetDraft()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Opslaan mislukt.')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (document: StyleDocument) => {
    setEditingId(document.id)
    setDraft({
      name: document.name,
      category: document.category as RulesCategory,
      content: document.content,
    })
    setStatus(`"${document.name}" bewerken.`)
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteStyleDocument(id)
      setDocuments((current) => current.filter((doc) => doc.id !== id))
      if (editingId === id) resetDraft()
      setStatus('Schrijfregel verwijderd.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Verwijderen mislukt.')
    }
  }

  return (
    <main className="admin-shell rules-shell">
      <header className="admin-topbar">
        <div className="brand">
          <div className="brand-mark"><PenLine size={20} /></div>
          <div>
            <strong>Schrijfregels</strong>
            <span>Besteed Het Uit</span>
          </div>
        </div>
        <div className="admin-topbar-actions">
          <Link className="secondary admin-link" to="/schrijfstijl">
            Schrijfstijl &amp; kwaliteit
          </Link>
          <Link className="secondary admin-link" to="/">
            <ArrowLeft size={16} /> Terug naar werkplek
          </Link>
        </div>
      </header>

      <div className="admin-grid rules-grid">
        <section className="admin-card config-card-wide">
          <div className="admin-card-header">
            <Plus size={20} />
            <div>
              <h2>Schrijfregel aanmaken</h2>
              <p>
                Schrijf verplichte formulering, kwaliteitsnormen en verboden woorden. De schrijfagent
                past deze regels toe bij elke inschrijving.
              </p>
            </div>
          </div>

          <div className="rules-fields">
            <label>
              Naam
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Bijv. Verboden formuleringen"
              />
            </label>
            <label>
              Categorie
              <select
                value={draft.category}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    category: event.target.value as RulesCategory,
                  }))
                }
              >
                {rulesCategories.map((key) => (
                  <option key={key} value={key}>{rulesCategoryLabels[key]}</option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Inhoud
            <textarea
              className="rules-editor"
              value={draft.content}
              onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
              placeholder="Bijv. Gebruik geen superlatieven zonder bewijs. Vermijd woorden als 'uniek', 'toonaangevend' en 'state-of-the-art'."
              rows={12}
            />
          </label>

          <div className="rules-actions">
            <button type="button" className="primary" disabled={saving} onClick={() => void handleSaveDraft()}>
              {saving ? <Loader2 size={17} className="spin" /> : <Save size={17} />}
              {saving ? 'Opslaan…' : editingId ? 'Wijzigingen opslaan' : 'Schrijfregel opslaan'}
            </button>
            {editingId ? (
              <button type="button" className="secondary" onClick={resetDraft}>
                Annuleren
              </button>
            ) : null}
          </div>
        </section>

        <section className="admin-card config-card-wide">
          <div className="admin-card-header">
            <Upload size={20} />
            <div>
              <h2>Regeldocument uploaden</h2>
              <p>Upload bestaande schrijfwijzers, kwaliteitsstandaarden of checklists als regelbron.</p>
            </div>
          </div>

          <div className="rules-fields">
            <label>
              Weergavenaam (optioneel)
              <input
                value={uploadName}
                onChange={(event) => setUploadName(event.target.value)}
                placeholder="Bijv. HU Schrijfwijzer 2025"
              />
            </label>
            <label>
              Categorie
              <select
                value={uploadCategory}
                onChange={(event) => setUploadCategory(event.target.value as RulesCategory)}
              >
                {rulesCategories.map((key) => (
                  <option key={key} value={key}>{rulesCategoryLabels[key]}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="config-upload">
            {uploading ? <Loader2 size={17} className="spin" /> : <Upload size={17} />}
            {uploading ? 'Verwerken…' : 'Bestanden kiezen'}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={acceptedStyleExtensions.join(',')}
              disabled={uploading}
              onChange={(event) => void handleUpload(event.target.files)}
            />
          </label>

          <p className="status">
            Ondersteund: PDF, Word, PowerPoint, Excel en platte tekst (.txt, .md, .csv). Max. 12 MB per
            bestand. Opslag in database (PostgreSQL/Neon) of lokaal dev-bestand.
          </p>
        </section>

        <section className="admin-card config-card-wide">
          <div className="admin-card-header">
            <ClipboardList size={20} />
            <div>
              <h2>Opgeslagen schrijfregels</h2>
              <p>Deze regels worden automatisch meegenomen in de schrijfprompt als verplichte standaarden.</p>
            </div>
          </div>

          {loading ? (
            <p className="status">Schrijfregels laden…</p>
          ) : documents.length ? (
            <ul className="config-file-list rules-list">
              {documents.map((doc) => (
                <li key={doc.id} className={editingId === doc.id ? 'rules-list-active' : undefined}>
                  <div>
                    <strong>{doc.name}</strong>
                    <span>
                      {styleCategoryLabels[doc.category as StyleDocumentCategory]} · {doc.fileName} ·{' '}
                      {doc.content.length.toLocaleString('nl-NL')} tekens
                    </span>
                  </div>
                  <div className="rules-list-actions">
                    <button type="button" className="secondary tiny" onClick={() => handleEdit(doc)}>
                      <FileText size={14} /> Bewerk
                    </button>
                    <button type="button" className="secondary tiny" onClick={() => void handleDelete(doc.id)}>
                      <Trash2 size={14} /> Verwijder
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="status">Nog geen schrijfregels opgeslagen.</p>
          )}

          {status ? <p className="status rules-status">{status}</p> : null}
        </section>
      </div>
    </main>
  )
}
