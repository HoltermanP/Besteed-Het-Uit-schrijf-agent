import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Archive,
  ArrowLeft,
  BookOpen,
  ClipboardList,
  FileText,
  Loader2,
  PenLine,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  analyzeStyleDocument,
  createRulesTextDocument,
  deleteStyleDocument,
  distillRulesFromDocument,
  fetchStyleDocuments,
  updateStyleDocument,
  uploadStyleDocument,
} from '../lib/styleDocumentsApi'
import FileUploadZone from '../components/FileUploadZone'
import {
  acceptedStyleExtensions,
  isKaderCategory,
  kaderSections,
  sourceProfileLabels,
  type KaderSectionKey,
  type KaderSectionMeta,
  type SourceProfile,
  type StyleDocument,
} from '../types/styleDocument'
import '../Admin.css'
import '../Rules.css'

/** UI-laag boven op de gedeelde sectie-metadata: icoon, accent en placeholders per sectie. */
type SectionUi = KaderSectionMeta & {
  icon: ReactNode
  accent: KaderSectionKey
  editorPlaceholder: string
  uploadTitle: string
  uploadHint: string
}

const SECTION_UI: SectionUi[] = kaderSections.map((meta) => {
  const extras: Record<KaderSectionKey, Omit<SectionUi, keyof KaderSectionMeta>> = {
    richtlijnen: {
      icon: <ClipboardList size={20} />,
      accent: 'richtlijnen',
      editorPlaceholder:
        "Bijv. Gebruik geen superlatieven zonder bewijs. Vermijd 'uniek', 'toonaangevend' en 'state-of-the-art'.",
      uploadTitle: 'Sleep een schrijfwijzer of voorschrift hierheen',
      uploadHint: 'Schrijfwijzers, huisstijlregels en checklists — AI stelt er regels uit op',
    },
    schrijfstijl: {
      icon: <BookOpen size={20} />,
      accent: 'schrijfstijl',
      editorPlaceholder:
        'Bijv. Schrijf actief en in de wij-vorm. Houd zinnen onder 20 woorden. Vermijd jargon zonder uitleg.',
      uploadTitle: 'Sleep een voorbeeldtekst of stijlgids hierheen',
      uploadHint: 'Voorbeeldteksten en stijlgidsen — AI distilleert er stijlregels uit',
    },
    kwaliteit: {
      icon: <ShieldCheck size={20} />,
      accent: 'kwaliteit',
      editorPlaceholder:
        'Bijv. Elke claim is onderbouwd met een bron of cijfer. Elke alinea is toetsbaar tegen de leidraad.',
      uploadTitle: 'Sleep een kwaliteitsstandaard of reviewchecklist hierheen',
      uploadHint: 'Kwaliteitsstandaarden en reviewchecklists — AI stelt er normen uit op',
    },
  }
  return { ...meta, ...extras[meta.key] }
})

function isTextRule(doc: StyleDocument): boolean {
  return doc.mimeType === 'text/plain'
}

