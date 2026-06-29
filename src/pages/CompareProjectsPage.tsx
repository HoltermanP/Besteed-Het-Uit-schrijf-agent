import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  GitCompareArrows,
  GraduationCap,
  Loader2,
  Save,
  Sparkles,
} from 'lucide-react'
import { listProjects, type ProjectMeta } from '../lib/projects'
import { loadDossier } from '../lib/dossier'
import {
  buildCompareInput,
  compareProjectsViaApi,
  type CompareSnapshot,
} from '../lib/compareProjectsApi'
import { createLesson } from '../lib/lessonsLearnedApi'
import type { CompareProjectInput, CompareProjectsResponse } from '../types/compareProjects'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { ModeToggle } from '@/components/mode-toggle'
import { cn } from '@/lib/utils'

const MAX_SELECTION = 4
const stageLabels: Record<string, string> = {
  brons: 'Brons',
  zilver: 'Zilver',
  goud: 'Goud',
}

function formatDate(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('nl-NL')
}

export default function CompareProjectsPage() {
  const projects = useMemo(() => listProjects(), [])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [inputs, setInputs] = useState<CompareProjectInput[] | null>(null)
  const [comparing, setComparing] = useState(false)
  const [result, setResult] = useState<CompareProjectsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [savedLessons, setSavedLessons] = useState<Set<number>>(new Set())

  const toggle = (id: string) => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id)
      if (current.length >= MAX_SELECTION) return current
      return [...current, id]
    })
  }

  // Laad de geselecteerde dossiers en bouw de structurele vergelijking (zonder AI).
  const buildComparison = (): CompareProjectInput[] => {
    return selectedIds
      .map((id) => {
        const snapshot = loadDossier<CompareSnapshot>(id)
        return snapshot ? buildCompareInput(id, snapshot) : null
      })
      .filter((value): value is CompareProjectInput => value !== null)
  }

  const handleCompare = () => {
    setResult(null)
    setError(null)
    setSavedLessons(new Set())
    const built = buildComparison()
    if (built.length < 2) {
      setError('Kon de geselecteerde projecten niet laden. Open ze eerst in de werkruimte.')
      setInputs(null)
      return
    }
    setInputs(built)
  }

  const handleAiSummary = async () => {
    if (!inputs) return
    setComparing(true)
    setError(null)
    setStatus('De AI vergelijkt de aanpak van je projecten…')
    try {
      const response = await compareProjectsViaApi(inputs)
      setResult(response)
      setStatus(
        `Vergelijking opgesteld door ${response.provider} (${response.model}).`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI-vergelijking mislukt.')
      setStatus(null)
    } finally {
      setComparing(false)
    }
  }

  const saveLesson = async (index: number) => {
    if (!result || !inputs) return
    const lesson = result.lessons[index]
    const projectTitle = `Vergelijking: ${inputs.map((p) => p.title || 'Naamloos').join(' vs ')}`
    try {
      await createLesson({
        projectTitle,
        buyer: null,
        outcome: 'onbekend',
        category: lesson.category || null,
        situation: lesson.situation,
        lesson: lesson.lesson,
        recommendation: lesson.recommendation,
        sourceTenderId: inputs[0]?.id ?? null,
      })
      setSavedLessons((current) => new Set(current).add(index))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Leerpunt opslaan mislukt.')
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/" aria-label="Terug naar werkruimte">
              <ArrowLeft size={18} />
            </Link>
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <GitCompareArrows size={20} className="text-primary" /> Projecten vergelijken
            </h1>
            <p className="text-sm text-muted-foreground">
              Leg eerdere projecten naast elkaar en zie hoe je ze hebt aangepakt.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/leerpunten">
              <GraduationCap size={16} /> Leerpunten
            </Link>
          </Button>
          <ModeToggle />
        </div>
      </header>

      {/* Projectkiezer */}
      <Card className="mb-6">
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Kies projecten ({selectedIds.length}/{MAX_SELECTION})
            </h2>
            <Button onClick={handleCompare} disabled={selectedIds.length < 2}>
              <GitCompareArrows size={16} /> Vergelijk
            </Button>
          </div>

          {projects.length ? (
            <ul className="grid list-none gap-2 p-0 sm:grid-cols-2">
              {projects.map((project) => (
                <ProjectPickRow
                  key={project.id}
                  project={project}
                  checked={selectedIds.includes(project.id)}
                  disabled={
                    !selectedIds.includes(project.id) && selectedIds.length >= MAX_SELECTION
                  }
                  onToggle={() => toggle(project.id)}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nog geen opgeslagen projecten. Maak of open eerst een project in de werkruimte.
            </p>
          )}
        </CardContent>
      </Card>

      {error ? (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {/* Structurele vergelijking (zonder AI) */}
      {inputs ? (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold">Aanpak & structuur naast elkaar</h2>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${inputs.length}, minmax(0, 1fr))` }}
          >
            {inputs.map((input) => (
              <StructureColumn key={input.id} input={input} />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => void handleAiSummary()} disabled={comparing}>
              {comparing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {comparing ? 'AI vergelijkt…' : 'AI-samenvatting van verschillen'}
            </Button>
            {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
          </div>
        </div>
      ) : null}

      {/* AI-resultaat */}
      {result ? <AiComparison result={result} savedLessons={savedLessons} onSave={saveLesson} /> : null}
    </div>
  )
}

function ProjectPickRow({
  project,
  checked,
  disabled,
  onToggle,
}: {
  project: ProjectMeta
  checked: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <li>
      <label
        className={cn(
          'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
          checked ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <Checkbox checked={checked} disabled={disabled} onCheckedChange={onToggle} className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{project.title || 'Naamloos project'}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {project.buyer || 'Geen opdrachtgever'} · {formatDate(project.updatedAt)}
          </span>
        </span>
        <Badge variant="secondary" className="shrink-0">
          {project.source === 'tender' ? 'Aanbesteding' : 'Blanco'}
        </Badge>
      </label>
    </li>
  )
}

function StructureColumn({ input }: { input: CompareProjectInput }) {
  return (
    <Card className="h-full">
      <CardContent className="space-y-3">
        <div>
          <h3 className="truncate text-sm font-semibold" title={input.title}>
            {input.title || 'Naamloos project'}
          </h3>
          <p className="truncate text-xs text-muted-foreground">{input.buyer || 'Geen opdrachtgever'}</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {input.stage ? <Badge variant="outline">{stageLabels[input.stage] ?? input.stage}</Badge> : null}
          <Badge variant="secondary">{input.wordCount} woorden</Badge>
          <Badge variant="secondary">Deadline {formatDate(input.deadline)}</Badge>
        </div>

        <Separator />

        <Field label="Bronnen">
          <p className="text-xs text-muted-foreground">{input.documentOverview || 'Geen bronnen'}</p>
        </Field>

        <Field label="Beoordelingscriteria">
          {input.evaluationCriteria.length ? (
            <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
              {input.evaluationCriteria.map((criterion, index) => (
                <li key={index}>{criterion}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Geen analyse beschikbaar</p>
          )}
        </Field>

        <Field label="Opbouw concept">
          {input.headings.length ? (
            <ol className="ml-4 list-decimal space-y-0.5 text-xs text-muted-foreground">
              {input.headings.map((heading, index) => (
                <li key={index}>{heading}</li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-muted-foreground">Geen koppen in concept</p>
          )}
        </Field>
      </CardContent>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold">{label}</p>
      {children}
    </div>
  )
}

function AiComparison({
  result,
  savedLessons,
  onSave,
}: {
  result: CompareProjectsResponse
  savedLessons: Set<number>
  onSave: (index: number) => void
}) {
  return (
    <div className="space-y-5">
      {result.overview ? (
        <Card>
          <CardContent>
            <h2 className="mb-1.5 text-sm font-semibold">Samenvatting</h2>
            <p className="text-sm text-muted-foreground">{result.overview}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        {result.similarities.length ? (
          <Card>
            <CardContent>
              <h2 className="mb-2 text-sm font-semibold">Overeenkomsten</h2>
              <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
                {result.similarities.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {result.insights.length ? (
          <Card>
            <CardContent>
              <h2 className="mb-2 text-sm font-semibold">Wat opvalt</h2>
              <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
                {result.insights.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {result.differences.length ? (
        <Card>
          <CardContent>
            <h2 className="mb-2 text-sm font-semibold">Verschillen in aanpak</h2>
            <div className="space-y-3">
              {result.differences.map((diff, index) => (
                <div key={index}>
                  {diff.aspect ? <p className="text-sm font-medium">{diff.aspect}</p> : null}
                  <p className="text-sm text-muted-foreground">{diff.observation}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {result.lessons.length ? (
        <Card>
          <CardContent>
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <GraduationCap size={16} className="text-primary" /> Leerpunten uit deze vergelijking
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Bewaar relevante leerpunten in je lessons-learned-database voor toekomstige aanbestedingen.
            </p>
            <div className="space-y-3">
              {result.lessons.map((lesson, index) => {
                const saved = savedLessons.has(index)
                return (
                  <div key={index} className="rounded-lg border border-border p-3">
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {lesson.category ? (
                          <Badge variant="outline" className="mb-1">
                            {lesson.category}
                          </Badge>
                        ) : null}
                        <p className="text-sm font-medium">{lesson.lesson}</p>
                      </div>
                      <Button
                        size="sm"
                        variant={saved ? 'ghost' : 'outline'}
                        disabled={saved}
                        onClick={() => onSave(index)}
                        className="shrink-0"
                      >
                        {saved ? <Check size={15} /> : <Save size={15} />}
                        {saved ? 'Opgeslagen' : 'Bewaar als leerpunt'}
                      </Button>
                    </div>
                    {lesson.situation ? (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Context:</span> {lesson.situation}
                      </p>
                    ) : null}
                    {lesson.recommendation ? (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Toepassen:</span> {lesson.recommendation}
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
