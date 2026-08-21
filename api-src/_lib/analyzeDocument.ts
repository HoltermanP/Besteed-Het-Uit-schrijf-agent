import type { AnalyzeDocumentRequest, AnalyzeDocumentResponse } from '../../src/types/analyzeDocument'
import type {
  ContentRequirement,
  DocumentExtract,
  DocumentRequirement,
  DocumentRole,
  SubmissionRequirement,
  WordLimit,
} from '../../src/types/tenderAnalysis'
import { completeChat, resolveAiFromRequest } from './aiClient'
import { normalizeRequestedDocuments } from '../../src/lib/requestedDocuments'

// Eén stuk per call: ruim budget zodat een volledige leidraad in één keer wordt gelezen.
const DOC_CHAR_LIMIT = 200_000

function trimSource(text: string, max = DOC_CHAR_LIMIT): string {
  // eslint-disable-next-line no-control-regex -- strip null bytes uit ge-extraheerde PDF/Office-tekst
  const cleaned = text.replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').trim()
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max)}…`
}

/** Bepaalt de rol van een stuk uit de bestandsnaam wanneer de client die niet meegeeft. */
export function detectDocumentRole(name: string): DocumentRole {
  const n = name.toLowerCase()
  if (
    /leidraad|beschrijvend document|offerteaanvraag|aanbestedingsdocument|inschrijfleidraad|selectieleidraad|gunningsleidraad|beoordelingsleidraad/.test(
      n,
    )
  ) {
    return 'leidraad'
  }
  if (/nota van inlichtingen|\bnvi\b|vragen(?:ronde|lijst)?|inlichtingen(?:ronde)?/.test(n)) {
    return 'nota-van-inlichtingen'
  }
  if (
    /bijlage|bestek|programma van (?:eisen|wensen)|\bpve\b|\bpvw\b|tekening|format|model|(?:concept)?overeenkomst|prijsblad|begroting|\buea\b/.test(
      n,
    )
  ) {
    return 'bijlage'
  }
  return 'overig'
}

const ROLE_GUIDANCE: Record<DocumentRole, string> = {
  leidraad: `Dit is (waarschijnlijk) de LEIDRAAD / het beschrijvend document — de kern van de uitvraag.
Extraheer met de hoogste nauwkeurigheid en VERBATIM waar het om harde eisen gaat:
- alle woord-, karakter- en paginalimieten (met de exacte getallen en op welke sectie ze slaan)
- elk verplicht onderwerp/vraag dat inhoudelijk beantwoord moet worden (contentRequirements)
- alle in te dienen documenten/bijlagen (documentRequirements)
- WELKE STUKKEN DE INSCHRIJVER MOET OPSTELLEN (requestedDocuments) — dit is cruciaal, zie hieronder
- de beoordelingscriteria met gewichten (evaluationCriteria)
- vorm-, opmaak-, indienings- en geschiktheidseisen (submissionRequirements)
Vat NIET lossy samen: mis geen limiet of verplicht onderwerp. Laat modifications leeg.

REQUESTEDDOCUMENTS — de op te stellen stukken (één item per stuk dat apart wordt ingediend of beoordeeld):
- kind "schrijfstuk": alles wat de inschrijver zelf moet SCHRIJVEN en waarop inhoudelijk wordt beoordeeld: plan van aanpak,
  kwaliteitsdocument/uitwerking per (sub)gunningscriterium of per vraag (bv. "Kwaliteit — Subcriterium 1: Implementatie"),
  casusuitwerking, implementatie-/transitieplan, communicatieplan, risicoanalyse, visie, presentatie, SROI-plan, enz.
  Vraagt de leidraad per (sub)gunningscriterium een aparte uitwerking of een apart in te dienen document, maak dan per
  criterium/vraag een eigen schrijfstuk. Vraagt ze één samenhangend document met meerdere hoofdstukken, maak dan één
  schrijfstuk met die hoofdstukken als topics.
