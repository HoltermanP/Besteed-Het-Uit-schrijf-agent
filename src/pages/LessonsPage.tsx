import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, GraduationCap, Loader2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { createLesson, deleteLesson, fetchLessons, updateLesson } from '../lib/lessonsLearnedApi'
import {
  lessonOutcomeLabels,
  lessonOutcomes,
  type LessonLearned,
  type LessonOutcome,
} from '../types/lessonLearned'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ModeToggle } from '@/components/mode-toggle'

const outcomeBadgeClass: Record<LessonOutcome, string> = {
  gewonnen: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  verloren: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
  ingetrokken: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  onbekend: 'bg-muted text-muted-foreground',
}

type EmptyForm = {
  projectTitle: string
  buyer: string
  outcome: LessonOutcome
  category: string
  situation: string
  lesson: string
  recommendation: string
}

const emptyForm: EmptyForm = {
  projectTitle: '',
  buyer: '',
  outcome: 'onbekend',
  category: '',
  situation: '',
  lesson: '',
  recommendation: '',
}

export default function LessonsPage() {
  const [lessons, setLessons] = useState<LessonLearned[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [filterOutcome, setFilterOutcome] = useState<LessonOutcome | 'alle'>('alle')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<EmptyForm>(emptyForm)
  const [savingNew, setSavingNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftEdit, setDraftEdit] = useState<Partial<LessonLearned>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    return fetchLessons()
      .then((data) => {
        setLessons(data)
        setError(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Leerpunten ophalen mislukt.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void fetchLessons()
      .then((data) => setLessons(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Leerpunten ophalen mislukt.'))
  }, [])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return lessons.filter((lesson) => {
      if (filterOutcome !== 'alle' && lesson.outcome !== filterOutcome) return false
      if (!query) return true
      return [lesson.projectTitle, lesson.buyer, lesson.category, lesson.lesson, lesson.situation, lesson.recommendation]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    })
  }, [lessons, filterOutcome, search])

  const handleCreate = async () => {
    if (!form.lesson.trim() || !form.projectTitle.trim()) {
      setStatus('Projecttitel en leerpunt zijn verplicht.')
      return
    }
    setSavingNew(true)
    try {
      const created = await createLesson({
        projectTitle: form.projectTitle,
        buyer: form.buyer || null,
        outcome: form.outcome,
        category: form.category || null,
        situation: form.situation,
        lesson: form.lesson,
        recommendation: form.recommendation,
      })
      setLessons((current) => [created, ...current])
      setForm(emptyForm)
      setStatus('Leerpunt toegevoegd.')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Opslaan mislukt.')
    } finally {
      setSavingNew(false)
    }
  }

  const startEdit = (lesson: LessonLearned) => {
    setEditingId(lesson.id)
    setDraftEdit(lesson)
    setStatus(null)
  }

  const saveEdit = async () => {
    if (!editingId) return
    setBusyId(editingId)
    try {
      const updated = await updateLesson({
        id: editingId,
        projectTitle: draftEdit.projectTitle,
        buyer: draftEdit.buyer ?? null,
        outcome: draftEdit.outcome,
        category: draftEdit.category ?? null,
        situation: draftEdit.situation,
        lesson: draftEdit.lesson,
        recommendation: draftEdit.recommendation,
      })
      setLessons((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setEditingId(null)
      setDraftEdit({})
      setStatus('Leerpunt bijgewerkt.')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Bijwerken mislukt.')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (id: string) => {
    setBusyId(id)
    try {
      await deleteLesson(id)
      setLessons((current) => current.filter((item) => item.id !== id))
      if (editingId === id) setEditingId(null)
      setStatus('Leerpunt verwijderd.')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Verwijderen mislukt.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap size={18} />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-semibold">Lessons learned</div>
            <div className="truncate text-sm text-muted-foreground">Besteed Het Uit</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="sr-only sm:not-sr-only">Vernieuwen</span>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft size={16} /> <span className="sr-only sm:not-sr-only">Terug naar werkplek</span>
            </Link>
          </Button>
          <ModeToggle />
        </div>
      </header>

      <div className="mx-auto mb-5 max-w-[1040px]">
        <h1 className="mb-1.5 text-2xl font-semibold">Leerpunten uit afgeronde projecten</h1>
        <p className="max-w-[720px] text-sm text-muted-foreground">
          Leg vast wat aantoonbaar werkte en wat punten kostte. Bij een nieuw project kiest de schrijfagent
          automatisch de relevante leerpunten als input. Leerpunten stel je het makkelijkst op via
          &laquo;Evalueer &amp; leer&raquo; op de werkplek; hier beheer je de hele database.
        </p>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        {status ? <p className="mt-2 text-sm text-muted-foreground">{status}</p> : null}
      </div>

      <div className="mx-auto flex max-w-[1040px] flex-col gap-5">
        {/* Nieuw leerpunt */}
        <Card>
          <CardContent className="grid gap-3 pt-5">
            <div className="flex items-center gap-2 text-primary">
              <Plus size={17} />
              <h2 className="text-sm font-semibold">Nieuw leerpunt toevoegen</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="new-title">Projecttitel</Label>
                <Input
                  id="new-title"
                  value={form.projectTitle}
                  onChange={(event) => setForm({ ...form, projectTitle: event.target.value })}
                  placeholder="Aanbesteding / project"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="new-buyer">Opdrachtgever</Label>
                <Input
                  id="new-buyer"
                  value={form.buyer}
                  onChange={(event) => setForm({ ...form, buyer: event.target.value })}
                  placeholder="Optioneel"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="new-outcome">Uitkomst</Label>
                <Select value={form.outcome} onValueChange={(value) => setForm({ ...form, outcome: value as LessonOutcome })}>
                  <SelectTrigger id="new-outcome">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {lessonOutcomes.map((value) => (
                      <SelectItem key={value} value={value}>
                        {lessonOutcomeLabels[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="new-category">Categorie / thema</Label>
                <Input
                  id="new-category"
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  placeholder="bijv. prijs, bewijslast, social return"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-lesson">Leerpunt</Label>
              <Textarea
                id="new-lesson"
                value={form.lesson}
                onChange={(event) => setForm({ ...form, lesson: event.target.value })}
                rows={2}
                placeholder="Het leerpunt zelf"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="new-situation">Context</Label>
                <Textarea
                  id="new-situation"
                  value={form.situation}
                  onChange={(event) => setForm({ ...form, situation: event.target.value })}
                  rows={2}
                  placeholder="Wat speelde er"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="new-recommendation">Aanbeveling</Label>
                <Textarea
                  id="new-recommendation"
                  value={form.recommendation}
                  onChange={(event) => setForm({ ...form, recommendation: event.target.value })}
                  rows={2}
                  placeholder="Hoe toe te passen bij een volgend project"
                />
              </div>
            </div>
            <div>
              <Button onClick={() => void handleCreate()} disabled={savingNew}>
                {savingNew ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Leerpunt opslaan
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Zoek in leerpunten…"
            className="max-w-xs"
          />
          <Select value={filterOutcome} onValueChange={(value) => setFilterOutcome(value as LessonOutcome | 'alle')}>
            <SelectTrigger className="max-w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle uitkomsten</SelectItem>
              {lessonOutcomes.map((value) => (
                <SelectItem key={value} value={value}>
                  {lessonOutcomeLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {filtered.length} van {lessons.length} leerpunt(en)
          </span>
        </div>

        {/* Lijst */}
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Leerpunten laden…
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen leerpunten. Voeg er hierboven één toe of gebruik &laquo;Evalueer &amp; leer&raquo; op de werkplek.
          </p>
        ) : (
          <div className="grid gap-3">
            {filtered.map((lesson) => {
              const isEditing = editingId === lesson.id
              return (
                <Card key={lesson.id}>
                  <CardContent className="grid gap-2 pt-5">
                    {isEditing ? (
                      <div className="grid gap-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input
                            value={draftEdit.projectTitle ?? ''}
                            onChange={(event) => setDraftEdit({ ...draftEdit, projectTitle: event.target.value })}
                            placeholder="Projecttitel"
                          />
                          <Input
                            value={draftEdit.buyer ?? ''}
                            onChange={(event) => setDraftEdit({ ...draftEdit, buyer: event.target.value })}
                            placeholder="Opdrachtgever"
                          />
                          <Select
                            value={draftEdit.outcome ?? 'onbekend'}
                            onValueChange={(value) => setDraftEdit({ ...draftEdit, outcome: value as LessonOutcome })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {lessonOutcomes.map((value) => (
                                <SelectItem key={value} value={value}>
                                  {lessonOutcomeLabels[value]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={draftEdit.category ?? ''}
                            onChange={(event) => setDraftEdit({ ...draftEdit, category: event.target.value })}
                            placeholder="Categorie"
                          />
                        </div>
                        <Textarea
                          value={draftEdit.lesson ?? ''}
                          onChange={(event) => setDraftEdit({ ...draftEdit, lesson: event.target.value })}
                          rows={2}
                          placeholder="Leerpunt"
                        />
                        <Textarea
                          value={draftEdit.situation ?? ''}
                          onChange={(event) => setDraftEdit({ ...draftEdit, situation: event.target.value })}
                          rows={2}
                          placeholder="Context"
                        />
                        <Textarea
                          value={draftEdit.recommendation ?? ''}
                          onChange={(event) => setDraftEdit({ ...draftEdit, recommendation: event.target.value })}
                          rows={2}
                          placeholder="Aanbeveling"
                        />
                        <div className="flex gap-2">
                          <Button onClick={() => void saveEdit()} disabled={busyId === lesson.id}>
                            {busyId === lesson.id ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            Opslaan
                          </Button>
                          <Button variant="ghost" onClick={() => { setEditingId(null); setDraftEdit({}) }}>
                            Annuleren
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={outcomeBadgeClass[lesson.outcome]}>{lessonOutcomeLabels[lesson.outcome]}</Badge>
                          {lesson.category ? <Badge variant="secondary">{lesson.category}</Badge> : null}
                          <span className="text-sm font-medium">{lesson.projectTitle}</span>
                          {lesson.buyer ? <span className="text-sm text-muted-foreground">· {lesson.buyer}</span> : null}
                        </div>
                        <p className="font-medium">{lesson.lesson}</p>
                        {lesson.situation ? (
                          <p className="text-sm text-muted-foreground"><strong>Context:</strong> {lesson.situation}</p>
                        ) : null}
                        {lesson.recommendation ? (
                          <p className="text-sm text-muted-foreground"><strong>Aanbeveling:</strong> {lesson.recommendation}</p>
                        ) : null}
                        <div className="flex gap-2 pt-1">
                          <Button variant="outline" size="sm" onClick={() => startEdit(lesson)}>
                            Bewerken
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleDelete(lesson.id)}
                            disabled={busyId === lesson.id}
                          >
                            <Trash2 size={15} /> Verwijderen
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
