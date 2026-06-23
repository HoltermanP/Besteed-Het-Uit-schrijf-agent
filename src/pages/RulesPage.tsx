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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ModeToggle } from '@/components/mode-toggle'
import { cn } from '@/lib/utils'

/** UI-laag boven op de gedeelde sectie-metadata: icoon, accent en placeholders per sectie. */
type SectionUi = KaderSectionMeta & {
  icon: ReactNode
  accent: KaderSectionKey
  editorPlaceholder: string
  uploadTitle: string
  uploadHint: string
}

/** Per-sectie accentkleur — de enige niet-semantische kleuren, om de vier secties te onderscheiden. */
type AccentClasses = {
  border: string
  icon: string
  iconBg: string
}

const ACCENTS: Record<string, AccentClasses> = {
  richtlijnen: {
    border: 'border-l-teal-500',
    icon: 'text-teal-600 dark:text-teal-400',
    iconBg: 'bg-teal-500/10',
  },
  schrijfstijl: {
    border: 'border-l-indigo-500',
    icon: 'text-indigo-600 dark:text-indigo-400',
    iconBg: 'bg-indigo-500/10',
  },
  kwaliteit: {
    border: 'border-l-amber-500',
    icon: 'text-amber-600 dark:text-amber-400',
    iconBg: 'bg-amber-500/10',
  },
  aanbesteding: {
    border: 'border-l-violet-500',
    icon: 'text-violet-600 dark:text-violet-400',
    iconBg: 'bg-violet-500/10',
  },
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
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PenLine size={18} />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-semibold">Schrijfkader</div>
            <div className="truncate text-sm text-muted-foreground">Besteed Het Uit</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft size={16} /> <span className="sr-only sm:not-sr-only">Terug naar werkplek</span>
            </Link>
          </Button>
          <ModeToggle />
        </div>
      </header>

      <div className="mx-auto mb-5 max-w-[1040px]">
        <h1 className="mb-1.5 text-2xl font-semibold">Schrijfregels, schrijfwijze &amp; kwaliteit</h1>
        <p className="max-w-[720px] text-sm text-muted-foreground">
          Eén kader in vier secties. Schrijf per sectie regels of upload een bron en laat AI er de
          relevante regels uit opstellen. De vierde sectie distilleert eerdere aanbestedingen en
          achtergrond tot een profiel. Alles wat hier staat wordt automatisch meegenomen als input
          voor nieuwe aanbestedingen.
        </p>
        {loadError ? <p className="mt-2 text-sm text-destructive">{loadError}</p> : null}
      </div>

      <div className="mx-auto flex max-w-[1040px] flex-col gap-5">
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
  const accent = ACCENTS[section.accent]

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
    <Card className={cn('border-l-4', accent.border)} data-testid={`kader-section-${section.key}`}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg', accent.iconBg, accent.icon)}>
            {section.icon}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <p className="text-sm text-muted-foreground">{section.tagline}</p>
          </div>
          <Badge variant="secondary">{documents.length}</Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div ref={editorRef} className="space-y-3">
            <div className={cn('flex items-center gap-2 text-sm font-semibold uppercase tracking-wide', accent.icon)}>
              <Plus size={16} />
              <span>{editingId ? 'Regel bewerken' : 'Regel schrijven'}</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`name-${section.key}`}>Naam</Label>
              <Input
                id={`name-${section.key}`}
                ref={nameInputRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Bijv. Verboden formuleringen"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`content-${section.key}`}>Inhoud</Label>
              <Textarea
                id={`content-${section.key}`}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={section.editorPlaceholder}
                rows={8}
                className="min-h-40 resize-y"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={saving} onClick={() => void handleSave()}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Opslaan…' : editingId ? 'Wijzigingen opslaan' : 'Regel opslaan'}
              </Button>
              {editingId ? (
                <Button type="button" variant="outline" onClick={resetEditor}>
                  Annuleren
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col">
            <div className={cn('mb-2.5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide', accent.icon)}>
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

        <Separator className="my-5" />

        <div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Laden…</p>
          ) : documents.length ? (
            <ul className="space-y-2">
              {documents.map((doc) => {
                const distilling = distillingId === doc.id
                const sourceUpload = !isTextRule(doc)
                return (
                  <li
                    key={doc.id}
                    className={cn(
                      'flex items-start justify-between gap-3 rounded-md border p-3',
                      editingId === doc.id && cn(accent.border, 'border-l-4 bg-accent'),
                    )}
                  >
                    <div className="min-w-0">
                      <strong className="flex items-center gap-1.5 break-words">
                        {sourceUpload ? <FileText size={14} className={cn('flex-shrink-0', accent.icon)} /> : null}
                        {doc.name}
                      </strong>
                      <span className="text-sm text-muted-foreground break-words">
                        {sourceUpload ? 'Geüploade bron' : 'Geschreven regel'} · {doc.fileName} ·{' '}
                        {doc.content.length.toLocaleString('nl-NL')} tekens
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {sourceUpload ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={distilling}
                          onClick={() => void handleDistill(doc)}
                        >
                          {distilling ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                          {distilling ? 'Bezig…' : 'Stel regels op'}
                        </Button>
                      ) : (
                        <Button type="button" variant="outline" size="sm" onClick={() => handleEdit(doc)}>
                          <FileText size={14} /> Bewerk
                        </Button>
                      )}
                      <Button type="button" variant="outline" size="sm" onClick={() => void handleDelete(doc.id)}>
                        <Trash2 size={14} /> Verwijder
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nog niets in deze sectie.</p>
          )}
          {status ? <p className="mt-2.5 text-sm text-muted-foreground">{status}</p> : null}
        </div>
      </CardContent>
    </Card>
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
  const accent = ACCENTS.aanbesteding

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
    <Card className={cn('border-l-4', accent.border)}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg', accent.iconBg, accent.icon)}>
            <Archive size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">Eerdere aanbestedingen &amp; achtergrond</h2>
            <p className="text-sm text-muted-foreground">
              Bronnen die AI distilleert tot stijl, kennis, ervaringen en achtergrond
            </p>
          </div>
          <Badge variant="secondary">{documents.length}</Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col">
          <div className={cn('mb-2.5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide', accent.icon)}>
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

        <Separator className="my-5" />

        <div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Laden…</p>
          ) : documents.length ? (
            <ul className="space-y-2">
              {documents.map((doc) => {
                const analyzing = analyzingIds.includes(doc.id)
                return (
                  <li key={doc.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                    <div className="min-w-0">
                      <strong className="flex items-center gap-1.5 break-words">
                        <FileText size={14} className={cn('flex-shrink-0', accent.icon)} />
                        {doc.name}
                      </strong>
                      <span className="text-sm text-muted-foreground break-words">
                        {doc.fileName} · {doc.content.length.toLocaleString('nl-NL')} tekens{' '}
                        {doc.analysis ? (
                          <Badge variant="secondary" className="align-middle">geanalyseerd</Badge>
                        ) : (
                          <Badge variant="outline" className="align-middle">niet geanalyseerd</Badge>
                        )}
                      </span>
                      {doc.analysis ? <SourceProfileView profile={doc.analysis} accentClass={accent.icon} /> : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={analyzing}
                        onClick={() => void handleAnalyze(doc.id)}
                      >
                        {analyzing ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : doc.analysis ? (
                          <RefreshCw size={14} />
                        ) : (
                          <Sparkles size={14} />
                        )}
                        {analyzing ? 'Analyseren…' : doc.analysis ? 'Heranalyseer' : 'Analyseer'}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => void handleDelete(doc.id)}>
                        <Trash2 size={14} /> Verwijder
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nog niets in deze sectie.</p>
          )}
          {status ? <p className="mt-2.5 text-sm text-muted-foreground">{status}</p> : null}
        </div>
      </CardContent>
    </Card>
  )
}

function SourceProfileView({ profile, accentClass }: { profile: SourceProfile; accentClass: string }) {
  const sections = (Object.keys(sourceProfileLabels) as Array<keyof SourceProfile>)
    .map((key) => ({ key, label: sourceProfileLabels[key], value: profile[key]?.trim() }))
    .filter((section) => Boolean(section.value))

  if (!sections.length) {
    return <p className="mt-2 text-sm text-muted-foreground">AI vond geen bruikbare inhoud om te distilleren.</p>
  }

  return (
    <details className="mt-2.5 text-sm">
      <summary className={cn('cursor-pointer select-none font-semibold', accentClass)}>
        AI-profiel ({sections.length} {sections.length === 1 ? 'aspect' : 'aspecten'})
      </summary>
      <dl className="mt-2.5 grid gap-2.5">
        {sections.map((section) => (
          <div key={section.key}>
            <dt className="mb-0.5 font-semibold text-foreground">{section.label}</dt>
            <dd className="m-0 whitespace-pre-wrap leading-relaxed text-muted-foreground">{section.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
