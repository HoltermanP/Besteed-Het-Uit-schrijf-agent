import type { AnalyzeTenderRequest, AnalyzeTenderResponse } from '../../src/types/analyzeTender'
import type {
  ContentRequirement,
  DocumentRequirement,
  StyleProfile,
  SubmissionRequirement,
  TenderAnalysis,
  UnderlyingIntent,
  WordLimit,
} from '../../src/types/tenderAnalysis'
import { completeChat, resolveAiFromRequest } from './aiClient'

const DOC_CHAR_LIMIT = 22_000

function trimSource(text: string, max = DOC_CHAR_LIMIT): string {
  // eslint-disable-next-line no-control-regex -- strip null bytes uit ge-extraheerde PDF/Office-tekst
  const cleaned = text.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max)}…`
}

function formatDocuments(request: AnalyzeTenderRequest): string {
  return request.documents
    .map((doc) => `- [${doc.type}] ${doc.name}:\n${trimSource(doc.content)}`)
    .join('\n\n')
}

const SYSTEM_PROMPT = `Je bent een senior bid-analist voor Nederlandse aanbestedingen (Aanbestedingswet, EMVI/BPKV).
Doel: de uitvraag scherp en volledig analyseren zodat de bidwriter al vanaf de eerste (bronzen) versie gericht schrijft.

Analyseer de aanbestedingsstukken (vooral de leidraad) en bepaal concreet:
- welke documenten/bijlagen moeten worden ingediend (documentRequirements)
- welke woord-, karakter- of paginalimieten gelden (wordLimits) en wat het bindende maximum is (targetWordCount/targetCharCount)
- welke vragen/onderwerpen inhoudelijk beantwoord moeten worden (contentRequirements)
- de beoordelingscriteria met gewichten (evaluationCriteria)
- de "vraag achter de vraag": wat wil de opdrachtgever ECHT (underlyingIntent)
- welke schrijfstijl past (styleProfile: stem inschrijver × verwachtingen opdrachtgever)
- specifieke EISEN AAN DE INSCHRIJVING ZELF (submissionRequirements): vormvereisten (PDF, anonimisering, taal), opmaak (lettertype, marges, A4), indiening (deadline, kanaal/TenderNed, rechtsgeldige ondertekening), geschiktheidseisen, uitsluitingsgronden, proceseisen (Nota van Inlichtingen)

Regels:
- Baseer je UITSLUITEND op de bronnen; verzin geen feiten, limieten of eisen.
- Verbeter en verrijk de meegegeven heuristische baseline; verwijder velden niet zonder reden.
- targetWordCount/targetCharCount = het STRIKTE bindende maximum voor het hoofd-inschrijfstuk (kies het strafste relevante maximum). Laat weg (null) als er geen maximum is.
- submissionRequirements.category ∈ {"vorm","opmaak","indiening","geschiktheid","uitsluiting","proces","overig"}.
- mandatory = true alleen als de bron het verplicht stelt (verplicht/dient/moet/op straffe van uitsluiting).
- source = de bestandsnaam waaruit de eis komt.
- teamBrief is intern (niet voor indiening) en begint met "Intern — niet opnemen in het inschrijfdocument".
- gaps: ontbrekende of risicovolle punten waarop het team moet letten.
- Schrijf in het Nederlands, concreet en toetsbaar.

