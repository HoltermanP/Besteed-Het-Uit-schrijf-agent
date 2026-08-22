'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BadgeCheck, Library, Loader2, Plus, RefreshCw, Save, ShieldAlert, Trash2 } from 'lucide-react'
import {
  createEvidenceBlock,
  deleteEvidenceBlock,
  fetchEvidenceBlocks,
  updateEvidenceBlock,
} from '../lib/evidenceBlocksApi'
import { evidenceHandle, evidenceUsability, evidenceValueLabel } from '../lib/evidence'
import {
  evidenceKindLabels,
  evidenceKinds,
  evidenceUsabilityLabels,
  type EvidenceBlock,
  type EvidenceBlockInput,
  type EvidenceKind,
  type EvidenceUsability,
} from '../types/evidenceBlock'
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

/*
 * Beheer van de bewijsbibliotheek: referenties, cases en cijfers als losse bouwstenen.
 * Eén bouwsteen = één feit met de bron erbij. Zonder bron blijft hij hier staan als
 * "geen bewijs vastgelegd" en gaat hij niet mee naar de schrijfagent — precies het
 * verschil tussen citeren en verzinnen.
 */

const usabilityBadgeClass: Record<EvidenceUsability, string> = {
  citeerbaar: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  'geen-bewijs': 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
  verlopen: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
}

const kindHints: Record<EvidenceKind, string> = {
  referentie: 'Een uitgevoerde opdracht die als referentie mag worden opgevoerd.',
  case: 'Een uitgewerkt praktijkvoorbeeld: situatie, aanpak, resultaat.',
  cijfer: 'Een kengetal of prestatie met waarde en peilmoment.',
}

type EvidenceForm = {
  kind: EvidenceKind
  title: string
  client: string
  period: string
  category: string
  situation: string
  claim: string
  result: string
  value: string
  unit: string
  proof: string
  verifiedOn: string
  validUntil: string
}

const emptyForm: EvidenceForm = {
  kind: 'referentie',
  title: '',
  client: '',
  period: '',
  category: '',
  situation: '',
  claim: '',
  result: '',
  value: '',
  unit: '',
  proof: '',
  verifiedOn: '',
  validUntil: '',
}

function toForm(block: EvidenceBlock): EvidenceForm {
  return {
    kind: block.kind,
    title: block.title,
    client: block.client ?? '',
    period: block.period ?? '',
    category: block.category ?? '',
    situation: block.situation,
    claim: block.claim,
    result: block.result,
    value: block.value ?? '',
    unit: block.unit ?? '',
    proof: block.proof,
    verifiedOn: block.verifiedOn ?? '',
    validUntil: block.validUntil ?? '',
  }
}

function toInput(form: EvidenceForm): EvidenceBlockInput {
  return {
    kind: form.kind,
    title: form.title,
    client: form.client || null,
    period: form.period || null,
    category: form.category || null,
    situation: form.situation,
    claim: form.claim,
    result: form.result,
    value: form.value || null,
    unit: form.unit || null,
    proof: form.proof,
    verifiedOn: form.verifiedOn || null,
    validUntil: form.validUntil || null,
  }
}

