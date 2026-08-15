import type {
  CpvSuggestRequest,
  CpvSuggestResponse,
  CpvSuggestion,
} from '../../src/types/cpvSuggest'
import { normalizeCpvCode } from '../../src/lib/cpv'
import { completeChat, resolveAiFromRequest } from './aiClient'

const MAX_CONTEXT_CHARS = 12_000
const MAX_SUGGESTIONS = 12

const SYSTEM_PROMPT = `Je bent een Nederlandse aanbestedingsexpert die CPV-codes (Common Procurement Vocabulary, versie 2008) adviseert.
Je krijgt bedrijfsinformatie en stelt de CPV-codes voor waaronder voor dit bedrijf relevante aanbestedingen gepubliceerd worden.
Regels:
- Stel 5 tot 10 codes voor, gesorteerd van meest naar minst relevant.
- Gebruik uitsluitend bestaande CPV 2008-codes in het formaat 12345678-9 (8 cijfers, streepje, controlecijfer).
- Gebruik de officiële Nederlandse CPV-omschrijving bij elke code.
- Combineer bredere categorieën (eindigend op nullen) met specifiekere codes waar dat past.
- Baseer je alleen op de aangeleverde bedrijfsinformatie; stel geen codes voor bij activiteiten die het bedrijf niet noemt.
- Geef per code één korte zin waarom die past bij dit bedrijf.
- Sla codes over die al geconfigureerd zijn.
Antwoord uitsluitend met geldig JSON in dit schema:
{
  "suggestions": [
    { "code": "72000000-5", "omschrijving": "IT-diensten: adviezen, softwareontwikkeling, internet en ondersteuning", "reden": "" }
  ],
  "notes": ""
}`

function buildCompanyText(request: CpvSuggestRequest): string {
  const company = request.company
  const parts = [
    company.name?.trim() ? `Organisatie: ${company.name.trim()}` : '',
    company.tagline?.trim() ? `Positionering: ${company.tagline.trim()}` : '',
    company.website?.trim() ? `Website: ${company.website.trim()}` : '',
    company.profile?.trim() ? `Profiel: ${company.profile.trim()}` : '',
    company.competencies?.trim() ? `Kerncompetenties: ${company.competencies.trim()}` : '',
    company.usps?.trim() ? `Onderscheidend vermogen: ${company.usps.trim()}` : '',
    company.references?.trim() ? `Referenties: ${company.references.trim()}` : '',
    company.extraContext?.trim() ? `Aanvullende context uit bedrijfsdocumenten:\n${company.extraContext.trim()}` : '',
  ].filter(Boolean)

  const existing = (request.existingCodes ?? []).map((code) => code.trim()).filter(Boolean)
  if (existing.length) {
    parts.push(`Reeds geconfigureerde CPV-codes (niet opnieuw voorstellen): ${existing.join(', ')}`)
  }

  const text = parts.join('\n\n')
  if (text.length <= MAX_CONTEXT_CHARS) return text
  return `${text.slice(0, MAX_CONTEXT_CHARS)}\n\n[tekst ingekort]`
}

function parseSuggestions(content: string, existingCodes: string[]): { suggestions: CpvSuggestion[]; notes: string } {
  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim()
  let parsed: { suggestions?: Array<Partial<CpvSuggestion>>; notes?: string }
  try {
    parsed = JSON.parse(jsonText) as { suggestions?: Array<Partial<CpvSuggestion>>; notes?: string }
  } catch {
    throw new Error('AI gaf geen geldig JSON-resultaat terug. Probeer opnieuw.')
  }

  const existing = new Set(
    existingCodes.map((code) => normalizeCpvCode(code)?.slice(0, 8)).filter(Boolean),
  )
  const seen = new Set<string>()
  const suggestions: CpvSuggestion[] = []
  for (const raw of parsed.suggestions ?? []) {
    const code = normalizeCpvCode(raw.code ?? '')
    if (!code) continue
    const base = code.slice(0, 8)
    if (seen.has(base) || existing.has(base)) continue
    seen.add(base)
    suggestions.push({
      code,
      omschrijving: raw.omschrijving?.trim() ?? '',
      reden: raw.reden?.trim() ?? '',
    })
    if (suggestions.length >= MAX_SUGGESTIONS) break
  }

  return { suggestions, notes: parsed.notes?.trim() ?? '' }
}

export async function suggestCpvCodes(request: CpvSuggestRequest): Promise<CpvSuggestResponse> {
  const companyText = buildCompanyText({ ...request, existingCodes: request.existingCodes ?? [] })
  const hasContent = Boolean(
    request.company?.profile?.trim() ||
      request.company?.competencies?.trim() ||
      request.company?.usps?.trim() ||
      request.company?.references?.trim() ||
      request.company?.extraContext?.trim(),
  )
  if (!hasContent) {
    throw new Error('Vul eerst bedrijfsinformatie in (profiel, competenties of documenten) voordat AI CPV-codes kan voorstellen.')
  }

  const ai = resolveAiFromRequest(request.ai, 'CPV_SUGGEST_MODEL', 'analysis')
  const content = await completeChat(
    ai,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Bedrijfsinformatie:\n\n${companyText}` },
    ],
    { jsonMode: ai.provider !== 'anthropic', maxTokens: 3_000, timeoutMs: 60_000, label: 'cpv-voorstel' },
  )

  const { suggestions, notes } = parseSuggestions(content, request.existingCodes ?? [])
  if (!suggestions.length) {
    return {
      suggestions,
      notes: notes || 'Geen nieuwe CPV-codes gevonden op basis van de bedrijfsinformatie.',
    }
  }
  return { suggestions, notes }
}

export async function handleCpvSuggestRequest(body: unknown): Promise<Response> {
  try {
    const request = (body ?? {}) as CpvSuggestRequest
    const result = await suggestCpvCodes(request)
    return Response.json(result satisfies CpvSuggestResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout bij het voorstellen van CPV-codes.'
    return Response.json({ error: message }, { status: 400 })
  }
}
