'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  Archive,
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ClipboardList,
  Eye,
  FileText,
  Loader2,
  PenLine,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
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
import {
  compileKaderSection,
  getSchrijfkaderAanpassingen,
  hasAanpassingen,
  saveSchrijfkaderAanpassingen,
  type AanpassingKey,
  type SchrijfkaderAanpassingen,
} from '../lib/schrijfkader'
import { styleDocumentsToSourceDocuments } from '../lib/styleDocumentMerge'
import { flushStorage } from '../lib/storage'
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
import type { SourceType } from '../types/tenderAnalysis'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
  aanpassingPlaceholder: string
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
      aanpassingPlaceholder:
        "Bijv. Noem ons altijd 'Besteed Het Uit', nooit 'BHU'. Schrijf in de u-vorm. Gebruik 'opdrachtgever' in plaats van 'klant'.",
    },
    schrijfstijl: {
      icon: <BookOpen size={20} />,
      accent: 'schrijfstijl',
      editorPlaceholder:
        'Bijv. Schrijf actief en in de wij-vorm. Houd zinnen onder 20 woorden. Vermijd jargon zonder uitleg.',
      uploadTitle: 'Sleep een voorbeeldtekst of stijlgids hierheen',
      uploadHint: 'Voorbeeldteksten en stijlgidsen — AI distilleert er stijlregels uit',
      aanpassingPlaceholder:
        'Bijv. Iets warmer en persoonlijker dan de basis. Begin elke sectie met een korte samenvattende zin. Gebruik minder opsommingen en meer lopende tekst.',
    },
    kwaliteit: {
      icon: <ShieldCheck size={20} />,
      accent: 'kwaliteit',
      editorPlaceholder:
        'Bijv. Elke claim is onderbouwd met een bron of cijfer. Elke alinea is toetsbaar tegen de leidraad.',
      uploadTitle: 'Sleep een kwaliteitsstandaard of reviewchecklist hierheen',
      uploadHint: 'Kwaliteitsstandaarden en reviewchecklists — AI stelt er normen uit op',
      aanpassingPlaceholder:
        'Bijv. Noem bij elke KPI ook de meetfrequentie. Sluit elke sectie af met wat de opdrachtgever hiervan merkt.',
    },
  }
  return { ...meta, ...extras[meta.key] }
})

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  tender: 'Aanbesteding',
  company: 'Bedrijfsinfo',
  rules: 'Schrijfregels & kwaliteit',
  training: 'Schrijfwijze',
}

function isTextRule(doc: StyleDocument): boolean {
  return doc.mimeType === 'text/plain'
}

