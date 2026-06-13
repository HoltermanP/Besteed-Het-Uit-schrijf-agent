import { useRef, useState, type FormEvent } from 'react'
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
import type { CompanyConfig, CompanyFile } from '../types/companyConfig'
import type { CompanyEnrichFields } from '../types/companyEnrich'
import '../Admin.css'
import '../Config.css'

const makeId = () => Math.random().toString(36).slice(2, 10)

export default function ConfigPage() {
  const [config, setConfig] = useState<CompanyConfig>(() => getCompanyConfig())
  const [saved, setSaved] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [enrichStatus, setEnrichStatus] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    const loaded: CompanyFile[] = await Promise.all(
      Array.from(files).map(async (file) => ({
        id: makeId(),
        name: file.name,
        content: await file.text(),
        uploadedAt: new Date().toISOString(),
      })),
    )
    update({ files: [...config.files, ...loaded] })
    if (fileInputRef.current) fileInputRef.current.value = ''
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
    <main className="admin-shell config-shell">
      <header className="admin-topbar">
        <div className="brand">
          <div className="brand-mark"><PenLine size={20} /></div>
          <div>
            <strong>Configuratie</strong>
            <span>Besteed Het Uit</span>
          </div>
        </div>
        <div className="admin-topbar-actions">
          <Link className="secondary admin-link" to="/">
            <ArrowLeft size={16} /> Terug naar werkplek
          </Link>
        </div>
      </header>

      <form className="admin-grid config-grid" onSubmit={handleSubmit}>
        <section className="admin-card config-card-wide">
          <div className="admin-card-header">
            <Building2 size={20} />
            <div>
              <h2>Bedrijfsgegevens</h2>
              <p>Basisinformatie die in inschrijvingen en analyse wordt gebruikt.</p>
            </div>
          </div>
          <div className="config-fields-grid">
            <label>
              Bedrijfsnaam
              <input
                value={config.name}
                onChange={(event) => update({ name: event.target.value })}
                placeholder="Besteed Het Uit"
              />
            </label>
            <label>
              Tagline / positionering
              <input
                value={config.tagline}
                onChange={(event) => update({ tagline: event.target.value })}
                placeholder="Bidmanagement en AI-ondersteunde inschrijvingen"
              />
            </label>
            <label>
              KVK-nummer
              <input
                value={config.kvk}
                onChange={(event) => update({ kvk: event.target.value })}
                placeholder="12345678"
              />
            </label>
            <label className="config-span-2">
              Website
              <div className="config-website-row">
                <input
                  value={config.website}
                  onChange={(event) => update({ website: event.target.value })}
                  placeholder="https://www.bedrijf.nl"
                />
                <button
                  className="secondary config-enrich-btn"
                  type="button"
                  disabled={enriching || !config.website.trim()}
                  onClick={handleEnrichFromWebsite}
                >
                  {enriching ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                  {enriching ? 'Bezig…' : 'Gegevens ophalen'}
                </button>
              </div>
              <span className="config-field-hint">
                Haalt feiten op van de website en aanvullende openbare bronnen. Alleen expliciet
                vermelde informatie wordt ingevuld. AI via API-beheer of server ANTHROPIC_API_KEY.
              </span>
              {enrichStatus ? <p className="status config-enrich-status">{enrichStatus}</p> : null}
            </label>
            <label className="config-span-2">
              Contact e-mail
              <input
                type="email"
                value={config.contactEmail}
                onChange={(event) => update({ contactEmail: event.target.value })}
                placeholder="tenders@bedrijf.nl"
              />
            </label>
          </div>
        </section>

        <section className="admin-card config-card-wide">
          <div className="admin-card-header">
            <FileText size={20} />
            <div>
              <h2>Profiel &amp; bewijs</h2>
              <p>Teksten voor schrijfstijl, competenties en referenties in het concept.</p>
            </div>
          </div>
          <label>
            Bedrijfsprofiel
            <textarea
              rows={5}
              value={config.profile}
              onChange={(event) => update({ profile: event.target.value })}
              placeholder="Wie zijn jullie, wat doen jullie en voor wie?"
            />
          </label>
          <label>
            Kerncompetenties
            <textarea
              rows={3}
              value={config.competencies}
              onChange={(event) => update({ competencies: event.target.value })}
              placeholder="Comma-gescheiden of korte opsomming"
            />
          </label>
          <label>
            Onderscheidend vermogen (USP&apos;s)
            <textarea
              rows={3}
              value={config.usps}
              onChange={(event) => update({ usps: event.target.value })}
              placeholder="Waarom jullie kiezen boven concurrenten?"
            />
          </label>
          <label>
            Referenties &amp; cases
            <textarea
              rows={4}
              value={config.references}
              onChange={(event) => update({ references: event.target.value })}
              placeholder="Projecten, opdrachtgevers, resultaten"
            />
          </label>
        </section>

        <section className="admin-card config-card-wide">
          <div className="admin-card-header">
            <Upload size={20} />
            <div>
              <h2>Documenten uploaden</h2>
              <p>Bedrijfsdocumenten (.txt, .md, .csv) worden als bedrijfsbron opgeslagen.</p>
            </div>
          </div>
          <label className="config-upload">
            <Upload size={17} /> Bestanden kiezen
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,.csv,.json,text/plain,text/markdown"
              onChange={(event) => handleFileUpload(event.target.files)}
            />
          </label>
          {config.files.length ? (
            <ul className="config-file-list">
              {config.files.map((file) => (
                <li key={file.id}>
                  <div>
                    <strong>{file.name}</strong>
                    <span>{file.content.length.toLocaleString('nl-NL')} tekens</span>
                  </div>
                  <button type="button" className="secondary tiny" onClick={() => removeFile(file.id)}>
                    <Trash2 size={14} /> Verwijder
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="status">Nog geen documenten geüpload.</p>
          )}
        </section>

        <footer className="admin-footer">
          <p className="status">
            {saved
              ? 'Bedrijfsconfiguratie opgeslagen. De werkplek gebruikt deze info bij analyse en generatie.'
              : 'Wijzigingen worden lokaal opgeslagen na opslaan.'}
          </p>
          <button className="primary" type="submit">
            <Save size={16} /> Opslaan
          </button>
        </footer>
      </form>
    </main>
  )
}