export default function RulesPage() {
  const [documents, setDocuments] = useState<StyleDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const loadDocuments = async () => {
    setLoading(true)
    try {
      const items = await fetchStyleDocuments()
      setDocuments(
        items.filter((doc) => isKaderCategory(doc.category) || doc.category === 'aanbesteding'),
      )
      setLoadError('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDocuments()
  }, [])

  const upsertDocument = (doc: StyleDocument) =>
    setDocuments((current) => {
      const exists = current.some((item) => item.id === doc.id)
      return exists ? current.map((item) => (item.id === doc.id ? doc : item)) : [doc, ...current]
    })

  const removeDocument = (id: string) =>
    setDocuments((current) => current.filter((item) => item.id !== id))

  return (
    <main className="admin-shell rules-shell">
      <header className="admin-topbar">
        <div className="brand">
          <div className="brand-mark"><PenLine size={20} /></div>
          <div>
            <strong>Schrijfkader</strong>
            <span>Besteed Het Uit</span>
          </div>
        </div>
        <div className="admin-topbar-actions">
          <Link className="secondary admin-link" to="/">
            <ArrowLeft size={16} /> Terug naar werkplek
          </Link>
        </div>
      </header>

      <div className="kader-intro">
        <h1>Schrijfregels, schrijfwijze &amp; kwaliteit</h1>
        <p>
          Eén kader in vier secties. Schrijf per sectie regels of upload een bron en laat AI er de
          relevante regels uit opstellen. De vierde sectie distilleert eerdere aanbestedingen en
          achtergrond tot een profiel. Alles wat hier staat wordt automatisch meegenomen als input
          voor nieuwe aanbestedingen.
        </p>
        {loadError ? <p className="status rules-status">{loadError}</p> : null}
      </div>

      <div className="kader-sections">
        {SECTION_UI.map((section) => (
          <RuleSection
            key={section.key}
            section={section}
            loading={loading}
            documents={documents.filter((doc) => doc.category === section.key)}
            onUpsert={upsertDocument}
            onRemove={removeDocument}
          />
        ))}
        <BackgroundSection
          loading={loading}
          documents={documents.filter((doc) => doc.category === 'aanbesteding')}
          onUpsert={upsertDocument}
          onRemove={removeDocument}
        />
      </div>
    </main>
  )
}

type RuleSectionProps = {
  section: SectionUi
  loading: boolean
  documents: StyleDocument[]
  onUpsert: (doc: StyleDocument) => void
  onRemove: (id: string) => void
}

function RuleSection({ section, loading, documents, onUpsert, onRemove }: RuleSectionProps) {
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [distillingId, setDistillingId] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const editorRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const resetEditor = () => {
    setName('')
    setContent('')
    setEditingId(null)
  }

  const focusEditor = () => {
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => nameInputRef.current?.focus(), 350)
  }

  const handleSave = async () => {
    if (!name.trim()) return setStatus('Vul een naam in.')
    if (!content.trim()) return setStatus('Vul de inhoud van de regel in.')

    setSaving(true)
    setStatus(editingId ? 'Regel bijwerken…' : 'Regel opslaan…')
    try {
      if (editingId) {
        const updated = await updateStyleDocument({
          id: editingId,
          name: name.trim(),
          category: section.key,
          content,
        })
        onUpsert(updated)
        setStatus('Regel bijgewerkt.')
      } else {
        const created = await createRulesTextDocument({
          name: name.trim(),
          category: section.key,
          content,
          promptType: section.promptType,
        })
        onUpsert(created)
        setStatus('Regel opgeslagen.')
      }
      resetEditor()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Opslaan mislukt.')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (doc: StyleDocument) => {
    setEditingId(doc.id)
    setName(doc.name)
    setContent(doc.content)
    setStatus(`"${doc.name}" bewerken.`)
    focusEditor()
  }

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    setStatus('Bestanden worden verwerkt en opgeslagen…')
    try {
      let count = 0
      for (const file of Array.from(files)) {
        const doc = await uploadStyleDocument({
          file,
          name: file.name,
          category: section.key,
          promptType: section.promptType,
        })
        onUpsert(doc)
        count += 1
      }
      setStatus(`${count} bron(nen) opgeslagen. Klik op "Stel regels op" om er regels uit te laten distilleren.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upload mislukt.')
    } finally {
      setUploading(false)
    }
  }

  const handleDistill = async (doc: StyleDocument) => {
    setDistillingId(doc.id)
    setStatus(`AI stelt regels op uit "${doc.name}"…`)
    try {
      const rules = await distillRulesFromDocument(doc.id)
      setEditingId(null)
      setName(`Regels uit ${doc.name}`)
      setContent(rules)
      setStatus('AI-voorstel klaar. Controleer en sla op als regel.')
      focusEditor()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'AI kon geen regels opstellen.')
    } finally {
      setDistillingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteStyleDocument(id)
      onRemove(id)
      if (editingId === id) resetEditor()
      setStatus('Verwijderd.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Verwijderen mislukt.')
    }
  }

  return (
    <section className={`admin-card kader-section kader-section--${section.accent}`}>
      <div className="kader-section-head">
        <div className="kader-section-icon">{section.icon}</div>
        <div className="kader-section-title">
          <h2>{section.title}</h2>
          <p>{section.tagline}</p>
        </div>
        <span className="kader-section-count">{documents.length}</span>
      </div>

      <div className="kader-section-body">
        <div className="kader-editor" ref={editorRef}>
          <div className="kader-block-head">
            <Plus size={16} />
            <span>{editingId ? 'Regel bewerken' : 'Regel schrijven'}</span>
          </div>
          <label>
            Naam
            <input
              ref={nameInputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Bijv. Verboden formuleringen"
            />
          </label>
          <label>
            Inhoud
            <textarea
              className="rules-editor"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={section.editorPlaceholder}
              rows={8}
            />
          </label>
          <div className="rules-actions">
            <button type="button" className="primary" disabled={saving} onClick={() => void handleSave()}>
              {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              {saving ? 'Opslaan…' : editingId ? 'Wijzigingen opslaan' : 'Regel opslaan'}
            </button>
            {editingId ? (
              <button type="button" className="secondary" onClick={resetEditor}>
                Annuleren
              </button>
            ) : null}
          </div>
        </div>

        <div className="kader-upload">
          <div className="kader-block-head">
            <Upload size={16} />
            <span>Bron uploaden &amp; AI</span>
          </div>
          <FileUploadZone
            accept={acceptedStyleExtensions}
            loading={uploading}
            title={section.uploadTitle}
            hint={section.uploadHint}
            formatsLabel="PDF, Word, PowerPoint, Excel, txt, md, csv — max. 12 MB per bestand"
            onFiles={handleUpload}
          />
        </div>
      </div>

      <div className="kader-list-wrap">
        {loading ? (
          <p className="status">Laden…</p>
        ) : documents.length ? (
          <ul className="config-file-list rules-list kader-list">
            {documents.map((doc) => {
              const distilling = distillingId === doc.id
              const sourceUpload = !isTextRule(doc)
              return (
                <li key={doc.id} className={editingId === doc.id ? 'rules-list-active' : undefined}>
                  <div className="kader-list-info">
                    <strong>
                      {sourceUpload ? <FileText size={14} className="kader-list-kind" /> : null}
                      {doc.name}
                    </strong>
                    <span>
                      {sourceUpload ? 'Geüploade bron' : 'Geschreven regel'} · {doc.fileName} ·{' '}
                      {doc.content.length.toLocaleString('nl-NL')} tekens
                    </span>
                  </div>
                  <div className="rules-list-actions">
                    {sourceUpload ? (
                      <button
                        type="button"
                        className="secondary tiny"
                        disabled={distilling}
                        onClick={() => void handleDistill(doc)}
                      >
                        {distilling ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                        {distilling ? 'Bezig…' : 'Stel regels op'}
                      </button>
                    ) : (
                      <button type="button" className="secondary tiny" onClick={() => handleEdit(doc)}>
                        <FileText size={14} /> Bewerk
                      </button>
                    )}
                    <button type="button" className="secondary tiny" onClick={() => void handleDelete(doc.id)}>
                      <Trash2 size={14} /> Verwijder
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="status">Nog niets in deze sectie.</p>
        )}
        {status ? <p className="status rules-status">{status}</p> : null}
      </div>
    </section>
  )
}

type BackgroundSectionProps = {
  loading: boolean
  documents: StyleDocument[]
  onUpsert: (doc: StyleDocument) => void
  onRemove: (id: string) => void
}

function BackgroundSection({ loading, documents, onUpsert, onRemove }: BackgroundSectionProps) {
  const [uploading, setUploading] = useState(false)
  const [analyzingIds, setAnalyzingIds] = useState<string[]>([])
  const [status, setStatus] = useState('')

  const runAnalysis = async (id: string) => {
    setAnalyzingIds((current) => [...current, id])
    try {
      onUpsert(await analyzeStyleDocument(id))
      return true
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'AI-analyse mislukt.')
      return false
    } finally {
      setAnalyzingIds((current) => current.filter((value) => value !== id))
    }
  }

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    setStatus('Bestanden worden verwerkt en opgeslagen…')
    try {
      const uploaded: StyleDocument[] = []
      for (const file of Array.from(files)) {
        const doc = await uploadStyleDocument({
          file,
          name: file.name,
          category: 'aanbesteding',
          promptType: 'training',
        })
        onUpsert(doc)
        uploaded.push(doc)
      }
      setStatus(`${uploaded.length} bron(nen) opgeslagen. AI analyseert…`)
      let analyzed = 0
      for (const doc of uploaded) {
        if (await runAnalysis(doc.id)) analyzed += 1
      }
      setStatus(
        analyzed === uploaded.length
          ? `${analyzed} bron(nen) geanalyseerd en beschikbaar voor de schrijfagent.`
          : `${analyzed}/${uploaded.length} geanalyseerd. Analyseer de rest handmatig.`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upload mislukt.')
    } finally {
      setUploading(false)
    }
  }

  const handleAnalyze = async (id: string) => {
    setStatus('AI analyseert het document…')
    if (await runAnalysis(id)) setStatus('Analyse voltooid — profiel beschikbaar voor de schrijfagent.')
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteStyleDocument(id)
      onRemove(id)
      setStatus('Verwijderd.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Verwijderen mislukt.')
    }
  }

  return (
    <section className="admin-card kader-section kader-section--aanbesteding">
      <div className="kader-section-head">
        <div className="kader-section-icon"><Archive size={20} /></div>
        <div className="kader-section-title">
          <h2>Eerdere aanbestedingen &amp; achtergrond</h2>
          <p>Bronnen die AI distilleert tot stijl, kennis, ervaringen en achtergrond</p>
        </div>
        <span className="kader-section-count">{documents.length}</span>
      </div>

      <div className="kader-upload">
        <div className="kader-block-head">
          <Upload size={16} />
          <span>Bron uploaden &amp; AI-analyse</span>
        </div>
        <FileUploadZone
          accept={acceptedStyleExtensions}
          loading={uploading}
          title="Sleep eerdere aanbestedingen of achtergrondstukken hierheen"
          hint="Worden na upload automatisch door AI geanalyseerd tot een bruikbaar profiel"
          formatsLabel="PDF, Word, PowerPoint, Excel, txt, md, csv — max. 12 MB per bestand"
          onFiles={handleUpload}
        />
      </div>

      <div className="kader-list-wrap">
        {loading ? (
          <p className="status">Laden…</p>
        ) : documents.length ? (
          <ul className="config-file-list rules-list kader-list">
            {documents.map((doc) => {
              const analyzing = analyzingIds.includes(doc.id)
              return (
                <li key={doc.id}>
                  <div className="kader-list-info">
                    <strong>
                      <FileText size={14} className="kader-list-kind" />
                      {doc.name}
                    </strong>
                    <span>
                      {doc.fileName} · {doc.content.length.toLocaleString('nl-NL')} tekens
                      {doc.analysis ? (
                        <span className="kader-badge ok"> · geanalyseerd</span>
                      ) : (
                        <span className="kader-badge"> · niet geanalyseerd</span>
                      )}
                    </span>
                    {doc.analysis ? <SourceProfileView profile={doc.analysis} /> : null}
                  </div>
                  <div className="rules-list-actions">
                    <button
                      type="button"
                      className="secondary tiny"
                      disabled={analyzing}
                      onClick={() => void handleAnalyze(doc.id)}
                    >
                      {analyzing ? (
                        <Loader2 size={14} className="spin" />
                      ) : doc.analysis ? (
                        <RefreshCw size={14} />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      {analyzing ? 'Analyseren…' : doc.analysis ? 'Heranalyseer' : 'Analyseer'}
                    </button>
                    <button type="button" className="secondary tiny" onClick={() => void handleDelete(doc.id)}>
                      <Trash2 size={14} /> Verwijder
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="status">Nog niets in deze sectie.</p>
        )}
        {status ? <p className="status rules-status">{status}</p> : null}
      </div>
    </section>
  )
}

function SourceProfileView({ profile }: { profile: SourceProfile }) {
  const sections = (Object.keys(sourceProfileLabels) as Array<keyof SourceProfile>)
    .map((key) => ({ key, label: sourceProfileLabels[key], value: profile[key]?.trim() }))
    .filter((section) => Boolean(section.value))

  if (!sections.length) {
    return <p className="kader-profile-empty">AI vond geen bruikbare inhoud om te distilleren.</p>
  }

  return (
    <details className="kader-profile">
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