export default function RulesPage() {
  const [documents, setDocuments] = useState<StyleDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [aanpassingen, setAanpassingen] = useState<SchrijfkaderAanpassingen>(() => getSchrijfkaderAanpassingen())

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

  const saveAanpassing = async (key: AanpassingKey, value: string) => {
    const next = saveSchrijfkaderAanpassingen({ ...aanpassingen, [key]: value })
    setAanpassingen(next)
    await flushStorage()
  }

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
            <Link href="/">
              <ArrowLeft size={16} /> <span className="sr-only sm:not-sr-only">Terug naar werkplek</span>
            </Link>
          </Button>
          <ModeToggle />
        </div>
      </header>

      <div className="mx-auto mb-5 max-w-[1040px]">
        <h1 className="mb-1.5 text-2xl font-semibold">Schrijfregels, schrijfwijze &amp; kwaliteit</h1>
        <p className="max-w-[760px] text-sm text-muted-foreground">
          Eén kader in vier secties. Klik op een kopje om de volledige uitwerking te zien: de ingebouwde
          basis, de regels die je hebt vastgelegd en je eigen aanpassingen. Per sectie schrijf je regels
          of upload je een bron en laat je AI er regels uit opstellen. Alles wat hier staat gaat letterlijk
          als input naar de schrijfagent, de AI-review en het herschrijven van fragmenten — bij elk project.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <PromptPreviewDialog documents={documents} aanpassingen={aanpassingen} />
          <span className="text-xs text-muted-foreground">
            Prioriteit: leidraad › algemene aanpassingen › aanpassingen per sectie › vastgelegde regels › basis
          </span>
        </div>
        {loadError ? <p className="mt-2 text-sm text-destructive">{loadError}</p> : null}
      </div>

      <div className="mx-auto flex max-w-[1040px] flex-col gap-5">
        <AlgemeenCard value={aanpassingen.algemeen} onSave={(value) => saveAanpassing('algemeen', value)} />
        {SECTION_UI.map((section) => (
          <RuleSection
            key={section.key}
            section={section}
            loading={loading}
            documents={documents.filter((doc) => doc.category === section.key)}
            aanpassingen={aanpassingen}
            onSaveAanpassing={(value) => saveAanpassing(section.key, value)}
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

type AanpassingEditorProps = {
  id: string
  label: string
  hint: string
  placeholder: string
  value: string
  rows?: number
  onSave: (value: string) => Promise<void>
}

/** Vrij tekstveld voor handmatige aanpassingen met expliciet opslaan en duidelijke status. */
function AanpassingEditor({ id, label, hint, placeholder, value, rows = 6, onSave }: AanpassingEditorProps) {
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const dirty = draft !== value

  const handleSave = async () => {
    setSaving(true)
    setStatus('Aanpassingen opslaan…')
    try {
      await onSave(draft)
      setStatus('Aanpassingen opgeslagen.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Opslaan mislukt.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      <Textarea
        id={id}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
          if (status) setStatus('')
        }}
        placeholder={placeholder}
        rows={rows}
        className="resize-y"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={saving || !dirty} onClick={() => void handleSave()}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Opslaan…' : 'Aanpassingen opslaan'}
        </Button>
        {!dirty && value.trim() && !status ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check size={13} /> Actief — wordt bij elk project meegenomen
          </span>
        ) : null}
        {status ? <span className="text-xs text-muted-foreground">{status}</span> : null}
      </div>
    </div>
  )
}

function AlgemeenCard({ value, onSave }: { value: string; onSave: (value: string) => Promise<void> }) {
  const active = Boolean(value.trim())
  return (
    <Card className="border-l-4 border-l-primary" data-testid="kader-algemeen">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <SlidersHorizontal size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">Eigen accenten &amp; aanpassingen</h2>
            <p className="text-sm text-muted-foreground">
              Handmatige instructies die boven alle secties gelden — hoogste prioriteit na de leidraad
            </p>
          </div>
          <Badge variant={active ? 'default' : 'outline'}>{active ? 'actief' : 'leeg'}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <AanpassingEditor
          id="aanpassing-algemeen"
          label="Algemene aanpassingen"
          hint="Typ hier in gewone taal wat de agent anders of extra moet doen, ongeacht de sectie. Eén instructie per regel werkt het best. Voor aanpassingen die specifiek over regels, schrijfwijze of kwaliteit gaan, gebruik je het veld in de betreffende sectie."
          placeholder={
            "Bijv. Schrijf consequent in de u-vorm.\nNoem altijd onze certificeringen (ISO 9001, ISO 27001) bij kwaliteitsborging.\nVermijd het woord 'partner'; gebruik 'opdrachtnemer'."
          }
          value={value}
          rows={5}
          onSave={onSave}
        />
      </CardContent>
    </Card>
  )
}

function PromptPreviewDialog({
  documents,
  aanpassingen,
}: {
  documents: StyleDocument[]
  aanpassingen: SchrijfkaderAanpassingen
}) {
  const [open, setOpen] = useState(false)
  const compiled = useMemo(
    () => (open ? styleDocumentsToSourceDocuments(documents, aanpassingen) : []),
    [open, documents, aanpassingen],
  )
  const totalChars = compiled.reduce((sum, doc) => sum + doc.content.length, 0)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Eye size={15} /> Wat de schrijfagent ontvangt
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] gap-3 overflow-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye size={18} /> Schrijfkader zoals de agent het ontvangt
          </DialogTitle>
          <DialogDescription>
            Dit is letterlijk de tekst die bij elk project als bron meegaat naar de schrijfagent, de
            AI-review en het herschrijven van fragmenten — naast de leidraad en je bedrijfsinformatie.
            {compiled.length
              ? ` ${compiled.length} blok(ken), ${totalChars.toLocaleString('nl-NL')} tekens${hasAanpassingen(aanpassingen) ? ', inclusief je handmatige aanpassingen' : ''}.`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {compiled.map((doc) => (
            <article key={doc.id} className="rounded-md border bg-card p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{SOURCE_TYPE_LABELS[doc.type]}</Badge>
                <strong className="text-sm break-words">{doc.name}</strong>
              </div>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2.5 font-mono text-xs leading-relaxed text-foreground">
                {doc.content}
              </pre>
            </article>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

type RuleSectionProps = {
  section: SectionUi
  loading: boolean
  documents: StyleDocument[]
  aanpassingen: SchrijfkaderAanpassingen
  onSaveAanpassing: (value: string) => Promise<void>
  onUpsert: (doc: StyleDocument) => void
  onRemove: (id: string) => void
}

function RuleSection({
  section,
  loading,
  documents,
  aanpassingen,
  onSaveAanpassing,
  onUpsert,
  onRemove,
}: RuleSectionProps) {
  const [expanded, setExpanded] = useState(false)
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

  const compiled = useMemo(
    () => compileKaderSection(section.key, documents, aanpassingen),
    [section.key, documents, aanpassingen],
  )
  const aanpassingActive = Boolean(compiled.aanpassing.trim())

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

  const summaryParts = [
    `${compiled.rules.length} ${compiled.rules.length === 1 ? 'regel' : 'regels'}`,
    compiled.sources.length ? `${compiled.sources.length} ${compiled.sources.length === 1 ? 'bron' : 'bronnen'}` : '',
    aanpassingActive ? 'eigen aanpassingen actief' : '',
    `${compiled.basis.points.length} basisregels`,
  ].filter(Boolean)

  const uitwerkingId = `uitwerking-${section.key}`

  return (
    <Card className={cn('border-l-4', accent.border)} data-testid={`kader-section-${section.key}`}>
      <CardHeader>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={uitwerkingId}
          onClick={() => setExpanded((value) => !value)}
          className="-m-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg', accent.iconBg, accent.icon)}>
            {section.icon}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <p className="text-sm text-muted-foreground">{section.tagline}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{summaryParts.join(' · ')}</p>
          </div>
          <Badge variant="secondary">{documents.length}</Badge>
          <ChevronDown
            size={18}
            className={cn('shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
          />
        </button>
        <p className={cn('text-xs', accent.icon)}>
          {expanded
            ? 'Klik op het kopje om de uitwerking te verbergen.'
            : 'Klik op het kopje voor de volledige uitwerking: basis, vastgelegde regels en je eigen aanpassingen.'}
        </p>
      </CardHeader>

      <CardContent>
        {expanded ? (
          <section
            id={uitwerkingId}
            data-testid={`kader-uitwerking-${section.key}`}
            className="mb-5 space-y-5 rounded-lg border bg-muted/40 p-4"
          >
            <div>
              <div className={cn('flex items-center gap-2 text-sm font-semibold uppercase tracking-wide', accent.icon)}>
                <Sparkles size={16} />
                <span>Uitwerking — zo schrijft de agent</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{compiled.basis.lead}</p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">Basis (ingebouwd)</h3>
                <p className="mb-2 text-xs text-muted-foreground">
                  Geldt altijd. Je vastgelegde regels en aanpassingen gaan hierboven.
                </p>
                <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
                  {compiled.basis.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>

              <div>
                <AanpassingEditor
                  id={`aanpassing-${section.key}`}
                  label="Handmatige aanpassingen"
                  hint={`Hoogste prioriteit binnen ${section.title.toLowerCase()}. Schrijf in gewone taal wat anders moet dan de basis of de vastgelegde regels; de agent past het toe in elke zin.`}
                  placeholder={section.aanpassingPlaceholder}
                  value={compiled.aanpassing}
                  rows={8}
                  onSave={onSaveAanpassing}
                />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold">
                Vastgelegde regels ({compiled.rules.length})
              </h3>
              <p className="mb-2 text-xs text-muted-foreground">
                Geschreven of uit bronnen gedistilleerde regels — gaan volledig mee naar de agent.
              </p>
              {compiled.rules.length ? (
                <div className="grid gap-2.5">
                  {compiled.rules.map((rule) => (
                    <article key={rule.id} className="rounded-md border bg-card p-3">
                      <div className="mb-1.5 flex flex-wrap items-start justify-between gap-2">
                        <strong className="text-sm break-words">{rule.name}</strong>
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleEdit(documents.find((doc) => doc.id === rule.id)!)}>
                          <FileText size={14} /> Bewerk
                        </Button>
                      </div>
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted-foreground">
                        {rule.content}
                      </pre>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nog geen regels vastgelegd — de basis geldt. Schrijf hieronder een regel of upload een bron.
                </p>
              )}
              {compiled.sources.length ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Daarnaast {compiled.sources.length === 1 ? 'gaat' : 'gaan'} {compiled.sources.length}{' '}
                  geüploade bron{compiled.sources.length === 1 ? '' : 'nen'} als ruwe tekst mee. Klik bij een bron op
                  &quot;Stel regels op&quot; om er vaste, compacte regels van te maken.
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

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
              formatsLabel="PDF, Word (ook .doc), PowerPoint, Excel, txt, md, csv — PDF tot 50 MB, overig max. 4 MB"
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
            <p className="text-sm text-muted-foreground">Nog niets in deze sectie — de ingebouwde basis geldt.</p>
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
            formatsLabel="PDF, Word (ook .doc), PowerPoint, Excel, txt, md, csv — PDF tot 50 MB, overig max. 4 MB"
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
