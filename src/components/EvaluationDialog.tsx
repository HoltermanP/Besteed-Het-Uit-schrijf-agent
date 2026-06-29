import { useState } from 'react'
import { GraduationCap, Loader2, Plus, Save, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createLesson, evaluateProjectViaApi } from '../lib/lessonsLearnedApi'
import {
  lessonOutcomeLabels,
  lessonOutcomes,
  type LessonDraft,
  type LessonOutcome,
} from '../types/lessonLearned'
import type { TenderAnalysis } from '../types/tenderAnalysis'

type EditableLesson = LessonDraft & { _saved?: boolean }

type Props = {
  project: { title: string; buyer: string; deadline: string; tendernedId: string }
  draft: string
  analysis: TenderAnalysis | null
  sourceTenderId: string | null
  /** Aangeroepen nadat één of meer leerpunten zijn opgeslagen, zodat de bibliotheek kan verversen. */
  onSaved?: () => void
}

export default function EvaluationDialog({ project, draft, analysis, sourceTenderId, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [outcome, setOutcome] = useState<LessonOutcome>('onbekend')
  const [score, setScore] = useState('')
  const [reflection, setReflection] = useState('')
  const [generating, setGenerating] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [lessons, setLessons] = useState<EditableLesson[]>([])

  const reset = () => {
    setOutcome('onbekend')
    setScore('')
    setReflection('')
    setGenerating(false)
    setSavingAll(false)
    setStatus(null)
    setLessons([])
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setStatus('De AI stelt leerpunten op uit dit project…')
    try {
      const result = await evaluateProjectViaApi({
        project,
        outcome,
        reflection,
        draft,
        analysis,
      })
      if (!result.lessons.length) {
        setStatus('De AI vond geen concrete leerpunten. Vul ze hieronder handmatig aan of verfijn je reflectie.')
        setLessons([])
      } else {
        setLessons(result.lessons.map((l) => ({ ...l })))
        setStatus(`${result.lessons.length} leerpunt(en) voorgesteld door ${result.provider} (${result.model}). Bewerk en sla op.`)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'AI-evaluatie mislukt.')
    } finally {
      setGenerating(false)
    }
  }

  const updateLesson = (index: number, patch: Partial<EditableLesson>) => {
    setLessons((current) => current.map((l, i) => (i === index ? { ...l, ...patch, _saved: false } : l)))
  }

  const addBlankLesson = () => {
    setLessons((current) => [...current, { category: '', situation: '', lesson: '', recommendation: '' }])
  }

  const removeLesson = (index: number) => {
    setLessons((current) => current.filter((_, i) => i !== index))
  }

  const saveOne = async (index: number): Promise<boolean> => {
    const item = lessons[index]
    if (!item.lesson.trim()) return false
    await createLesson({
      projectTitle: project.title,
      buyer: project.buyer || null,
      outcome,
      score: score.trim() ? Number(score) : null,
      category: item.category.trim() || null,
      situation: item.situation,
      lesson: item.lesson,
      recommendation: item.recommendation,
      sourceTenderId,
    })
    setLessons((current) => current.map((l, i) => (i === index ? { ...l, _saved: true } : l)))
    return true
  }

  const handleSaveAll = async () => {
    const toSave = lessons.filter((l) => l.lesson.trim() && !l._saved)
    if (!toSave.length) {
      setStatus('Geen nieuwe leerpunten om op te slaan.')
      return
    }
    setSavingAll(true)
    setStatus('Leerpunten opslaan in de database…')
    let saved = 0
    try {
      for (let i = 0; i < lessons.length; i += 1) {
        if (lessons[i].lesson.trim() && !lessons[i]._saved) {
          const ok = await saveOne(i)
          if (ok) saved += 1
        }
      }
      setStatus(`${saved} leerpunt(en) opgeslagen in de lessons learned database.`)
      onSaved?.()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Opslaan mislukt.')
    } finally {
      setSavingAll(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <GraduationCap size={17} /> Evalueer & leer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap size={18} /> Project evalueren — leerpunten vastleggen
          </DialogTitle>
          <DialogDescription>
            Rond dit project af met een evaluatie. De AI destilleert herbruikbare leerpunten uit het concept en jouw
            reflectie; bewaar ze in de lessons learned database voor toekomstige aanbestedingen.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="eval-outcome">Uitkomst</Label>
              <Select value={outcome} onValueChange={(value) => setOutcome(value as LessonOutcome)}>
                <SelectTrigger id="eval-outcome">
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
              <Label htmlFor="eval-score">Score (optioneel, 0–100)</Label>
              <Input
                id="eval-score"
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(event) => setScore(event.target.value)}
                placeholder="bijv. 82"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="eval-reflection">Reflectie — wat ging goed/fout, feedback opdrachtgever</Label>
            <Textarea
              id="eval-reflection"
              value={reflection}
              onChange={(event) => setReflection(event.target.value)}
              rows={4}
              placeholder="Bijv.: prijs was te hoog ingezet, plan van aanpak scoorde sterk, opdrachtgever miste concrete KPI's bij social return…"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void handleGenerate()} disabled={generating}>
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {generating ? 'Leerpunten opstellen…' : 'Genereer leerpunten'}
            </Button>
            <Button variant="ghost" onClick={addBlankLesson} disabled={generating}>
              <Plus size={16} /> Handmatig toevoegen
            </Button>
          </div>

          {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}

          {lessons.length ? (
            <div className="grid gap-3">
              {lessons.map((lesson, index) => (
                <div key={index} className="rounded-lg border border-border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Input
                      value={lesson.category}
                      onChange={(event) => updateLesson(index, { category: event.target.value })}
                      placeholder="Categorie / thema (bijv. prijs, bewijslast)"
                      className="h-8 max-w-xs text-sm"
                    />
                    <div className="flex items-center gap-1">
                      {lesson._saved ? (
                        <span className="text-xs font-medium text-emerald-600">Opgeslagen</span>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeLesson(index)}
                        aria-label="Leerpunt verwijderen"
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Textarea
                      value={lesson.lesson}
                      onChange={(event) => updateLesson(index, { lesson: event.target.value })}
                      rows={2}
                      placeholder="Het leerpunt"
                    />
                    <Textarea
                      value={lesson.situation}
                      onChange={(event) => updateLesson(index, { situation: event.target.value })}
                      rows={2}
                      placeholder="Context — wat speelde er"
                      className="text-sm"
                    />
                    <Textarea
                      value={lesson.recommendation}
                      onChange={(event) => updateLesson(index, { recommendation: event.target.value })}
                      rows={2}
                      placeholder="Aanbeveling — hoe toe te passen bij een volgend project"
                      className="text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Sluiten
          </Button>
          <Button onClick={() => void handleSaveAll()} disabled={savingAll || !lessons.some((l) => l.lesson.trim() && !l._saved)}>
            {savingAll ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Opslaan in database
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
