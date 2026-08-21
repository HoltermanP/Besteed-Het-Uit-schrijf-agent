'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  FileText,
  Loader2,
  PenLine,
  Plus,
  Save,
  Sparkles,
  Tags,
  Trash2,
  Upload,
} from 'lucide-react'
import { getCompanyConfig, saveCompanyConfig } from '../lib/companyConfig'
import {
  createCompany,
  getActiveCompanyId,
  getCompanies,
  removeCompany,
  setActiveCompanyId,
} from '../lib/companies'
import { flushStorage } from '../lib/storage'
import { defaultCompanyConfig } from '../types/companyConfig'
import { enrichCompanyFromWebsite } from '../lib/companyEnrichApi'
import { suggestCpvCodesForCompany } from '../lib/cpvSuggestApi'
import { normalizeCpvCode } from '../lib/cpv'
import { readFileContent } from '../lib/extractTextApi'
import FileUploadZone from '../components/FileUploadZone'
import { acceptedStyleExtensions } from '../types/styleDocument'
import type { CompanyConfig, CompanyCpvCode, CompanyFile } from '../types/companyConfig'
import type { CompanyEnrichFields } from '../types/companyEnrich'
import type { CpvSuggestion } from '../types/cpvSuggest'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ModeToggle } from '@/components/mode-toggle'

const makeId = () => Math.random().toString(36).slice(2, 10)

