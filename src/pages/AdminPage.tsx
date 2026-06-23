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
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { ModeToggle } from '@/components/mode-toggle'

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
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PenLine size={18} />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-semibold">API-beheer</div>
            <div className="truncate text-sm text-muted-foreground">Besteed Het Uit</div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/configuratie">
              <Building2 size={16} /> <span className="sr-only sm:not-sr-only">Bedrijfsconfiguratie</span>
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft size={16} /> <span className="sr-only sm:not-sr-only">Terug naar werkplek</span>
            </Link>
          </Button>
          <Button variant="outline" type="button" onClick={handleLogout}>
            <LogOut size={16} /> <span className="sr-only sm:not-sr-only">Uitloggen</span>
          </Button>
          <ModeToggle />
        </div>
      </header>

      <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <Import size={20} className="mt-0.5 shrink-0" />
              <div>
                <CardTitle>TenderNed API</CardTitle>
                <CardDescription>
                  Endpoint en sleutel voor het ophalen van aanbestedingsdossiers.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch
                id="tenderned-enabled"
                checked={config.tenderned.enabled}
                onCheckedChange={(checked) => updateSection('tenderned', { enabled: checked })}
              />
              <Label htmlFor="tenderned-enabled">TenderNed-koppeling actief</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenderned-baseurl">Base URL</Label>
              <Input
                id="tenderned-baseurl"
                value={config.tenderned.baseUrl}
                onChange={(event) => updateSection('tenderned', { baseUrl: event.target.value })}
                placeholder="/api/tenderned"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Publieke TNS-webservice (data.overheid.nl). XML-API credentials alleen nodig voor geavanceerde koppelingen via functioneelbeheer@tenderned.nl.
            </p>
            <div className="space-y-2">
              <Label htmlFor="tenderned-apikey">API-sleutel (optioneel, XML-API)</Label>
              <Input
                id="tenderned-apikey"
                type="password"
                autoComplete="off"
                value={config.tenderned.apiKey}
                onChange={(event) => updateSection('tenderned', { apiKey: event.target.value })}
                placeholder="••••••••"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <Database size={20} className="mt-0.5 shrink-0" />
              <div>
                <CardTitle>Neon database</CardTitle>
                <CardDescription>
                  PostgreSQL connection string voor sync van dossiers en concepten.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch
                id="neon-enabled"
                checked={config.neon.enabled}
                onCheckedChange={(checked) => updateSection('neon', { enabled: checked })}
              />
              <Label htmlFor="neon-enabled">Neon-sync actief</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="neon-connection">Connection string</Label>
              <Input
                id="neon-connection"
                data-testid="neon-connection"
                autoComplete="off"
                value={config.neon.connectionString}
                onChange={(event) => updateSection('neon', { connectionString: event.target.value })}
                placeholder="postgresql://..."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <Sparkles size={20} className="mt-0.5 shrink-0" />
              <div>
                <CardTitle>Schrijfagent API</CardTitle>
                <CardDescription>
                  Model en endpoint voor brons-zilver-goud generatie.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch
                id="writer-enabled"
                checked={config.writer.enabled}
                onCheckedChange={(checked) => updateSection('writer', { enabled: checked })}
              />
              <Label htmlFor="writer-enabled">Schrijfagent actief</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="writer-provider">Provider</Label>
              <Select
                value={config.writer.provider}
                onValueChange={(value) => updateAiProvider('writer', value as AiProvider)}
              >
                <SelectTrigger id="writer-provider" className="w-full">
                  <SelectValue placeholder="Kies provider…" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(providerLabels) as AiProvider[]).map((provider) => (
                    <SelectItem key={provider} value={provider}>{providerLabels[provider]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">{aiProviderDefaults[config.writer.provider].hint}</p>
            <div className="space-y-2">
              <Label htmlFor="writer-baseurl">Base URL</Label>
              <Input
                id="writer-baseurl"
                value={config.writer.baseUrl}
                onChange={(event) => updateSection('writer', { baseUrl: event.target.value })}
                placeholder="https://api.anthropic.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="writer-model">Model</Label>
              <Input
                id="writer-model"
                value={config.writer.model}
                onChange={(event) => updateSection('writer', { model: event.target.value })}
                placeholder="claude-opus-4-8"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="writer-apikey">API-sleutel</Label>
              <Input
                id="writer-apikey"
                type="password"
                autoComplete="off"
                value={config.writer.apiKey}
                onChange={(event) => updateSection('writer', { apiKey: event.target.value })}
                placeholder="••••••••"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <Brain size={20} className="mt-0.5 shrink-0" />
              <div>
                <CardTitle>Reviewagent API</CardTitle>
                <CardDescription>
                  Model en endpoint voor AI-kwaliteitsreview van concepten.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch
                id="review-enabled"
                checked={config.review.enabled}
                onCheckedChange={(checked) => updateSection('review', { enabled: checked })}
              />
              <Label htmlFor="review-enabled">Reviewagent actief</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-provider">Provider</Label>
              <Select
                value={config.review.provider}
                onValueChange={(value) => updateAiProvider('review', value as AiProvider)}
              >
                <SelectTrigger id="review-provider" className="w-full">
                  <SelectValue placeholder="Kies provider…" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(providerLabels) as AiProvider[]).map((provider) => (
                    <SelectItem key={provider} value={provider}>{providerLabels[provider]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-baseurl">Base URL</Label>
              <Input
                id="review-baseurl"
                value={config.review.baseUrl}
                onChange={(event) => updateSection('review', { baseUrl: event.target.value })}
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-model">Model</Label>
              <Input
                id="review-model"
                value={config.review.model}
                onChange={(event) => updateSection('review', { model: event.target.value })}
                placeholder="gpt-4.1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-apikey">API-sleutel</Label>
              <Input
                id="review-apikey"
                type="password"
                autoComplete="off"
                value={config.review.apiKey}
                onChange={(event) => updateSection('review', { apiKey: event.target.value })}
                placeholder="••••••••"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 break-words text-sm text-muted-foreground">
              {saved ? 'Instellingen opgeslagen in deze browser.' : 'Wijzigingen worden lokaal opgeslagen na opslaan.'}
            </p>
            <Button type="submit" className="shrink-0">
              <Save size={16} /> Opslaan
            </Button>
          </CardContent>
        </Card>
      </form>
    </main>
  )
}
