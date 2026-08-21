import type {
  AnalyzeTenderRequest,
  AnalyzeTenderResponse,
  TenderDocumentExtract,
} from '../../src/types/analyzeTender'
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
import { dedupeRequestedDocuments, normalizeRequestedDocuments } from '../../src/lib/requestedDocuments'

// Leidraden volledig meegeven: afkappen laat de analyse eisen missen die de rest
// van de pijplijn daarna nooit meer ziet.
const DOC_CHAR_LIMIT = 150_000

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
- WELKE STUKKEN DE INSCHRIJVER MOET OPSTELLEN (requestedDocuments): per apart in te dienen of apart beoordeeld stuk één item met
  title, kind ("schrijfstuk" = zelf te schrijven en inhoudelijk beoordeeld, zoals plan van aanpak of een uitwerking per
  (sub)gunningscriterium; "formulier" = in te vullen format zoals UEA/prijsblad; "bewijsstuk" = bij te voegen bewijs zoals
  referenties/CV's/certificaten), question (de letterlijke vraag/opdracht uit de leidraad voor dit stuk), criteria (de
  (sub)gunningscriteria met weging waarop dit stuk wordt beoordeeld), topics (de deelvragen/onderwerpen voor dit stuk, in
  leidraadvolgorde), wordLimits (alleen de limieten van dit stuk), format, mandatory, source
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
  "requestedDocuments": [{ "title": "", "kind": "schrijfstuk|formulier|bewijsstuk", "question": "", "criteria": [], "topics": [], "wordLimits": [{ "label": "", "section": "", "min": null, "max": null, "unit": "woorden", "source": "" }], "format": "", "mandatory": true, "source": "" }],
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
    requestedDocuments: (() => {
      const parsedDocs = normalizeRequestedDocuments(parsed.requestedDocuments, baseline.leidraadSource ?? 'leidraad')
      return parsedDocs.length ? parsedDocs : baseline.requestedDocuments ?? []
    })(),
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

// ---------------------------------------------------------------------------
// Reduce-fase: per-document extracten (map) deterministisch samenvoegen tot één
// analyse, gevolgd door een compacte AI-synthesepass. Dit vervangt het opnieuw
// inlezen van alle volledige documenten en voorkomt truncatie.
// ---------------------------------------------------------------------------

// Rollen die als "leidraad" gelden voor leidraadFound/leidraadSource.
const LEIDRAAD_ROLE = 'leidraad'
const NVI_ROLE = 'nota-van-inlichtingen'