/** De invoervelden van één bouwsteen; gedeeld door het toevoegformulier en het bewerken. */
function EvidenceFields({
  idPrefix,
  form,
  onChange,
}: {
  idPrefix: string
  form: EvidenceForm
  onChange: (next: EvidenceForm) => void
}) {
  const set = (patch: Partial<EvidenceForm>) => onChange({ ...form, ...patch })

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-kind`}>Soort bouwsteen</Label>
          <Select value={form.kind} onValueChange={(value) => set({ kind: value as EvidenceKind })}>
            <SelectTrigger id={`${idPrefix}-kind`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {evidenceKinds.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {evidenceKindLabels[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{kindHints[form.kind]}</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-title`}>Titel</Label>
          <Input
            id={`${idPrefix}-title`}
            value={form.title}
            onChange={(event) => set({ title: event.target.value })}
            placeholder="Gemeente Utrecht — inkoopondersteuning"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-client`}>Opdrachtgever</Label>
          <Input
            id={`${idPrefix}-client`}
            value={form.client}
            onChange={(event) => set({ client: event.target.value })}
            placeholder="Optioneel"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-period`}>Periode / peilmoment</Label>
          <Input
            id={`${idPrefix}-period`}
            value={form.period}
            onChange={(event) => set({ period: event.target.value })}
            placeholder="2023–2025"
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-claim`}>Feit dat geciteerd mag worden</Label>
        <Textarea
          id={`${idPrefix}-claim`}
          value={form.claim}
          onChange={(event) => set({ claim: event.target.value })}
          rows={2}
          placeholder="Wat mag de schrijfagent letterlijk beweren op basis van deze bouwsteen?"
        />
      </div>

      {form.kind === 'cijfer' ? (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-value`}>Waarde</Label>
            <Input
              id={`${idPrefix}-value`}
              value={form.value}
              onChange={(event) => set({ value: event.target.value })}
              placeholder="98"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-unit`}>Eenheid</Label>
            <Input
              id={`${idPrefix}-unit`}
              value={form.unit}
              onChange={(event) => set({ unit: event.target.value })}
              placeholder="% / fte / €"
            />
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-situation`}>Context</Label>
          <Textarea
            id={`${idPrefix}-situation`}
            value={form.situation}
            onChange={(event) => set({ situation: event.target.value })}
            rows={2}
            placeholder="Wat hield de opdracht in / wat speelde er"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-result`}>Resultaat</Label>
          <Textarea
            id={`${idPrefix}-result`}
            value={form.result}
            onChange={(event) => set({ result: event.target.value })}
            rows={2}
            placeholder="Aantoonbaar effect voor de opdrachtgever"
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-proof`}>Bewijs</Label>
        <Textarea
          id={`${idPrefix}-proof`}
          value={form.proof}
          onChange={(event) => set({ proof: event.target.value })}
          rows={2}
          placeholder="Waar staat het bewijs? Contract, referentieverklaring, dashboard, contactpersoon…"
        />
        <p className="text-xs text-muted-foreground">
          Zonder bewijs blijft de bouwsteen hier staan, maar de schrijfagent krijgt hem niet: onbewezen is onbruikbaar.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-category`}>Thema</Label>
          <Input
            id={`${idPrefix}-category`}
            value={form.category}
            onChange={(event) => set({ category: event.target.value })}
            placeholder="social return, ICT…"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-verified`}>Geverifieerd op</Label>
          <Input
            id={`${idPrefix}-verified`}
            type="date"
            value={form.verifiedOn}
            onChange={(event) => set({ verifiedOn: event.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-valid`}>Houdbaar tot</Label>
          <Input
            id={`${idPrefix}-valid`}
            type="date"
            value={form.validUntil}
            onChange={(event) => set({ validUntil: event.target.value })}
          />
        </div>
      </div>
    </div>
  )
}

export default function EvidencePage() {
  const [blocks, setBlocks] = useState<EvidenceBlock[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [filterKind, setFilterKind] = useState<EvidenceKind | 'alle'>('alle')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<EvidenceForm>(emptyForm)
  const [savingNew, setSavingNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EvidenceForm>(emptyForm)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    return fetchEvidenceBlocks()
      .then((data) => {
        setBlocks(data)
        setError(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Bewijsbibliotheek ophalen mislukt.'))
      .finally(() => setLoading(false))
  }

  // Eenmalig bij openen; daarna ververst de gebruiker zelf met de knop.
  useEffect(() => {
    void fetchEvidenceBlocks()
      .then((data) => setBlocks(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Bewijsbibliotheek ophalen mislukt.'))
  }, [])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return blocks.filter((block) => {
      if (filterKind !== 'alle' && block.kind !== filterKind) return false
      if (!query) return true
      return [block.title, block.client, block.category, block.claim, block.situation, block.result, block.proof]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    })
  }, [blocks, filterKind, search])

  const citableCount = useMemo(
    () => blocks.filter((block) => evidenceUsability(block) === 'citeerbaar').length,
    [blocks],
  )

  const handleCreate = async () => {
    if (!form.title.trim() || !form.claim.trim()) {
      setStatus('Een titel en het te citeren feit zijn verplicht.')
      return
    }
    setSavingNew(true)
    try {
      const created = await createEvidenceBlock(toInput(form))
      setBlocks((current) => [created, ...current])
      setForm(emptyForm)
      setStatus(
        created.proof.trim()
          ? `Bouwsteen ${evidenceHandle(created.id)} toegevoegd en citeerbaar.`
          : `Bouwsteen ${evidenceHandle(created.id)} toegevoegd, maar zonder bewijs — de schrijfagent gebruikt hem nog niet.`,
      )
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Opslaan mislukt.')
    } finally {
      setSavingNew(false)
    }
  }

  const startEdit = (block: EvidenceBlock) => {
    setEditingId(block.id)
    setEditForm(toForm(block))
    setStatus(null)
  }

  const saveEdit = async () => {
    if (!editingId) return
    setBusyId(editingId)
    try {
      const updated = await updateEvidenceBlock({ id: editingId, ...toInput(editForm) })
      setBlocks((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setEditingId(null)
      setStatus('Bouwsteen bijgewerkt.')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Bijwerken mislukt.')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (id: string) => {
    setBusyId(id)
    try {
      await deleteEvidenceBlock(id)
      setBlocks((current) => current.filter((item) => item.id !== id))
      if (editingId === id) setEditingId(null)
      setStatus('Bouwsteen verwijderd.')
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
            <Library size={18} />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-semibold">Bewijsbibliotheek</div>
            <div className="truncate text-sm text-muted-foreground">Referenties, cases en cijfers</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="sr-only sm:not-sr-only">Vernieuwen</span>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft size={16} /> <span className="sr-only sm:not-sr-only">Terug naar werkplek</span>
            </Link>
          </Button>
          <ModeToggle />
        </div>
      </header>

      <div className="mx-auto mb-5 max-w-[1040px]">
        <h1 className="mb-1.5 text-2xl font-semibold">Bewijs als losse bouwstenen</h1>
        <p className="max-w-[760px] text-sm text-muted-foreground">
          Leg elke referentie, case en elk cijfer één keer vast, mét de bron erbij. Bij het schrijven kiest de agent de
          bouwstenen die bij het stuk horen en citeert hij daaruit — in plaats van feiten te verzinnen. De AI-review
          legt daarna elke claim in het concept terug op een bouwsteen en markeert wat zonder bewijs staat.
        </p>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        {status ? (
          <p className="mt-2 text-sm text-muted-foreground" role="status">
            {status}
          </p>
        ) : null}
      </div>

      <div className="mx-auto flex max-w-[1040px] flex-col gap-5">
        <Card>
          <CardContent className="grid gap-3 pt-5">
            <div className="flex items-center gap-2 text-primary">
              <Plus size={17} />
              <h2 className="text-sm font-semibold">Nieuwe bouwsteen toevoegen</h2>
            </div>
            <EvidenceFields idPrefix="new" form={form} onChange={setForm} />
            <div>
              <Button onClick={() => void handleCreate()} disabled={savingNew}>
                {savingNew ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Bouwsteen opslaan
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Zoek in bouwstenen…"
            className="max-w-xs"
          />
          <Select value={filterKind} onValueChange={(value) => setFilterKind(value as EvidenceKind | 'alle')}>
            <SelectTrigger className="max-w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle soorten</SelectItem>
              {evidenceKinds.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {evidenceKindLabels[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground" data-testid="evidence-count">
            {filtered.length} van {blocks.length} bouwsteen(en) · {citableCount} citeerbaar
          </span>
        </div>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Bouwstenen laden…
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen bouwstenen. Voeg hierboven een referentie, case of cijfer toe.
          </p>
        ) : (
          <div className="grid gap-3">
            {filtered.map((block) => {
              const usability = evidenceUsability(block)
              const value = evidenceValueLabel(block)
              const isEditing = editingId === block.id
              return (
                <Card key={block.id} data-testid="evidence-block">
                  <CardContent className="grid gap-2 pt-5">
                    {isEditing ? (
                      <div className="grid gap-3">
                        <EvidenceFields idPrefix={`edit-${block.id}`} form={editForm} onChange={setEditForm} />
                        <div className="flex gap-2">
                          <Button onClick={() => void saveEdit()} disabled={busyId === block.id}>
                            {busyId === block.id ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            Opslaan
                          </Button>
                          <Button variant="ghost" onClick={() => setEditingId(null)}>
                            Annuleren
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="font-mono text-[11px]">
                            {evidenceHandle(block.id)}
                          </Badge>
                          <Badge variant="secondary">{evidenceKindLabels[block.kind]}</Badge>
                          <Badge className={usabilityBadgeClass[usability]}>
                            {usability === 'citeerbaar' ? <BadgeCheck size={13} /> : <ShieldAlert size={13} />}
                            {evidenceUsabilityLabels[usability]}
                          </Badge>
                          {block.category ? <Badge variant="secondary">{block.category}</Badge> : null}
                          <span className="text-sm font-medium">{block.title}</span>
                          {block.client ? <span className="text-sm text-muted-foreground">· {block.client}</span> : null}
                          {block.period ? <span className="text-sm text-muted-foreground">· {block.period}</span> : null}
                        </div>
                        <p className="font-medium">
                          {value ? <span className="mr-1.5 font-bold text-primary">{value}</span> : null}
                          {block.claim}
                        </p>
                        {block.situation ? (
                          <p className="text-sm text-muted-foreground">
                            <strong>Context:</strong> {block.situation}
                          </p>
                        ) : null}
                        {block.result ? (
                          <p className="text-sm text-muted-foreground">
                            <strong>Resultaat:</strong> {block.result}
                          </p>
                        ) : null}
                        <p
                          className={
                            block.proof.trim()
                              ? 'text-sm text-muted-foreground'
                              : 'text-sm font-medium text-destructive'
                          }
                        >
                          <strong>Bewijs:</strong>{' '}
                          {block.proof.trim() || 'ontbreekt — leg vast waar dit feit op gebaseerd is.'}
                          {block.verifiedOn ? ` (geverifieerd ${block.verifiedOn})` : ''}
                          {block.validUntil ? ` · houdbaar tot ${block.validUntil}` : ''}
                        </p>
                        <div className="flex gap-2 pt-1">
                          <Button variant="outline" size="sm" onClick={() => startEdit(block)}>
                            Bewerken
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleDelete(block.id)}
                            disabled={busyId === block.id}
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