- kind "formulier": voorgeschreven formats die worden ingevuld/ondertekend (UEA, prijsblad/inschrijfbiljet, verklaringen, invullingsblad).
- kind "bewijsstuk": bestaand bewijs dat wordt bijgevoegd (referenties, CV's, certificaten, uittreksels, polissen).
Per item: title (korte, herkenbare titel zoals de leidraad het stuk noemt, incl. criteriumnummer als dat er is), kind, question
(de LETTERLIJKE vraag/opdracht uit de leidraad waar dit stuk antwoord op geeft — citeer of parafraseer dicht bij de tekst, incl.
wat de beoordelaar wil zien), criteria (de (sub)gunningscriteria met weging waarop dít stuk wordt beoordeeld), topics (de
onderwerpen/deelvragen die in dít stuk beantwoord moeten worden, in de volgorde van de leidraad), wordLimits (alleen de
limieten die voor dít stuk gelden), format (bv. "PDF, max. 4 A4, Arial 10"), mandatory, source.`,
  'nota-van-inlichtingen': `Dit is een NOTA VAN INLICHTINGEN (vragen & antwoorden).
Deze OVERRULET de leidraad waar antwoorden eisen wijzigen, verduidelijken of intrekken.
- Zet elke wijziging/verduidelijking die een eis raakt in modifications (concreet: "X wordt Y").
- Neem gewijzigde of nieuwe limieten/eisen ook op in de bijbehorende lijsten.
- requestedDocuments: alleen vullen als de NvI een op te stellen stuk toevoegt, schrapt of de vraag/limiet ervan wijzigt
  (zelfde velden als bij de leidraad: title, kind, question, criteria, topics, wordLimits, format, mandatory, source).
- Laat lijsten leeg als de NvI die niet raakt; verzin geen eisen.`,
  bijlage: `Dit is een BIJLAGE (bv. bestek, programma van eisen, format, prijsblad of overeenkomst).
- Vat de inhoud beknopt samen (summary) en haal concrete feiten/cijfers/constraints op in keyFacts
  die nodig zijn om conform te schrijven.
- Neem alleen eisen/limieten op als ze hier echt staan; herhaal de leidraad niet.`,
  overig: `Bepaal zelf de rol van dit stuk en extraheer wat relevant is voor het schrijven van de inschrijving.`,
}

const SUBMISSION_CATEGORIES = ['vorm', 'opmaak', 'indiening', 'geschiktheid', 'uitsluiting', 'proces', 'overig']

function buildSystemPrompt(role: DocumentRole): string {
  return `Je bent een senior bid-analist voor Nederlandse aanbestedingen (Aanbestedingswet, EMVI/BPKV).
Je krijgt ÉÉN aanbestedingsstuk en distilleert het tot een compact, gestructureerd extract voor de verdere pijplijn.

${ROLE_GUIDANCE[role]}

Algemene regels:
- Baseer je UITSLUITEND op dit document; verzin geen feiten, limieten of eisen.
- source = de bestandsnaam van dit document.
- mandatory = true alleen als de tekst het verplicht stelt (verplicht/dient/moet/op straffe van uitsluiting).
- submissionRequirements.category ∈ {"vorm","opmaak","indiening","geschiktheid","uitsluiting","proces","overig"}.
- wordLimits.unit ∈ {"woorden","karakters","paginas"}; vul min/max met getallen of null.
- Schrijf in het Nederlands, concreet en toetsbaar. Laat een lijst leeg ([]) als dit stuk er niets over zegt.

Antwoord UITSLUITEND met geldig JSON in exact deze vorm:
{
  "summary": "",
  "wordLimits": [{ "label": "", "section": "", "min": null, "max": null, "unit": "woorden", "source": "" }],
  "contentRequirements": [{ "topic": "", "detail": "", "mandatory": true, "source": "" }],
  "documentRequirements": [{ "name": "", "mandatory": true, "source": "" }],
  "requestedDocuments": [{ "title": "", "kind": "schrijfstuk|formulier|bewijsstuk", "question": "", "criteria": [], "topics": [], "wordLimits": [{ "label": "", "section": "", "min": null, "max": null, "unit": "woorden", "source": "" }], "format": "", "mandatory": true, "source": "" }],
  "submissionRequirements": [{ "category": "vorm", "requirement": "", "mandatory": true, "source": "" }],
  "evaluationCriteria": ["Criterium (gewicht%)"],
  "modifications": [],
  "keyFacts": []
}`
}

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

function normalizeWordLimits(value: unknown, source: string): WordLimit[] {
  return asArray<Record<string, unknown>>(value)
    .map((item): WordLimit | null => {
      const unit = str(item.unit)
      const normalizedUnit = unit === 'karakters' || unit === 'paginas' ? unit : 'woorden'
      const min = posInt(item.min)
      const max = posInt(item.max)
      if (min === undefined && max === undefined) return null
      return {
        label: str(item.label) || 'Limiet',
        section: str(item.section) || undefined,
        min,
        max,
        unit: normalizedUnit,
        source: str(item.source) || source,
      }
    })
    .filter((item): item is WordLimit => item !== null)
}

function normalizeContentRequirements(value: unknown, source: string): ContentRequirement[] {
  return asArray<Record<string, unknown>>(value)
    .map((item): ContentRequirement | null => {
      const topic = str(item.topic)
      if (!topic) return null
      return {
        topic,
        detail: str(item.detail) || topic,
        mandatory: item.mandatory !== false,
        source: str(item.source) || source,
      }
    })
    .filter((item): item is ContentRequirement => item !== null)
}

function normalizeDocumentRequirements(value: unknown, source: string): DocumentRequirement[] {
  return asArray<Record<string, unknown>>(value)
    .map((item): DocumentRequirement | null => {
      const name = str(item.name)
      if (!name) return null
      return { name, mandatory: item.mandatory !== false, source: str(item.source) || source }
    })
    .filter((item): item is DocumentRequirement => item !== null)
}

function normalizeSubmissionRequirements(value: unknown, source: string): SubmissionRequirement[] {
  return asArray<Record<string, unknown>>(value)
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
        source: str(item.source) || source,
      }
    })
    .filter((item): item is SubmissionRequirement => item !== null)
}

function normalizeStringList(value: unknown): string[] {
  return asArray<unknown>(value)
    .map((item) => str(item))
    .filter(Boolean)
}

function parseExtract(content: string, role: DocumentRole, source: string, sourceChars: number): DocumentExtract | null {
  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim()
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>
  } catch {
    return null
  }

  return {
    role,
    summary: str(parsed.summary),
    wordLimits: normalizeWordLimits(parsed.wordLimits, source),
    contentRequirements: normalizeContentRequirements(parsed.contentRequirements, source),
    documentRequirements: normalizeDocumentRequirements(parsed.documentRequirements, source),
    requestedDocuments: normalizeRequestedDocuments(parsed.requestedDocuments, source).slice(0, 25),
    submissionRequirements: normalizeSubmissionRequirements(parsed.submissionRequirements, source),
    evaluationCriteria: normalizeStringList(parsed.evaluationCriteria).slice(0, 12),
    modifications: normalizeStringList(parsed.modifications).slice(0, 30),
    keyFacts: normalizeStringList(parsed.keyFacts).slice(0, 30),
    sourceChars,
    analyzedAt: new Date().toISOString(),
  }
}

export async function handleAnalyzeDocumentRequest(request: AnalyzeDocumentRequest): Promise<Response> {
  const doc = request.document
  if (!doc?.content?.trim()) {
    return Response.json({ error: 'Document bevat geen tekst om te analyseren.' }, { status: 400 })
  }

  const source = doc.name?.trim() || 'document'
  const role = request.role ?? detectDocumentRole(source)

  let ai: ReturnType<typeof resolveAiFromRequest>
  try {
    ai = resolveAiFromRequest(request.ai, 'INTENT_MODEL', 'analysis')
  } catch {
    return Response.json({ error: 'Geen AI-configuratie beschikbaar voor documentanalyse.' }, { status: 400 })
  }

  const userContent = `Documentnaam: ${source}
${request.buyerName ? `Opdrachtgever: ${request.buyerName}\n` : ''}Vermoedelijke rol: ${role}

Documentinhoud:
${trimSource(doc.content)}

Lever het extract als JSON volgens het opgegeven schema.`

  try {
    const content = await completeChat(
      ai,
      [
        { role: 'system', content: buildSystemPrompt(role) },
        { role: 'user', content: userContent },
      ],
      { jsonMode: ai.provider !== 'anthropic', maxTokens: 8_000, timeoutMs: 110_000, useThinking: false, label: 'document-extract' },
    )

    const extract = parseExtract(content, role, source, doc.content.length)
    if (!extract) {
      return Response.json({ error: 'AI-analyse leverde geen geldig extract op.' }, { status: 502 })
    }

    return Response.json({
      extract: { ...extract, provider: ai.provider, model: ai.model },
      provider: ai.provider,
      model: ai.model,
      enriched: true,
    } satisfies AnalyzeDocumentResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Documentanalyse mislukt.'
    return Response.json({ error: message }, { status: 500 })
  }
}
