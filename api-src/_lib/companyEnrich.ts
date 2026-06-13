import type {
  CompanyEnrichFields,
  CompanyEnrichRequest,
  CompanyEnrichResponse,
} from '../../src/types/companyEnrich'
import { completeChat, resolveAiFromRequest } from './aiClient'

const USER_AGENT = 'BesteedHetUit-CompanyEnrich/1.0'
const MAX_SOURCE_CHARS = 24_000

const EMPTY_FIELDS: CompanyEnrichFields = {
  name: '',
  tagline: '',
  kvk: '',
  website: '',
  contactEmail: '',
  profile: '',
  competencies: '',
  usps: '',
  references: '',
}

function normalizeWebsite(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Vul eerst een website in.')
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(withProtocol)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Alleen http- en https-adressen zijn toegestaan.')
  }
  return url.toString()
}

function trimSource(text: string, max = MAX_SOURCE_CHARS): string {
  const cleaned = text.replace(/\u0000/g, '').trim()
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max)}\n\n[tekst ingekort]`
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/plain, text/html, application/xhtml+xml',
      ...(init?.headers ?? {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    throw new Error(`Bron niet bereikbaar (${response.status}): ${url}`)
  }
  return response.text()
}

async function readWebsiteContent(website: string): Promise<{ source: string; text: string }> {
  try {
    const jinaUrl = `https://r.jina.ai/${website}`
    const text = trimSource(await fetchText(jinaUrl))
    if (text.length > 120) {
      return { source: website, text: `Website (${website}):\n${text}` }
    }
  } catch {
    // fallback naar directe fetch
  }

  const html = await fetchText(website, { headers: { Accept: 'text/html' } })
  const text = trimSource(htmlToText(html))
  return { source: website, text: `Website (${website}):\n${text}` }
}

async function searchWeb(query: string): Promise<{ source: string; text: string } | null> {
  try {
    const searchUrl = `https://s.jina.ai/${encodeURIComponent(query)}`
    const text = trimSource(await fetchText(searchUrl), 8_000)
    if (!text.trim()) return null
    return {
      source: `websearch:${query}`,
      text: `Websearch (${query}):\n${text}`,
    }
  } catch {
    return null
  }
}

function resolveAiConfig(request: CompanyEnrichRequest) {
  return resolveAiFromRequest(request.ai, 'COMPANY_ENRICH_MODEL')
}

const SYSTEM_PROMPT = `Je extraheert bedrijfsgegevens voor een Nederlandse inschrijving.
Regels:
- Gebruik uitsluitend feiten die expliciet in de bronnen staan.
- Verzín niets, extrapoleer niet en voeg geen marketingtaal toe.
- Laat velden leeg ("") als de informatie niet hard te herleiden is.
- KVK alleen invullen als een 8-cijferig nummer expliciet genoemd wordt.
- E-mail alleen invullen als die letterlijk in de bron staat.
- Tagline = korte positionering indien expliciet vermeld, anders leeg.
- Profiel = feitelijke beschrijving van activiteiten/organisatie.
- Kerncompetenties = feitelijke diensten/specialismen, komma-gescheiden.
- USP's = alleen als expliciet genoemde onderscheidende punten; geen aannames.
- Referenties = alleen genoemde klanten/projecten/cases met concrete feiten.
Antwoord uitsluitend met geldig JSON in dit schema:
{
  "name": "",
  "tagline": "",
  "kvk": "",
  "website": "",
  "contactEmail": "",
  "profile": "",
  "competencies": "",
  "usps": "",
  "references": "",
  "notes": ""
}`

async function extractFactsWithAi(
  ai: ReturnType<typeof resolveAiConfig>,
  website: string,
  sourcesText: string,
): Promise<{ fields: CompanyEnrichFields; notes: string }> {
  const content = await completeChat(
    ai,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Website URL: ${website}\n\nBronnen:\n${sourcesText}`,
      },
    ],
    { jsonMode: ai.provider !== 'anthropic', maxTokens: 4_000, timeoutMs: 60_000 },
  )

  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim()
  let parsed: CompanyEnrichFields & { notes?: string }
  try {
    parsed = JSON.parse(jsonText) as CompanyEnrichFields & { notes?: string }
  } catch {
    throw new Error('AI gaf geen geldig JSON-resultaat terug. Probeer opnieuw.')
  }
  return {
    fields: {
      name: parsed.name?.trim() ?? '',
      tagline: parsed.tagline?.trim() ?? '',
      kvk: parsed.kvk?.trim() ?? '',
      website: parsed.website?.trim() || website,
      contactEmail: parsed.contactEmail?.trim() ?? '',
      profile: parsed.profile?.trim() ?? '',
      competencies: parsed.competencies?.trim() ?? '',
      usps: parsed.usps?.trim() ?? '',
      references: parsed.references?.trim() ?? '',
    },
    notes: parsed.notes?.trim() ?? '',
  }
}

export async function enrichCompanyFromWebsite(
  request: CompanyEnrichRequest,
): Promise<CompanyEnrichResponse> {
  const website = normalizeWebsite(request.website)
  const ai = resolveAiConfig(request)
  const hostname = new URL(website).hostname.replace(/^www\./, '')

  const sourceBlocks: Array<{ source: string; text: string }> = []

  const searchQueries = [
    `${hostname} kvk bedrijfsgegevens`,
    `${hostname} bedrijf Nederland`,
  ]

  const results = await Promise.allSettled([
    readWebsiteContent(website),
    ...searchQueries.map((query) => searchWeb(query)),
  ])

  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value) continue
    sourceBlocks.push(result.value)
  }

  if (!sourceBlocks.some((block) => block.source === website)) {
    throw new Error(`Kon de website ${website} niet bereiken. Controleer het adres.`)
  }

  const sources = sourceBlocks.map((block) => block.source)
  const sourcesText = sourceBlocks.map((block) => block.text).join('\n\n---\n\n')

  if (!sourcesText.trim()) {
    return {
      fields: { ...EMPTY_FIELDS, website },
      sources,
      notes: 'Geen bruikbare bronnen gevonden.',
    }
  }

  const { fields, notes } = await extractFactsWithAi(ai, website, sourcesText)
  return {
    fields: { ...EMPTY_FIELDS, ...fields, website: fields.website || website },
    sources,
    notes,
  }
}

export async function handleCompanyEnrichRequest(body: unknown): Promise<Response> {
  try {
    const request = (body ?? {}) as CompanyEnrichRequest
    const result = await enrichCompanyFromWebsite(request)
    return Response.json(result satisfies CompanyEnrichResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout bij ophalen van bedrijfsgegevens.'
    return Response.json({ error: message }, { status: 400 })
  }
}