function dedupeWordLimits(limits: WordLimit[]): WordLimit[] {
  const seen = new Set<string>()
  const out: WordLimit[] = []
  for (const limit of limits) {
    const key = `${limit.unit}|${limit.min ?? ''}|${limit.max ?? ''}|${(limit.section ?? '').toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(limit)
  }
  return out
}

function dedupeBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    const key = keyOf(item).toLowerCase().trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

/** Strengste maximum (kleinste max) voor een gegeven eenheid; strenger wint zodat NvI-aanscherpingen leiden. */
function strictestMax(limits: WordLimit[], unit: WordLimit['unit']): number | undefined {
  return limits
    .filter((limit) => limit.unit === unit && limit.max)
    .reduce<number | undefined>((min, limit) => {
      const value = limit.max!
      return min === undefined ? value : Math.min(min, value)
    }, undefined)
}

/** Voegt de per-document extracten samen tot één analyse, bovenop de heuristische baseline. */
function mergeExtracts(baseline: TenderAnalysis, extracts: TenderDocumentExtract[]): TenderAnalysis {
  // NvI achteraan zodat, waar dedup first-wins hanteert, de leidraad-formulering
  // primair blijft en NvI-wijzigingen expliciet als modifications/gaps landen.
  const ordered = [...extracts].sort((a, b) => {
    const rank = (role: string) => (role === NVI_ROLE ? 1 : 0)
    return rank(a.extract.role) - rank(b.extract.role)
  })

  const leidraadDoc = extracts.find((item) => item.extract.role === LEIDRAAD_ROLE)

  const wordLimits = dedupeWordLimits([
    ...ordered.flatMap((item) => item.extract.wordLimits),
    ...baseline.wordLimits,
  ])
  const contentRequirements = dedupeBy(
    [...ordered.flatMap((item) => item.extract.contentRequirements), ...baseline.contentRequirements],
    (req) => req.topic,
  )
  const documentRequirements = dedupeBy(
    [...ordered.flatMap((item) => item.extract.documentRequirements), ...baseline.documentRequirements],
    (req) => req.name,
  )
  const submissionRequirements = dedupeBy(
    [...ordered.flatMap((item) => item.extract.submissionRequirements), ...baseline.submissionRequirements],
    (req) => `${req.category}|${req.requirement}`,
  )
  // Op te stellen stukken: de AI-extracten zijn leidend (zij kennen vraag, criteria en topics per stuk);
  // de heuristische baseline vult alleen aan wat de AI niet noemde. Een NvI-item dat hetzelfde stuk
  // noemt staat achteraan en vult lege velden aan (zie dedupeRequestedDocuments).
  const aiRequested = ordered.flatMap((item) => item.extract.requestedDocuments ?? [])
  const requestedDocuments = dedupeRequestedDocuments([
    ...aiRequested,
    ...(aiRequested.length ? [] : baseline.requestedDocuments ?? []),
  ])
  const evaluationCriteria = dedupeBy(
    [...ordered.flatMap((item) => item.extract.evaluationCriteria), ...baseline.evaluationCriteria],
    (criterion) => criterion,
  ).slice(0, 10)

  // NvI-wijzigingen expliciet zichtbaar maken voor writer én reviewer.
  const modifications = ordered
    .filter((item) => item.extract.role === NVI_ROLE)
    .flatMap((item) => item.extract.modifications.map((mod) => `Nota van Inlichtingen (${item.name}): ${mod}`))

  const gaps = [...new Set([...modifications, ...baseline.gaps])]

  const leidraadFound = Boolean(leidraadDoc) || baseline.leidraadFound

  return {
    ...baseline,
    leidraadFound,
    leidraadSource: leidraadDoc?.name ?? baseline.leidraadSource,
    wordLimits,
    contentRequirements,
    documentRequirements,
    requestedDocuments,
    submissionRequirements,
    evaluationCriteria,
    gaps,
    targetWordCount: strictestMax(wordLimits, 'woorden') ?? baseline.targetWordCount,
    targetCharCount: strictestMax(wordLimits, 'karakters') ?? baseline.targetCharCount,
  }
}

const SYNTHESIS_SYSTEM_PROMPT = `Je bent een senior bid-strateeg voor Nederlandse aanbestedingen.
Je krijgt een reeds samengevoegde uitvraag-analyse (uit losse documentanalyses) plus korte bedrijfscontext.
Jouw taak: een scherpe overkoepelende duiding leveren — GEEN eisen toevoegen of weglaten.

Lever concreet:
- summary: bondige samenvatting van de uitvraag (2-4 zinnen), inclusief welke stukken de inschrijver moet opstellen.
- styleProfile: stem van de inschrijver × verwachtingen van de opdrachtgever, met blendedGuidance.
- underlyingIntent: de "vraag achter de vraag", onderliggende behoefte, prioriteiten en schrijflens.

Regels:
- Baseer je uitsluitend op de aangeleverde analyse en context; verzin niets.
- Als een Nota van Inlichtingen eisen wijzigt (zie modifications), verwerk dat in je duiding.
- teamBrief is intern en begint met "Intern — niet opnemen in het inschrijfdocument".
- Schrijf in het Nederlands.

Antwoord UITSLUITEND met geldig JSON in exact deze vorm:
{
  "summary": "",
  "styleProfile": { "companyName": "", "buyerName": "", "companySignals": [], "buyerSignals": [], "blendedGuidance": "" },
  "underlyingIntent": { "explicitQuestion": "", "underlyingNeed": "", "questionBehindQuestion": "", "buyerPriorities": [], "implicitSuccessFactors": [], "writingGuidance": "", "teamBrief": "" }
}`

function summarizeMergedForSynthesis(merged: TenderAnalysis, extracts: TenderDocumentExtract[]): string {
  const docLine = extracts
    .map((item) => `- ${item.name} [${item.extract.role}]: ${item.extract.summary}`)
    .join('\n')
  const facts = extracts
    .flatMap((item) => item.extract.keyFacts.map((fact) => `- ${fact} (${item.name})`))
    .slice(0, 30)
    .join('\n')

  const requested = (merged.requestedDocuments ?? [])
    .map((doc) => `- [${doc.kind}] ${doc.title}${doc.criteria.length ? ` — beoordeeld op: ${doc.criteria.join(', ')}` : ''}${doc.question ? `\n  Vraag: ${doc.question}` : ''}`)
    .join('\n')

  return `Documenten (map-fase):
${docLine || '- (geen)'}

Op te stellen / aan te leveren stukken:
${requested || '- (geen herkend)'}

Samengevoegde eisen:
${JSON.stringify(
    {
      wordLimits: merged.wordLimits,
      contentRequirements: merged.contentRequirements,
      documentRequirements: merged.documentRequirements,
      submissionRequirements: merged.submissionRequirements,
      evaluationCriteria: merged.evaluationCriteria,
      targetWordCount: merged.targetWordCount,
      targetCharCount: merged.targetCharCount,
    },
    null,
    2,
  )}

Wijzigingen via Nota van Inlichtingen (overrulen de leidraad):
${merged.gaps.filter((gap) => gap.startsWith('Nota van Inlichtingen')).join('\n') || '- (geen)'}

Relevante feiten uit bijlagen:
${facts || '- (geen)'}`
}

async function synthesizeAnalysis(
  ai: ReturnType<typeof resolveAiFromRequest>,
  buyerName: string,
  merged: TenderAnalysis,
  extracts: TenderDocumentExtract[],
  companyContext: string,
): Promise<TenderAnalysis> {
  const userContent = `Opdrachtgever: ${buyerName}

Bedrijfscontext (inschrijver):
${companyContext || '(geen bedrijfsbronnen aangeleverd)'}

${summarizeMergedForSynthesis(merged, extracts)}

Lever de overkoepelende duiding als JSON volgens het schema.`

  const content = await completeChat(
    ai,
    [
      { role: 'system', content: SYNTHESIS_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    { jsonMode: ai.provider !== 'anthropic', maxTokens: 4_000, timeoutMs: 90_000, useThinking: false, label: 'uitvraag-analyse' },
  )

  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim()
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>
  } catch {
    return merged
  }

  return {
    ...merged,
    summary: str(parsed.summary) || merged.summary,
    styleProfile: mergeStyleProfile(parsed.styleProfile, merged.styleProfile),
    underlyingIntent: mergeUnderlyingIntent(parsed.underlyingIntent, merged.underlyingIntent),
  }
}

function buildCompanyContext(request: AnalyzeTenderRequest): string {
  // De eisen zitten volledig in de per-document extracten; deze context dient
  // alleen voor stijl- en bedrijfssignalen in de synthese. 2k per doc volstaat.
  return request.documents
    .filter((doc) => doc.type === 'company' || doc.type === 'rules' || doc.type === 'training')
    .map((doc) => `- [${doc.type}] ${doc.name}:\n${trimSource(doc.content, 2_000)}`)
    .join('\n\n')
}

/** Reduce-pad: extracten samenvoegen + synthesepass. Faalt de synthese, dan blijft de merge staan. */
async function reduceFromExtracts(request: AnalyzeTenderRequest): Promise<Response> {
  const extracts = request.extracts ?? []
  const merged = mergeExtracts(request.baseline, extracts)

  let ai: ReturnType<typeof resolveAiFromRequest>
  try {
    ai = resolveAiFromRequest(request.ai, 'INTENT_MODEL', 'analysis')
  } catch {
    // Geen AI beschikbaar → lever de deterministisch samengevoegde analyse (al compleet).
    return Response.json({
      analysis: { ...merged, aiAnalyzed: true, summary: merged.summary || request.baseline.summary },
      provider: 'map-reduce',
      model: 'deterministisch',
      enriched: true,
    } satisfies AnalyzeTenderResponse)
  }

  let analysis = merged
  try {
    analysis = await synthesizeAnalysis(ai, request.buyerName, merged, extracts, buildCompanyContext(request))
  } catch {
    // Synthese mislukt → de merge is nog steeds een volledige, bruikbare analyse.
    analysis = merged
  }

  return Response.json({
    analysis: { ...analysis, aiAnalyzed: true, analysisProvider: ai.provider, analysisModel: ai.model },
    provider: ai.provider,
    model: ai.model,
    enriched: true,
  } satisfies AnalyzeTenderResponse)
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

  // Map-reduce-pad: zijn er per-document extracten meegegeven, voeg die dan samen
  // i.p.v. alle volledige documenten opnieuw in één call te lezen (geen truncatie).
  if (request.extracts?.length) {
    return reduceFromExtracts(request)
  }

  let ai: ReturnType<typeof resolveAiFromRequest>
  try {
    ai = resolveAiFromRequest(request.ai, 'INTENT_MODEL', 'analysis')
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
      { jsonMode: ai.provider !== 'anthropic', maxTokens: 8_000, timeoutMs: 120_000, useThinking: false, label: 'uitvraag-samenvoeging' },
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
