import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Brain,
  Building2,
  Database,
  Import,
  LogOut,
  PenLine,
  Save,
  Sparkles,
} from 'lucide-react'
import { getApiConfig, saveApiConfig } from '../lib/apiConfig'
import { aiProviderDefaults } from '../lib/aiProviderDefaults'
import { logoutAdmin } from '../lib/adminAuth'
import { type AiProvider, type ApiConfig } from '../types/apiConfig'
import '../Admin.css'

const providerLabels: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  custom: 'Custom endpoint',
}

export default function AdminPage() {
  const [config, setConfig] = useState<ApiConfig>(() => getApiConfig())
  const [saved, setSaved] = useState(false)

  const updateSection = <K extends keyof ApiConfig>(
    section: K,
    patch: Partial<ApiConfig[K]>,
  ) => {
    setConfig((current) => ({ ...current, [section]: { ...current[section], ...patch } }))
    setSaved(false)
  }

  const updateAiProvider = (section: 'writer' | 'review', provider: AiProvider) => {
    const defaults = aiProviderDefaults[provider]
    updateSection(section, {
      provider,
      baseUrl: defaults.baseUrl,
      model: defaults.model,
    })
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    saveApiConfig(config)
    setSaved(true)
  }

  const handleLogout = () => {
    logoutAdmin()
    window.location.href = '/'
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div className="brand">
          <div className="brand-mark"><PenLine size={20} /></div>
          <div>
            <strong>API-beheer</strong>
            <span>Besteed Het Uit</span>
          </div>
        </div>
        <div className="admin-topbar-actions">
          <Link className="secondary admin-link" to="/configuratie">
            <Building2 size={16} /> Bedrijfsconfiguratie
          </Link>
          <Link className="secondary admin-link" to="/">
            <ArrowLeft size={16} /> Terug naar werkplek
          </Link>
          <button className="secondary" type="button" onClick={handleLogout}>
            <LogOut size={16} /> Uitloggen
          </button>
        </div>
      </header>

      <form className="admin-grid" onSubmit={handleSubmit}>
        <section className="admin-card">
          <div className="admin-card-header">
            <Import size={20} />
            <div>
              <h2>TenderNed API</h2>
              <p>Endpoint en sleutel voor het ophalen van aanbestedingsdossiers.</p>
            </div>
          </div>
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={config.tenderned.enabled}
              onChange={(event) => updateSection('tenderned', { enabled: event.target.checked })}
            />
            TenderNed-koppeling actief
          </label>
          <label>
            Base URL
            <input
              value={config.tenderned.baseUrl}
              onChange={(event) => updateSection('tenderned', { baseUrl: event.target.value })}
              placeholder="/api/tenderned"
            />
          </label>
          <p className="status">
            Publieke TNS-webservice (data.overheid.nl). XML-API credentials alleen nodig voor geavanceerde koppelingen via functioneelbeheer@tenderned.nl.
          </p>
          <label>
            API-sleutel (optioneel, XML-API)
            <input
              type="password"
              autoComplete="off"
              value={config.tenderned.apiKey}
              onChange={(event) => updateSection('tenderned', { apiKey: event.target.value })}
              placeholder="••••••••"
            />
          </label>
        </section>

        <section className="admin-card">
          <div className="admin-card-header">
            <Database size={20} />
            <div>
              <h2>Neon database</h2>
              <p>PostgreSQL connection string voor sync van dossiers en concepten.</p>
            </div>
          </div>
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={config.neon.enabled}
              onChange={(event) => updateSection('neon', { enabled: event.target.checked })}
            />
            Neon-sync actief
          </label>
          <label>
            Connection string
            <input
              data-testid="neon-connection"
              autoComplete="off"
              value={config.neon.connectionString}
              onChange={(event) => updateSection('neon', { connectionString: event.target.value })}
              placeholder="postgresql://..."
            />
          </label>
        </section>

        <section className="admin-card">
          <div className="admin-card-header">
            <Sparkles size={20} />
            <div>
              <h2>Schrijfagent API</h2>
              <p>Model en endpoint voor brons-zilver-goud generatie.</p>
            </div>
          </div>
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={config.writer.enabled}
              onChange={(event) => updateSection('writer', { enabled: event.target.checked })}
            />
            Schrijfagent actief
          </label>
          <label>
            Provider
            <select
              value={config.writer.provider}
              onChange={(event) => updateAiProvider('writer', event.target.value as AiProvider)}
            >
              {(Object.keys(providerLabels) as AiProvider[]).map((provider) => (
                <option key={provider} value={provider}>{providerLabels[provider]}</option>
              ))}
            </select>
          </label>
          <p className="status">{aiProviderDefaults[config.writer.provider].hint}</p>
          <label>
            Base URL
            <input
              value={config.writer.baseUrl}
              onChange={(event) => updateSection('writer', { baseUrl: event.target.value })}
              placeholder="https://api.anthropic.com"
            />
          </label>
          <label>
            Model
            <input
              value={config.writer.model}
              onChange={(event) => updateSection('writer', { model: event.target.value })}
              placeholder="claude-opus-4-8"
            />
          </label>
          <label>
            API-sleutel
            <input
              type="password"
              autoComplete="off"
              value={config.writer.apiKey}
              onChange={(event) => updateSection('writer', { apiKey: event.target.value })}
              placeholder="••••••••"
            />
          </label>
        </section>

        <section className="admin-card">
          <div className="admin-card-header">
            <Brain size={20} />
            <div>
              <h2>Reviewagent API</h2>
              <p>Model en endpoint voor AI-kwaliteitsreview van concepten.</p>
            </div>
          </div>
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={config.review.enabled}
              onChange={(event) => updateSection('review', { enabled: event.target.checked })}
            />
            Reviewagent actief
          </label>
          <label>
            Provider
            <select
              value={config.review.provider}
              onChange={(event) => updateAiProvider('review', event.target.value as AiProvider)}
            >
              {(Object.keys(providerLabels) as AiProvider[]).map((provider) => (
                <option key={provider} value={provider}>{providerLabels[provider]}</option>
              ))}
            </select>
          </label>
          <label>
            Base URL
            <input
              value={config.review.baseUrl}
              onChange={(event) => updateSection('review', { baseUrl: event.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label>
            Model
            <input
              value={config.review.model}
              onChange={(event) => updateSection('review', { model: event.target.value })}
              placeholder="gpt-4.1"
            />
          </label>
          <label>
            API-sleutel
            <input
              type="password"
              autoComplete="off"
              value={config.review.apiKey}
              onChange={(event) => updateSection('review', { apiKey: event.target.value })}
              placeholder="••••••••"
            />
          </label>
        </section>

        <footer className="admin-footer">
          <p className="status">
            {saved ? 'Instellingen opgeslagen in deze browser.' : 'Wijzigingen worden lokaal opgeslagen na opslaan.'}
          </p>
          <button className="primary" type="submit">
            <Save size={16} /> Opslaan
          </button>
        </footer>
      </form>
    </main>
  )
}
