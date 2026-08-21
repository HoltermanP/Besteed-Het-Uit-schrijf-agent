import type {
  TenderScoreRequest,
  TenderScoreResponse,
  TenderScoreResult,
} from '../../src/types/tenderScore'
import { completeChat, resolveAiFromRequest } from './aiClient'

const MAX_TENDERS_PER_CALL = 20
const MAX_COMPANY_CHARS = 8_000
const MAX_DESCRIPTION_CHARS = 900

const SYSTEM_INSTRUCTIONS = `Je bent een Nederlandse bid/no-bid-adviseur. Je beoordeelt per aanbesteding hoe passend die is voor het hieronder beschreven bedrijf, op een schaal van 0 tot 100.

Hanteer deze schaal:
- 80-100: kernactiviteit van het bedrijf; sterke match op CPV-codes, competenties en referenties.
- 60-79: goed passend; het bedrijf kan dit aantoonbaar leveren, kleine hiaten.
- 40-59: gedeeltelijk passend; alleen een deel van de scope sluit aan of de match is onzeker.
- 20-39: zijdelings gerelateerd; grote hiaten in competenties of ervaring.
- 0-19: niet passend; buiten het werkveld van het bedrijf.

Regels:
- Beoordeel uitsluitend op basis van het bedrijfsprofiel en de aangeleverde tendergegevens; verzin geen capaciteiten die het bedrijf niet noemt.
- Weeg CPV-codes zwaar mee als beide kanten ze hebben, maar kijk ook naar de inhoudelijke omschrijving: een CPV-match met een afwijkende scope verdient geen hoge score.
- Een overkoepelende CPV-code bij het bedrijf (bijv. 72000000) dekt alle onderliggende codes; kijk daarom vooral of de concrete scope (omschrijving, type opdracht) bij het bedrijf past.
- Let op signalen die de kans drukken: raamovereenkomsten met veel percelen buiten het werkveld, eisen aan schaal of certificering die het profiel niet noemt, marktconsultaties (nog geen inschrijving mogelijk).
- Geef per tender een toelichting van maximaal 25 woorden, in het Nederlands, met het doorslaggevende argument; geen inleiding, geen herhaling van de titel.
- Neem elke aangeleverde publicatieId exact één keer op in het antwoord, ongewijzigd.
Antwoord uitsluitend met geldig JSON in dit schema:
{
  "scores": [
    { "publicatieId": "123456", "score": 72, "toelichting": "" }
  ]
}`

function buildSystemPrompt(companyText: string): string {
  const text =
    companyText.length <= MAX_COMPANY_CHARS
      ? companyText
      : `${companyText.slice(0, MAX_COMPANY_CHARS)}\n\n[tekst ingekort]`
  return `${SYSTEM_INSTRUCTIONS}\n\nBedrijfsprofiel:\n\n${text}`
}

function buildTenderText(request: TenderScoreRequest): string {
  const blocks = request.tenders.map((tender, index) => {
    const beschrijving = tender.opdrachtBeschrijving?.trim() ?? ''
    const parts = [
      `Tender ${index + 1}`,
      `publicatieId: ${tender.publicatieId}`,
      `Naam: ${tender.aanbestedingNaam}`,
      `Opdrachtgever: ${tender.opdrachtgeverNaam}`,
      tender.typePublicatie ? `Soort publicatie: ${tender.typePublicatie}` : '',
      tender.typeOpdracht ? `Type opdracht: ${tender.typeOpdracht}` : '',
      tender.procedure ? `Procedure: ${tender.procedure}` : '',
      tender.cpvCodes?.length
        ? `CPV-codes: ${tender.cpvCodes
            .map((cpv) => (cpv.omschrijving ? `${cpv.code} (${cpv.omschrijving})` : cpv.code))
            .join(', ')}`
        : 'CPV-codes: onbekend',
      beschrijving
        ? `Omschrijving: ${beschrijving.slice(0, MAX_DESCRIPTION_CHARS)}${beschrijving.length > MAX_DESCRIPTION_CHARS ? '…' : ''}`
        : 'Omschrijving: (geen omschrijving beschikbaar)',
    ].filter(Boolean)
    return parts.join('\n')
  })
  return blocks.join('\n\n---\n\n')
}

function parseScores(content: string, requestedIds: string[]): TenderScoreResult[] {
  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim()
  let parsed: { scores?: Array<Partial<TenderScoreResult>> }
  try {
    parsed = JSON.parse(jsonText) as { scores?: Array<Partial<TenderScoreResult>> }
  } catch {
    throw new Error('AI gaf geen geldig JSON-resultaat terug. Probeer opnieuw.')
  }

  const requested = new Set(requestedIds)
  const seen = new Set<string>()
  const results: TenderScoreResult[] = []
  for (const raw of parsed.scores ?? []) {
    const id = String(raw.publicatieId ?? '').trim()
    if (!id || !requested.has(id) || seen.has(id)) continue
    const numeric = Number(raw.score)
    if (!Number.isFinite(numeric)) continue
    seen.add(id)
    results.push({
      publicatieId: id,
      score: Math.round(Math.min(100, Math.max(0, numeric))),
      toelichting: raw.toelichting?.trim() ?? '',
    })
  }
  return results
}

export async function scoreTenders(request: TenderScoreRequest): Promise<TenderScoreResponse> {
  if (!request.companyText?.trim()) {
    throw new Error('Vul eerst het bedrijfsprofiel in voordat AI tenders kan scoren.')
  }
  const tenders = (request.tenders ?? []).filter((tender) => tender?.publicatieId)
  if (!tenders.length) {
    throw new Error('Geen tenders aangeleverd om te scoren.')
  }
  if (tenders.length > MAX_TENDERS_PER_CALL) {
    throw new Error(`Maximaal ${MAX_TENDERS_PER_CALL} tenders per aanroep; splits de selectie in batches.`)
  }

  // Voorselectie is een triage over veel tenders: het lichte tier (snel en het
  // goedkoopst) is hier ruim voldoende; TENDER_SCORE_MODEL kan dit overrulen.
  const ai = resolveAiFromRequest(request.ai, 'TENDER_SCORE_MODEL', 'light')
  const content = await completeChat(
    ai,
    [
      { role: 'system', content: buildSystemPrompt(request.companyText) },
      { role: 'user', content: `Beoordeel de volgende ${tenders.length} tender(s):\n\n${buildTenderText({ ...request, tenders })}` },
    ],
    {
      jsonMode: ai.provider !== 'anthropic',
      // 20 tenders × (id + score + ≤25 woorden) past ruim binnen 3.000 tokens.
      maxTokens: 3_000,
      timeoutMs: 90_000,
      // Het bedrijfsprofiel zit in de system prompt en wordt bij batchgewijs
      // scoren over meerdere aanroepen herlezen — caching betaalt zich dan uit.
      cachePrompt: true,
      label: 'tender-score',
    },
  )

  const scores = parseScores(content, tenders.map((tender) => tender.publicatieId))
  if (!scores.length) {
    throw new Error('AI gaf geen bruikbare scores terug. Probeer opnieuw.')
  }
  return { scores }
}

export async function handleScoreTendersRequest(body: unknown): Promise<Response> {
  try {
    const request = (body ?? {}) as TenderScoreRequest
    const result = await scoreTenders(request)
    return Response.json(result satisfies TenderScoreResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout bij het scoren van tenders.'
    return Response.json({ error: message }, { status: 400 })
  }
}
