import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  FileText,
  Loader2,
  PenLine,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { getCompanyConfig, saveCompanyConfig } from '../lib/companyConfig'
import { enrichCompanyFromWebsite } from '../lib/companyEnrichApi'
import { readFileContent } from '../lib/extractTextApi'
import FileUploadZone from '../components/FileUploadZone'
import { acceptedStyleExtensions } from '../types/styleDocument'
import type { CompanyConfig, CompanyFile } from '../types/companyConfig'
import type { CompanyEnrichFields } from '../types/companyEnrich'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
            <div className="truncate text-sm text-muted-foreground">Besteed Het Uit</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ModeToggle />
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft size={16} /> <span className="sr-only sm:not-sr-only">Terug naar werkplek</span>
            </Link>
          </Button>
        </div>
      </header>

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
              formatsLabel="PDF, Word, PowerPoint, Excel, txt, md, csv — max. 12 MB per bestand"
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
