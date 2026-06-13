import type { AnalyzeIntentRequest, AnalyzeIntentResponse } from '../../src/types/analyzeIntent'
import type { UnderlyingIntent } from '../../src/types/tenderAnalysis'
import { completeChat, resolveAiFromRequest } from './aiClient'

const DOC_CHAR_LIMIT = 18_000

function trimSource(text: string, max = DOC_CHAR_LIMIT): string {
  const cleaned = text.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max)}…`
}

function formatDocuments(request: AnalyzeIntentRequest): string {
  return request.documents
    .map((doc) => `- [${doc.type}] ${doc.name}:\n${trimSource(doc.content)}`)
    .join('\n\n')
}

const SYSTEM_PROMPT = `Je bent een senior bid-analist voor Nederlandse aanbestedingen.
Doel: achterhalen wat de opdrachtgever ECHT wil — de "vraag achter de vraag" — naast de expliciete leidraadeisen.

Regels:
- Baseer je op de bronnen; verzin geen feiten over de opdrachtgever of opdracht.
- Onderscheid expliciete vraag (formulieren, onderwerpen, bijlagen) vs onderliggende behoefte (zekerheid, grip, risico, EMVI-prioriteit).
- Schrijf in het Nederlands, concreet en bruikbaar voor een bidwriter.
- teamBrief is een intern reflectiestuk voor het inschrijver-team (niet voor indiening bij de opdrachtgever).
- buyerPriorities: max 5 items, geordend op belang.
- implicitSuccessFactors: max 5 items, wat impliciet succesvol maakt.

Antwoord uitsluitend met geldig JSON:
{
  "explicitQuestion": "",
  "underlyingNeed": "",
  "questionBehindQuestion": "",
  "buyerPriorities": [],
  "implicitSuccessFactors": [],
  "writingGuidance": "",
  "teamBrief": ""
}`

function parseIntentJson(content: string, baseline: UnderlyingIntent): UnderlyingIntent {
  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim()
  let parsed: Partial<UnderlyingIntent>
  try {
    parsed = JSON.parse(jsonText) as Partial<UnderlyingIntent>
  } catch {
    return baseline
  }

  const teamBrief =
    parsed.teamBrief?.trim() ||
    baseline.teamBrief

  return {
    explicitQuestion: parsed.explicitQuestion?.trim() || baseline.explicitQuestion,
    underlyingNeed: parsed.underlyingNeed?.trim() || baseline.underlyingNeed,
    questionBehindQuestion: parsed.questionBehindQuestion?.trim() || baseline.questionBehindQuestion,
    buyerPriorities:
      parsed.buyerPriorities?.filter(Boolean).slice(0, 5) ?? baseline.buyerPriorities,
    implicitSuccessFactors:
      parsed.implicitSuccessFactors?.filter(Boolean).slice(0, 5) ?? baseline.implicitSuccessFactors,
    writingGuidance: parsed.writingGuidance?.trim() || baseline.writingGuidance,
    teamBrief,
  }
}

export async function handleAnalyzeIntentRequest(
  request: AnalyzeIntentRequest,
): Promise<Response> {
  if (!request.buyerName?.trim()) {
    return Response.json({ error: 'Opdrachtgever ontbreekt.' }, { status: 400 })
  }
  if (!request.documents?.length) {
    return Response.json({ error: 'Geen bronnen om te analyseren.' }, { status: 400 })
  }
  if (!request.baseline) {
    return Response.json({ error: 'Baseline-analyse ontbreekt.' }, { status: 400 })
  }

  let ai: ReturnType<typeof resolveAiFromRequest>
  try {
    ai = resolveAiFromRequest(request.ai, 'INTENT_MODEL')
  } catch {
    return Response.json({
      underlyingIntent: request.baseline,
      provider: 'heuristiek',
      model: 'lokaal',
      enriched: false,
    } satisfies AnalyzeIntentResponse)
  }

  const userContent = `Opdrachtgever: ${request.buyerName}

Heuristische baseline (verbeter/verfijn waar de bronnen dat rechtvaardigen):
${JSON.stringify(request.baseline, null, 2)}

Bronnen:
${formatDocuments(request)}

Lever een scherpere vraag-achter-de-vraag analyse. teamBrief moet beginnen met "Intern — niet opnemen in het inschrijfdocument".`

  const content = await completeChat(
    ai,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    { jsonMode: ai.provider !== 'anthropic', maxTokens: 4_000, timeoutMs: 90_000, useThinking: false },
  )

  const underlyingIntent = parseIntentJson(content, request.baseline)

  return Response.json({
    underlyingIntent,
    provider: ai.provider,
    model: ai.model,
    enriched: true,
  } satisfies AnalyzeIntentResponse)
}