export default function ConfigPage() {
  const [config, setConfig] = useState<CompanyConfig>(() => getCompanyConfig())
  const [saved, setSaved] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [enrichStatus, setEnrichStatus] = useState('')
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [cpvSuggesting, setCpvSuggesting] = useState(false)
  const [cpvStatus, setCpvStatus] = useState('')
  const [cpvSuggestions, setCpvSuggestions] = useState<CpvSuggestion[]>([])
  const [newCpvCode, setNewCpvCode] = useState('')
  const [newCpvDescription, setNewCpvDescription] = useState('')
  // Wisselen/aanmaken/verwijderen eindigt altijd in een reload, dus deze twee
  // hoeven binnen de pagina niet te muteren.
  const [companies] = useState(() => getCompanies())
  const [activeCompanyId] = useState(() => getActiveCompanyId())
  const [newCompanyName, setNewCompanyName] = useState('')
  const [companyBusy, setCompanyBusy] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const activeCompany = companies.find((company) => company.id === activeCompanyId) ?? companies[0]

  // Wissel van bedrijf: eerst openstaande wijzigingen wegschrijven, dan de
  // pagina herladen zodat alle views de data van het nieuwe bedrijf inlezen.
  const switchCompany = async (id: string) => {
    if (id === activeCompanyId) return
    setCompanyBusy(true)
    setActiveCompanyId(id)
    await flushStorage()
    window.location.reload()
  }

  const handleCreateCompany = async () => {
    const name = newCompanyName.trim()
    if (!name) return
    setCompanyBusy(true)
    const company = createCompany(name)
    setActiveCompanyId(company.id)
    // Verse, lege configuratie voor het nieuwe bedrijf (schrijft onder de
    // nieuwe bedrijfsscope, want de active-pointer is zojuist omgezet).
    saveCompanyConfig({
      ...defaultCompanyConfig,
      name,
      tagline: '',
      profile: '',
      competencies: '',
      usps: '',
      references: '',
      files: [],
    })
    await flushStorage()
    window.location.reload()
  }

  const handleRemoveCompany = async (id: string) => {
    if (companies.length <= 1) return
    const target = companies.find((company) => company.id === id)
    if (!target) return
    const confirmed = window.confirm(
      `Bedrijf "${target.name}" verwijderen? Alle projecten, bronnen en opgeslagen aanbestedingen van dit bedrijf worden definitief verwijderd.`,
    )
    if (!confirmed) return
    setCompanyBusy(true)
    removeCompany(id)
    await flushStorage()
    window.location.reload()
  }

  const formatCreatedAt = (iso: string) => {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const update = (patch: Partial<CompanyConfig>) => {
    setConfig((current) => ({ ...current, ...patch }))
    setSaved(false)
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    saveCompanyConfig(config)
    setConfig(getCompanyConfig())
    setSaved(true)
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploadingFiles(true)
    setUploadStatus('Bestanden worden uitgelezen…')

    const loaded: CompanyFile[] = []
    const errors: string[] = []

    for (const file of Array.from(files)) {
      try {
        const extracted = await readFileContent(file)
        loaded.push({
          id: makeId(),
          name: file.name,
          content: extracted.text,
          uploadedAt: new Date().toISOString(),
        })
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `${file.name}: upload mislukt`)
      }
    }

    if (loaded.length) {
      update({ files: [...config.files, ...loaded] })
      setUploadStatus(`${loaded.length} document(en) toegevoegd.`)
    }
    if (errors.length) {
      setUploadStatus(errors.join(' · '))
    }
    setUploadingFiles(false)
  }

  const removeFile = (id: string) => {
    update({ files: config.files.filter((file) => file.id !== id) })
  }

  // Voegt codes toe zonder duplicaten (vergeleken op de 8-cijferige basis,
  // zodat "72000000" en "72000000-5" niet naast elkaar komen te staan).
  const addCpvCodes = (entries: CompanyCpvCode[]) => {
    setConfig((current) => {
      const existing = new Set(current.cpvCodes.map((cpv) => cpv.code.slice(0, 8)))
      const additions = entries.filter((entry) => {
        const base = entry.code.slice(0, 8)
        if (existing.has(base)) return false
        existing.add(base)
        return true
      })
      if (!additions.length) return current
      return { ...current, cpvCodes: [...current.cpvCodes, ...additions] }
    })
    setSaved(false)
  }

  const handleAddManualCpv = () => {
    const code = normalizeCpvCode(newCpvCode)
    if (!code) {
      setCpvStatus('Ongeldige CPV-code. Gebruik 8 cijfers, eventueel met controlecijfer (bijv. 72000000-5).')
      return
    }
    if (config.cpvCodes.some((cpv) => cpv.code.slice(0, 8) === code.slice(0, 8))) {
      setCpvStatus('Deze CPV-code staat er al tussen.')
      return
    }
    addCpvCodes([{ code, omschrijving: newCpvDescription.trim() }])
    setNewCpvCode('')
    setNewCpvDescription('')
    setCpvStatus('')
  }

  const removeCpvCode = (code: string) => {
    update({ cpvCodes: config.cpvCodes.filter((cpv) => cpv.code !== code) })
  }

  const applyCpvSuggestion = (suggestion: CpvSuggestion) => {
    addCpvCodes([{ code: suggestion.code, omschrijving: suggestion.omschrijving }])
    setCpvSuggestions((current) => current.filter((item) => item.code !== suggestion.code))
  }

  const applyAllCpvSuggestions = () => {
    addCpvCodes(cpvSuggestions.map((item) => ({ code: item.code, omschrijving: item.omschrijving })))
    setCpvSuggestions([])
  }

  const hasCompanyInfoForCpv = Boolean(
    config.profile.trim() ||
      config.competencies.trim() ||
      config.usps.trim() ||
      config.references.trim() ||
      config.files.length,
  )

  const handleSuggestCpv = async () => {
    setCpvSuggesting(true)
    setCpvSuggestions([])
    setCpvStatus('AI analyseert het bedrijfsprofiel…')
    try {
      const result = await suggestCpvCodesForCompany(config)
      setCpvSuggestions(result.suggestions)
      const note = result.notes ? ` ${result.notes}` : ''
      setCpvStatus(
        result.suggestions.length
          ? `${result.suggestions.length} voorstel${result.suggestions.length === 1 ? '' : 'len'} gevonden. Controleer en voeg toe wat past.${note}`
          : result.notes || 'Geen voorstellen gevonden.',
      )
    } catch (error) {
      setCpvStatus(error instanceof Error ? error.message : 'Voorstellen van CPV-codes mislukt.')
    } finally {
      setCpvSuggesting(false)
    }
  }

  const applyEnrichedFields = (fields: CompanyEnrichFields) => {
    const patch: Partial<CompanyConfig> = {}
    if (fields.name.trim()) patch.name = fields.name.trim()
    if (fields.tagline.trim()) patch.tagline = fields.tagline.trim()
    if (fields.kvk.trim()) patch.kvk = fields.kvk.trim()
    if (fields.website.trim()) patch.website = fields.website.trim()
    if (fields.contactEmail.trim()) patch.contactEmail = fields.contactEmail.trim()
    if (fields.profile.trim()) patch.profile = fields.profile.trim()
    if (fields.competencies.trim()) patch.competencies = fields.competencies.trim()
    if (fields.usps.trim()) patch.usps = fields.usps.trim()
    if (fields.references.trim()) patch.references = fields.references.trim()
    if (Object.keys(patch).length) update(patch)
  }

  const handleEnrichFromWebsite = async () => {
    if (!config.website.trim()) {
      setEnrichStatus('Vul eerst een website in.')
      return
    }

    setEnriching(true)
    setEnrichStatus('Website en openbare bronnen worden opgehaald…')
    setSaved(false)
    try {
      const result = await enrichCompanyFromWebsite(config.website)
      applyEnrichedFields(result.fields)
      const sourceCount = result.sources.length
      const note = result.notes ? ` ${result.notes}` : ''
      setEnrichStatus(
        sourceCount
          ? `${sourceCount} bron${sourceCount === 1 ? '' : 'nen'} verwerkt. Controleer de ingevulde feiten en sla op.${note}`
          : `Geen extra bronnen gevonden.${note}`,
      )
    } catch (error) {
      setEnrichStatus(error instanceof Error ? error.message : 'Ophalen mislukt.')
    } finally {
      setEnriching(false)
    }
  }

  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PenLine size={18} />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-semibold">Configuratie</div>
            <div className="truncate text-sm text-muted-foreground">{activeCompany.name}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ModeToggle />
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft size={16} /> <span className="sr-only sm:not-sr-only">Terug naar werkplek</span>
            </Link>
          </Button>
        </div>
      </header>

      <div id="bedrijven" className="mx-auto mb-4 max-w-[920px] scroll-mt-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <Building2 size={20} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">Bedrijven</h2>
                  <p className="text-sm text-muted-foreground">
                    Je kunt meerdere bedrijfsconfiguraties naast elkaar aanmaken. Elk bedrijf heeft
                    zijn eigen bedrijfsprofiel, projecten, bronnen en opgeslagen aanbestedingen.
                    Overal in de applicatie kies je bovenaan voor welk bedrijf je werkt; alles wat
                    je daarna doet, hoort bij dat bedrijf.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                className="shrink-0"
                disabled={companyBusy}
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus size={15} /> Nieuw bedrijf aanmaken
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Bedrijfsconfiguraties</Label>
                <span className="text-xs text-muted-foreground">
                  {companies.length} {companies.length === 1 ? 'bedrijf' : 'bedrijven'}
                </span>
              </div>
              <ul className="divide-y overflow-hidden rounded-lg border">
                {companies.map((company) => {
                  const isActive = company.id === activeCompanyId
                  const createdAt = formatCreatedAt(company.createdAt)
                  return (
                    <li
                      key={company.id}
                      className={`flex flex-wrap items-center gap-3 px-3 py-2.5 ${
                        isActive ? 'bg-primary/5' : 'bg-card'
                      }`}
                    >
                      <div
                        className={`grid size-9 shrink-0 place-items-center rounded-md ${
                          isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        <Building2 size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium">{company.name}</span>
                          {isActive ? (
                            <Badge className="gap-1">
                              <CheckCircle2 size={12} /> Actief
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {isActive
                            ? 'Hier werk je nu voor. De configuratie hieronder hoort bij dit bedrijf.'
                            : createdAt
                              ? `Aangemaakt op ${createdAt}`
                              : 'Eigen projecten, bronnen en aanbestedingen'}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {isActive ? null : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={companyBusy}
                            onClick={() => void switchCompany(company.id)}
                          >
                            {companyBusy ? <Loader2 size={14} className="animate-spin" /> : null}
                            Activeren
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={companyBusy || companies.length <= 1}
                          title={
                            companies.length <= 1
                              ? 'Het laatste bedrijf kan niet worden verwijderd.'
                              : `Verwijder ${company.name} inclusief alle bijbehorende data.`
                          }
                          onClick={() => void handleRemoveCompany(company.id)}
                        >
                          <Trash2 size={15} />
                          <span className="sr-only">Verwijder {company.name}</span>
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Wisselen van bedrijf kan hier én via de bedrijfskiezer in de werkplek en het
              projectoverzicht. Na het wisselen of aanmaken herlaadt de applicatie met de data van
              dat bedrijf. De instellingen hieronder gelden alleen voor {activeCompany.name}.
            </p>
          </CardContent>
        </Card>

        <Dialog
          open={createDialogOpen}
          onOpenChange={(open) => {
            if (companyBusy) return
            setCreateDialogOpen(open)
            if (!open) setNewCompanyName('')
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nieuw bedrijf aanmaken</DialogTitle>
              <DialogDescription>
                Er wordt een nieuwe, lege bedrijfsconfiguratie aangemaakt met een eigen
                bedrijfsprofiel, projecten, bronnen en opgeslagen aanbestedingen. Het nieuwe bedrijf
                wordt direct actief; daarna vul je hieronder de bedrijfsgegevens in. De bestaande
                bedrijven blijven ongewijzigd.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="company-new">Naam van het bedrijf</Label>
              <Input
                id="company-new"
                autoFocus
                value={newCompanyName}
                onChange={(event) => setNewCompanyName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleCreateCompany()
                  }
                }}
                placeholder="Bijv. SMELT EUROPE BV"
                disabled={companyBusy}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={companyBusy}
                onClick={() => setCreateDialogOpen(false)}
              >
                Annuleren
              </Button>
              <Button
                type="button"
                disabled={companyBusy || !newCompanyName.trim()}
                onClick={() => void handleCreateCompany()}
              >
                {companyBusy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                Aanmaken en activeren
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <form className="mx-auto grid max-w-[920px] gap-4" onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <Building2 size={20} className="mt-0.5 shrink-0" />
              <div>
                <h2 className="text-lg font-semibold">Bedrijfsgegevens</h2>
                <p className="text-sm text-muted-foreground">
                  Basisinformatie die in inschrijvingen en analyse wordt gebruikt.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="config-name">Bedrijfsnaam</Label>
                <Input
                  id="config-name"
                  value={config.name}
                  onChange={(event) => update({ name: event.target.value })}
                  placeholder="Besteed Het Uit"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="config-tagline">Tagline / positionering</Label>
                <Input
                  id="config-tagline"
                  value={config.tagline}
                  onChange={(event) => update({ tagline: event.target.value })}
                  placeholder="Bidmanagement en AI-ondersteunde inschrijvingen"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="config-kvk">KVK-nummer</Label>
                <Input
                  id="config-kvk"
                  value={config.kvk}
                  onChange={(event) => update({ kvk: event.target.value })}
                  placeholder="12345678"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="config-website">Website</Label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    id="config-website"
                    className="min-w-0 flex-1"
                    value={config.website}
                    onChange={(event) => update({ website: event.target.value })}
                    placeholder="https://www.bedrijf.nl"
                  />
                  <Button
                    variant="outline"
                    className="shrink-0 whitespace-nowrap"
                    type="button"
                    disabled={enriching || !config.website.trim()}
                    onClick={handleEnrichFromWebsite}
                  >
                    {enriching ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {enriching ? 'Bezig…' : 'Gegevens ophalen'}
                  </Button>
                </div>
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  Haalt feiten op van de website en aanvullende openbare bronnen. Alleen expliciet
                  vermelde informatie wordt ingevuld. AI via API-beheer of server ANTHROPIC_API_KEY.
                </span>
                {enrichStatus ? <p className="text-sm text-muted-foreground">{enrichStatus}</p> : null}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="config-email">Contact e-mail</Label>
                <Input
                  id="config-email"
                  type="email"
                  value={config.contactEmail}
                  onChange={(event) => update({ contactEmail: event.target.value })}
                  placeholder="tenders@bedrijf.nl"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <FileText size={20} className="mt-0.5 shrink-0" />
              <div>
                <h2 className="text-lg font-semibold">Profiel &amp; bewijs</h2>
                <p className="text-sm text-muted-foreground">
                  Teksten voor schrijfstijl, competenties en referenties in het concept.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="config-profile">Bedrijfsprofiel</Label>
              <Textarea
                id="config-profile"
                rows={5}
                value={config.profile}
                onChange={(event) => update({ profile: event.target.value })}
                placeholder="Wie zijn jullie, wat doen jullie en voor wie?"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="config-competencies">Kerncompetenties</Label>
              <Textarea
                id="config-competencies"
                rows={3}
                value={config.competencies}
                onChange={(event) => update({ competencies: event.target.value })}
                placeholder="Comma-gescheiden of korte opsomming"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="config-usps">Onderscheidend vermogen (USP&apos;s)</Label>
              <Textarea
                id="config-usps"
                rows={3}
                value={config.usps}
                onChange={(event) => update({ usps: event.target.value })}
                placeholder="Waarom jullie kiezen boven concurrenten?"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="config-references">Referenties &amp; cases</Label>
              <Textarea
                id="config-references"
                rows={4}
                value={config.references}
                onChange={(event) => update({ references: event.target.value })}
                placeholder="Projecten, opdrachtgevers, resultaten"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <Tags size={20} className="mt-0.5 shrink-0" />
              <div>
                <h2 className="text-lg font-semibold">CPV-codes</h2>
                <p className="text-sm text-muted-foreground">
                  De aanbestedingscategorieën waarbinnen dit bedrijf inschrijft. Gebruikt als
                  filtervoorstel bij het zoeken naar aanbestedingen.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {config.cpvCodes.length ? (
              <ul className="grid gap-2">
                {config.cpvCodes.map((cpv) => (
                  <li
                    key={cpv.code}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="shrink-0 font-mono">
                        {cpv.code}
                      </Badge>
                      <span className="min-w-0 break-words text-sm">
                        {cpv.omschrijving || 'Geen omschrijving'}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => removeCpvCode(cpv.code)}
                    >
                      <Trash2 size={14} /> Verwijder
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nog geen CPV-codes toegevoegd.</p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                className="sm:w-44"
                value={newCpvCode}
                onChange={(event) => setNewCpvCode(event.target.value)}
                placeholder="72000000-5"
                aria-label="CPV-code"
              />
              <Input
                className="min-w-0 flex-1"
                value={newCpvDescription}
                onChange={(event) => setNewCpvDescription(event.target.value)}
                placeholder="Omschrijving (optioneel)"
                aria-label="CPV-omschrijving"
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0 whitespace-nowrap"
                disabled={!newCpvCode.trim()}
                onClick={handleAddManualCpv}
              >
                <Plus size={16} /> Voeg toe
              </Button>
            </div>

            <div className="space-y-2 rounded-md border border-dashed p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  Laat AI relevante CPV-codes voorstellen op basis van het bedrijfsprofiel,
                  de competenties en geüploade documenten.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 whitespace-nowrap"
                  disabled={cpvSuggesting || !hasCompanyInfoForCpv}
                  onClick={handleSuggestCpv}
                >
                  {cpvSuggesting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {cpvSuggesting ? 'Bezig…' : 'Stel CPV-codes voor'}
                </Button>
              </div>
              {!hasCompanyInfoForCpv ? (
                <p className="text-xs text-muted-foreground">
                  Vul eerst het bedrijfsprofiel of de competenties in, of upload documenten.
                </p>
              ) : null}
              {cpvStatus ? <p className="text-sm text-muted-foreground">{cpvStatus}</p> : null}
              {cpvSuggestions.length ? (
                <div className="space-y-2">
                  <ul className="grid gap-2">
                    {cpvSuggestions.map((suggestion) => (
                      <li
                        key={suggestion.code}
                        className="flex items-center justify-between gap-3 rounded-md border bg-card p-3"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="shrink-0 font-mono">
                              {suggestion.code}
                            </Badge>
                            <span className="min-w-0 break-words text-sm">{suggestion.omschrijving}</span>
                          </div>
                          {suggestion.reden ? (
                            <p className="mt-1 text-xs text-muted-foreground">{suggestion.reden}</p>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() => applyCpvSuggestion(suggestion)}
                        >
                          <Plus size={14} /> Voeg toe
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <Button type="button" variant="secondary" size="sm" onClick={applyAllCpvSuggestions}>
                    <Plus size={14} /> Alles toevoegen
                  </Button>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <Upload size={20} className="mt-0.5 shrink-0" />
              <div>
                <h2 className="text-lg font-semibold">Documenten uploaden</h2>
                <p className="text-sm text-muted-foreground">
                  Upload bedrijfsdocumenten als bron voor de schrijfagent. PDF en Office-bestanden worden automatisch uitgelezen.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <FileUploadZone
              accept={acceptedStyleExtensions}
              loading={uploadingFiles}
              title="Sleep bedrijfsdocumenten hierheen of klik om te uploaden"
              hint="Brochures, profielen, referenties — tekst wordt automatisch geëxtraheerd"
              formatsLabel="PDF, Word (ook .doc), PowerPoint, Excel, txt, md, csv — PDF tot 50 MB, overig max. 4 MB"
              onFiles={handleFileUpload}
            />
            {uploadStatus ? <p className="text-sm text-muted-foreground">{uploadStatus}</p> : null}
            {config.files.length ? (
              <ul className="grid gap-2">
                {config.files.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <strong className="block break-words text-sm">{file.name}</strong>
                      <span className="text-xs text-muted-foreground">
                        {file.content.length.toLocaleString('nl-NL')} tekens
                      </span>
                    </div>
                    <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => removeFile(file.id)}>
                      <Trash2 size={14} /> Verwijder
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nog geen documenten geüpload.</p>
            )}
          </CardContent>
        </Card>

        <footer className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
          <p className="min-w-0 text-sm text-muted-foreground">
            {saved
              ? 'Bedrijfsconfiguratie opgeslagen. De werkplek gebruikt deze info bij analyse en generatie.'
              : 'Wijzigingen worden lokaal opgeslagen na opslaan.'}
          </p>
          <Button type="submit" className="shrink-0">
            <Save size={16} /> Opslaan
          </Button>
        </footer>
      </form>
    </main>
  )
}