Antwoord UITSLUITEND met geldig JSON in exact deze vorm:
{
  "summary": "",
  "wordLimits": [{ "label": "", "section": "", "min": null, "max": null, "unit": "woorden|karakters|paginas", "source": "" }],
  "contentRequirements": [{ "topic": "", "detail": "", "mandatory": true, "source": "" }],
  "documentRequirements": [{ "name": "", "mandatory": true, "source": "" }],
  "submissionRequirements": [{ "category": "vorm", "requirement": "", "mandatory": true, "source": "" }],
  "evaluationCriteria": ["Criterium (gewicht%)"],
  "styleProfile": { "companyName": "", "buyerName": "", "companySignals": [], "buyerSignals": [], "blendedGuidance": "" },
  "underlyingIntent": { "explicitQuestion": "", "underlyingNeed": "", "questionBehindQuestion": "", "buyerPriorities": [], "implicitSuccessFactors": [], "writingGuidance": "", "teamBrief": "" },
  "gaps": [],
  "targetWordCount": null,
  "targetCharCount": null
}`

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function posInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
}

const SUBMISSION_CATEGORIES = ['vorm', 'opmaak', 'indiening', 'geschiktheid', 'uitsluiting', 'proces', 'overig']

function normalizeWordLimits(value: unknown, fallback: WordLimit[]): WordLimit[] {
  const parsed = asArray<Record<string, unknown>>(value)
    .map((item): WordLimit | null => {
      const unit = str(item.unit)
      const normalizedUnit = unit === 'karakters' || unit === 'paginas' ? unit : 'woorden'
      const label = str(item.label) || 'Limiet'
      const min = posInt(item.min)
      const max = posInt(item.max)
      if (min === undefined && max === undefined) return null
      return {
        label,
        section: str(item.section) || undefined,
        min,
        max,
        unit: normalizedUnit,
        source: str(item.source) || 'leidraad',
      }
    })
    .filter((item): item is WordLimit => item !== null)
  return parsed.length ? parsed : fallback
}

function normalizeContentRequirements(value: unknown, fallback: ContentRequirement[]): ContentRequirement[] {
  const parsed = asArray<Record<string, unknown>>(value)
    .map((item): ContentRequirement | null => {
      const topic = str(item.topic)
      if (!topic) return null
      return {
        topic,
        detail: str(item.detail) || topic,
        mandatory: item.mandatory !== false,
        source: str(item.source) || 'leidraad',
      }
    })
    .filter((item): item is ContentRequirement => item !== null)
  return parsed.length ? parsed : fallback
}

function normalizeDocumentRequirements(value: unknown, fallback: DocumentRequirement[]): DocumentRequirement[] {
  const parsed = asArray<Record<string, unknown>>(value)
    .map((item): DocumentRequirement | null => {
      const name = str(item.name)
      if (!name) return null
      return { name, mandatory: item.mandatory !== false, source: str(item.source) || 'leidraad' }
    })
    .filter((item): item is DocumentRequirement => item !== null)
  return parsed.length ? parsed : fallback
}

function normalizeSubmissionRequirements(
  value: unknown,
  fallback: SubmissionRequirement[],
): SubmissionRequirement[] {
  const parsed = asArray<Record<string, unknown>>(value)
    .map((item): SubmissionRequirement | null => {
      const requirement = str(item.requirement)
      if (!requirement) return null
      const category = str(item.category)
      return {
        category: (SUBMISSION_CATEGORIES.includes(category)
          ? category
          : 'overig') as SubmissionRequirement['category'],
        requirement,
        mandatory: item.mandatory !== false,
        source: str(item.source) || 'leidraad',
      }
    })
    .filter((item): item is SubmissionRequirement => item !== null)
  return parsed.length ? parsed : fallback
}

function normalizeStringList(value: unknown, fallback: string[]): string[] {
  const parsed = asArray<unknown>(value).map((item) => str(item)).filter(Boolean)
  return parsed.length ? parsed : fallback
}

function mergeStyleProfile(value: unknown, fallback: StyleProfile): StyleProfile {
  const item = (value ?? {}) as Record<string, unknown>
  return {
    companyName: str(item.companyName) || fallback.companyName,
    buyerName: str(item.buyerName) || fallback.buyerName,
    companySignals: normalizeStringList(item.companySignals, fallback.companySignals).slice(0, 6),
    buyerSignals: normalizeStringList(item.buyerSignals, fallback.buyerSignals).slice(0, 6),
    blendedGuidance: str(item.blendedGuidance) || fallback.blendedGuidance,
  }
}

function mergeUnderlyingIntent(value: unknown, fallback: UnderlyingIntent | undefined): UnderlyingIntent | undefined {
  if (!value || typeof value !== 'object') return fallback
  const item = value as Record<string, unknown>
  const base: UnderlyingIntent = fallback ?? {
    explicitQuestion: '',
    underlyingNeed: '',
    questionBehindQuestion: '',
    buyerPriorities: [],
    implicitSuccessFactors: [],
    writingGuidance: '',
    teamBrief: '',
  }
  return {
    explicitQuestion: str(item.explicitQuestion) || base.explicitQuestion,
    underlyingNeed: str(item.underlyingNeed) || base.underlyingNeed,
    questionBehindQuestion: str(item.questionBehindQuestion) || base.questionBehindQuestion,
    buyerPriorities: normalizeStringList(item.buyerPriorities, base.buyerPriorities).slice(0, 5),
    implicitSuccessFactors: normalizeStringList(item.implicitSuccessFactors, base.implicitSuccessFactors).slice(0, 5),
    writingGuidance: str(item.writingGuidance) || base.writingGuidance,
    teamBrief: str(item.teamBrief) || base.teamBrief,
  }
}

function parseAnalysisJson(content: string, baseline: TenderAnalysis): TenderAnalysis {
  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim()
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>
  } catch {
    return baseline
  }

  const gaps = [...new Set([...normalizeStringList(parsed.gaps, []), ...baseline.gaps])]

  return {
    ...baseline,
    summary: str(parsed.summary) || baseline.summary,
    wordLimits: normalizeWordLimits(parsed.wordLimits, baseline.wordLimits),
    contentRequirements: normalizeContentRequirements(parsed.contentRequirements, baseline.contentRequirements),
    documentRequirements: normalizeDocumentRequirements(parsed.documentRequirements, baseline.documentRequirements),
    submissionRequirements: normalizeSubmissionRequirements(
      parsed.submissionRequirements,
      baseline.submissionRequirements,
    ),
    evaluationCriteria: normalizeStringList(parsed.evaluationCriteria, baseline.evaluationCriteria).slice(0, 10),
    styleProfile: mergeStyleProfile(parsed.styleProfile, baseline.styleProfile),
    underlyingIntent: mergeUnderlyingIntent(parsed.underlyingIntent, baseline.underlyingIntent),
    gaps,
    targetWordCount: posInt(parsed.targetWordCount) ?? baseline.targetWordCount,
    targetCharCount: posInt(parsed.targetCharCount) ?? baseline.targetCharCount,
  }
}

export async function handleAnalyzeTenderRequest(request: AnalyzeTenderRequest): Promise<Response> {
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
      analysis: { ...request.baseline, aiAnalyzed: false },
      provider: 'heuristiek',
      model: 'lokaal',
      enriched: false,
    } satisfies AnalyzeTenderResponse)
  }

  const userContent = `Opdrachtgever: ${request.buyerName}

Heuristische baseline (verbeter/verrijk waar de bronnen dat rechtvaardigen):
${JSON.stringify(request.baseline, null, 2)}

Bronnen:
${formatDocuments(request)}

Lever de volledige, aangescherpte uitvraag-analyse als JSON volgens het opgegeven schema.`

  let analysis: TenderAnalysis
  try {
    const content = await completeChat(
      ai,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      { jsonMode: ai.provider !== 'anthropic', maxTokens: 8_000, timeoutMs: 120_000, useThinking: false },
    )
    analysis = parseAnalysisJson(content, request.baseline)
  } catch {
    return Response.json({
      analysis: { ...request.baseline, aiAnalyzed: false },
      provider: 'heuristiek',
      model: 'lokaal',
      enriched: false,
    } satisfies AnalyzeTenderResponse)
  }

  return Response.json({
    analysis: { ...analysis, aiAnalyzed: true, analysisProvider: ai.provider, analysisModel: ai.model },
    provider: ai.provider,
    model: ai.model,
    enriched: true,
  } satisfies AnalyzeTenderResponse)
}
