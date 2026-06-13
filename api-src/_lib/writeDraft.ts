import { completeChat, resolveAiFromRequest, streamChat, type AiRuntimeConfig, type AiMessage } from './aiClient'
import type { WriteDraftDocument, WriteDraftRequest, WriteDraftResponse } from '../../src/types/writeDraft'
import type { TenderAnalysis } from '../../src/types/tenderAnalysis'

const stageInstructions: Record<WriteDraftRequest['stage'], string> = {
  brons:
    'Schrijf een volledige eerste versie van het gevraagde inschrijfstuk. Werk elk verplicht onderwerp diepgaand uit. Staat er een maximum in de leidraad: gebruik dat woord- of karakterbudget bijna volledig (richting het maximum, zonder overschrijding). Geen maximum: schrijf zeer uitgebreid.',
  zilver:
    'Verbeter en breid het bestaande concept uit: verwerk reviewopmerkingen, versterk bewijsvoering en vul gaten. Met leidraad-maximum: breid uit tot dicht bij het maximum; inkort alleen boven het maximum.',
  goud:
    'Lever de definitieve versie: volledig, concreet en exportklaar. Met leidraad-maximum: eindig op 97–100% van het maximum; zonder maximum zeer uitgebreid.',
}

const stageLabels: Record<WriteDraftRequest['stage'], string> = {
  brons: 'Brons',
  zilver: 'Zilver',
  goud: 'Goud',
}

const SYSTEM_PROMPT = `Je bent een senior bidwriter voor Nederlandse aanbestedingen (Aanbestedingswet, EMVI, BPKV).

DOEL
Schrijf het concrete inschrijfstuk dat de opdrachtgever vraagt — geen generiek salesdocument. Structuur, koppen en volgorde volgen de leidraad en beoordelingscriteria, niet een vaste template.

BRONHIËRARCHIE (streng, van hoog naar laag)
1. Leidraad / aanbestedingsstukken — gevraagde stukken, onderwerpen, woord- en paginalimieten, beoordelingscriteria
2. Schrijfregels & kwaliteitsstandaarden — verplichte formulering, kwaliteitsnormen, verboden formuleringen
3. Bedrijfsinformatie — alleen feitelijke claims over het inschrijvende bedrijf
4. Schrijfstijl & voorbeeldteksten — toon, zinsbouw, opmaak; geen nieuwe inhoud verzinnen

INHOUDELIJKE REGELS
- Maak per verplicht onderwerp uit de leidraadanalyse een eigen <section class="doc-section"> met genummerde <h2>
- Koppel elke sectie in een <p class="section-subtitle"> aan het relevante beoordelingscriterium of subcriterium
- Beantwoord wat de opdrachtgever expliciet vraagt én adresseer de onderliggende behoefte uit de analyse "vraag achter de vraag"
- Laat in elke sectie impliciet zien dat u het werkelijke doel van de opdrachtgever begrijpt (zekerheid, grip, beheersbaarheid, EMVI-prioriteiten)
- Voeg geen standaardparagrafen toe over risico, duurzaamheid, implementatie of continuiteit tenzij de leidraad dat vereist
- Onderbouw uitspraken met feiten uit bedrijfsbronnen; geen lege superlatieven
- Ontbrekende feiten niet verzinnen — weglaten of voorzichtig formuleren
- Verwijs niet naar het schrijfproces, AI, prompts of interne review

STIJL
- Nederlands, formeel, toetsbaar, actief waar passend
- Volg schrijfregels en de gecombineerde schrijfstijl uit de analyse

VOLUME (cruciaal)
- Als de leidraad een maximum aantal woorden, karakters of pagina's noemt: blijf daar STRIKT onder, maar gebruik het budget bijna volledig — schrijf richting het maximum (97–100%), niet een korte samenvatting
- Als er GEEN maximum is: schrijf ZEER uitgebreid — minimaal 2500 woorden totaal, tenzij de leidraad expliciet korter vraagt
- Per verplicht onderwerp: minimaal 4–8 alinea's met concrete werkwijze, voorbeelden, KPI's, rollen, planning en bewijs
- Dit is een volwaardig inschrijfstuk voor een aanbesteding, geen managementsamenvatting of bullet-only tekst
- Geen opvulling of herhaling; wel volledige uitwerking van alle eisen

OUTPUT (alleen HTML, geen markdown)
- Eén <article class="proposal-doc">…</article>
- <header class="doc-header"> met kicker (Brons/Zilver/Goud versie), <h1>, metadata (<dl class="doc-meta">), <p class="lead">
- Per gevraagd stuk/onderwerp: <section class="doc-section"> met <h2>, <p class="section-subtitle">, inhoud (<p>, <ul>, <table> alleen waar passend)
- Geen meta-sectie over schrijfkwaliteit, stijlbibliotheek of werkwijze van het schrijven
- Geen tekst buiten het HTML-artikel`

const DOC_CHAR_LIMITS: Record<WriteDraftDocument['type'], number> = {
  tender: 40_000,
  company: 20_000,
  rules: 20_000,
  training: 20_000,
}

/** Streefdoel en ondergrens t.o.v. leidraad-maximum */
const VOLUME_TARGET_RATIO = 0.97
const VOLUME_FLOOR_RATIO = 0.92

function summarizeDocument(content: string, max: number): string {
  const clean = content.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean
}

function hasVolumeLimit(analysis: TenderAnalysis): boolean {
  return Boolean(
    analysis.targetWordCount ||
      analysis.targetCharCount ||
      (analysis.wordLimits ?? []).some((limit) => limit.unit === 'paginas' && limit.max),
  )
}

function formatVolumeLimits(analysis: TenderAnalysis): string {
  const wordLimits = analysis.wordLimits ?? []
  if (!wordLimits.length) {
    return '- Geen woord-, karakter- of paginalimiet gedetecteerd in de leidraad.'
  }

  return wordLimits
    .map((limit) => {
      const scope = limit.section ? ` (${limit.section})` : ''
      const value =
        limit.min && limit.max
          ? `${limit.min}–${limit.max} ${limit.unit}`
          : limit.max
            ? `max. ${limit.max} ${limit.unit}`
            : limit.min
              ? `min. ${limit.min} ${limit.unit}`
              : limit.unit
      return `- ${limit.label}${scope}: ${value} [${limit.source}]`
    })
    .join('\n')
}

function buildVolumeInstruction(analysis: TenderAnalysis | null | undefined): string {
  if (!analysis || !hasVolumeLimit(analysis)) {
    const mandatoryCount = analysis?.contentRequirements?.filter((item) => item.mandatory).length ?? 0
    const minWords = Math.max(2500, mandatoryCount * 350)
    return `VOLUME — GEEN MAXIMUM IN LEIDRAAD (schrijf zeer uitgebreid)
- Er is geen maximum aantal woorden of karakters gevonden in de leidraad
- Streef naar minimaal ${minWords.toLocaleString('nl-NL')} woorden totaal — liever te uitgebreid dan te kort
- Per verplicht onderwerp: minimaal 4–8 alinea's, met concrete werkwijze, voorbeelden, KPI's, rollen, planning en bewijs
- Werk alle beoordelingscriteria volledig uit; geen samenvattingen of staccato bullets als enige inhoud
- Geen herhaling of opvulling; wel volledige, diepgaande uitwerking`
  }

  const lines = [
    'VOLUME — HARDE LIMIET + GEBRUIK HET BUDGET',
    'Tel alleen zichtbare tekst in het artikel (paragrafen, koppen, lijsten, tabelcellen). Geen HTML-tags, geen metadata.',
    'Schrijf richting het maximum uit de leidraad — een te kort stuk laat punten liggen; een te lang stuk is diskwalificerend.',
  ]

  if (analysis.targetWordCount) {
    const target = analysis.targetWordCount
    const aimLow = Math.round(target * VOLUME_TARGET_RATIO)
    lines.push(
      `- Maximum woorden: ${target} — streef naar ${aimLow}–${target} woorden (97–100% van het maximum)`,
      `- Te kort (< ${Math.round(target * VOLUME_FLOOR_RATIO)} woorden) is onvoldoende; te lang (> ${target}) is niet toegestaan`,
    )
  }

  if (analysis.targetCharCount) {
    const target = analysis.targetCharCount
    const aimLow = Math.round(target * VOLUME_TARGET_RATIO)
    lines.push(
      `- Maximum karakters: ${target.toLocaleString('nl-NL')} — streef naar ${aimLow.toLocaleString('nl-NL')}–${target.toLocaleString('nl-NL')} karakters`,
    )
  }

  ;(analysis.wordLimits ?? [])
    .filter((limit) => limit.unit === 'paginas' && limit.max)
    .forEach((limit) => {
      lines.push(
        `- Maximum pagina's: ${limit.max}${limit.section ? ` (${limit.section})` : ''} — gebruik het paginabudget volledig binnen de limiet`,
      )
    })

  lines.push(
    '- Bij zowel woorden als karakters: beide limieten gelden; benut het strakste maximum zo volledig mogelijk',
    '- Prioriteit: eerst alle verplichte onderwerpen volledig, daarna detail tot dicht bij het maximum',
    '- Te lang? inkorten door herhaling te schrappen, niet door verplichte eisen weg te laten',
  )

  return lines.join('\n')
}

function formatVolumeSummary(analysis: TenderAnalysis): string {
  if (!hasVolumeLimit(analysis)) {
    const mandatoryCount = analysis.contentRequirements?.filter((item) => item.mandatory).length ?? 0
    const minWords = Math.max(2500, mandatoryCount * 350)
    return `geen maximum — schrijf zeer uitgebreid (streef min. ${minWords.toLocaleString('nl-NL')} woorden)`
  }

  const parts: string[] = []
  if (analysis.targetWordCount) {
    parts.push(`max. ${analysis.targetWordCount} woorden (streef 97–100%)`)
  }
  if (analysis.targetCharCount) {
    parts.push(`max. ${analysis.targetCharCount.toLocaleString('nl-NL')} karakters`)
  }
  const pageMax = (analysis.wordLimits ?? [])
    .filter((limit) => limit.unit === 'paginas' && limit.max)
    .map((limit) => limit.max)
  if (pageMax.length) parts.push(`max. ${pageMax.join('/')} pagina's`)

  return parts.join(', ')
}

function formatContentRequirements(analysis: TenderAnalysis): string {
  const contentRequirements = analysis.contentRequirements ?? []
  if (!contentRequirements.length) {
    return '- Geen inhoudseisen gedetecteerd — leid structuur af uit aanbestedingsbronnen en beoordelingscriteria.'
  }

  const mandatory = contentRequirements.filter((item) => item.mandatory)
  const optional = contentRequirements.filter((item) => !item.mandatory)

  const lines: string[] = []
  if (mandatory.length) {
    lines.push('Verplichte onderwerpen (elk een aparte sectie):')
    mandatory.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.topic} — ${item.detail} [${item.source}]`)
    })
  }
  if (optional.length) {
    lines.push('', 'Optioneel (alleen opnemen als limiet en relevantie het toelaten):')
    optional.slice(0, 12).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.topic} — ${item.detail}`)
    })
  }
  return lines.join('\n')
}

function formatEvaluationCriteria(analysis: TenderAnalysis): string {
  const evaluationCriteria = analysis.evaluationCriteria ?? []
  if (!evaluationCriteria.length) {
    return '- Geen criteria gedetecteerd — koppel secties aan expliciete eisen uit de leidraad.'
  }

  return evaluationCriteria
    .map((criterion, index) => `${index + 1}. ${criterion}`)
    .join('\n')
}

function formatDocumentRequirements(analysis: TenderAnalysis): string {
  const documentRequirements = analysis.documentRequirements ?? []
  if (!documentRequirements.length) return '- geen'

  return documentRequirements
    .map(
      (doc) =>
        `- ${doc.name} (${doc.mandatory ? 'verplicht' : 'optioneel'}) — ${doc.source}`,
    )
    .join('\n')
}

function formatUnderlyingIntent(analysis: TenderAnalysis): string {
  const intent = analysis.underlyingIntent
  if (!intent) {
    return '- Geen vraag-achter-de-vraag analyse — leid onderliggende behoefte af uit leidraad en beoordelingscriteria.'
  }

  const lines = [
    `Expliciete vraag: ${intent.explicitQuestion}`,
    `Vraag achter de vraag: ${intent.questionBehindQuestion}`,
    `Onderliggende behoefte: ${intent.underlyingNeed}`,
  ]

  if (intent.buyerPriorities.length) {
    lines.push('', 'Prioriteiten opdrachtgever:')
    intent.buyerPriorities.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`)
    })
  }

  if (intent.implicitSuccessFactors.length) {
    lines.push('', 'Impliciete succescriteria:')
    intent.implicitSuccessFactors.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`)
    })
  }

  lines.push('', `Schrijflens: ${intent.writingGuidance}`)
  lines.push('', 'Let op: teamBrief uit de analyse is intern — niet opnemen in het inschrijfdocument.')

  return lines.join('\n')
}

function buildStructureInstruction(analysis: TenderAnalysis | null | undefined): string {
  if (!analysis) {
    return `STRUCTUUR
- Leid koppen en secties af uit de aanbestedingsbronnen
- Geen vaste EMVI-template; alleen wat de opdrachtgever vraagt

${buildVolumeInstruction(analysis)}`
  }

  return `STRUCTUUR (verplicht volgen)

${buildVolumeInstruction(analysis)}

Gedetecteerde limieten uit leidraad:
${formatVolumeLimits(analysis)}

${formatContentRequirements(analysis)}

Beoordelingscriteria (elke sectie moet minstens één criterium adresseren):
${formatEvaluationCriteria(analysis)}

Vraag achter de vraag (schrijflens — verwerk in inhoud, niet als apart meta-stuk):
${formatUnderlyingIntent(analysis)}

Verwachte bijlagen (inhoudelijk verwerken waar het plan van aanpak dat vraagt; niet als losse lijst dumpen):
${formatDocumentRequirements(analysis)}`
}

function buildAnalysisBlock(analysis: TenderAnalysis | null | undefined): string {
  if (!analysis) return 'Geen leidraadanalyse beschikbaar — leid structuur af uit aanbestedingsbronnen.'

  const gaps =
    analysis.gaps.length > 0
      ? `\nAandachtspunten / gaten:\n${analysis.gaps.map((gap) => `- ${gap}`).join('\n')}`
      : ''

  return `Leidraadanalyse:
- Samenvatting: ${analysis.summary}
- Leidraad gevonden: ${analysis.leidraadFound ? `ja (${analysis.leidraadSource ?? 'bron'})` : 'nee'}
- Volume: ${formatVolumeSummary(analysis)}
- Schrijfstijl: ${analysis.styleProfile.blendedGuidance}
- Inschrijver (${analysis.styleProfile.companyName}): ${analysis.styleProfile.companySignals.join('; ') || 'geen signalen'}
- Opdrachtgever (${analysis.styleProfile.buyerName}): ${analysis.styleProfile.buyerSignals.join('; ') || 'geen signalen'}
${analysis.underlyingIntent ? `- Vraag achter de vraag: ${analysis.underlyingIntent.questionBehindQuestion}` : ''}${gaps}`
}

function docsByType(request: WriteDraftRequest, type: WriteDraftDocument['type']): string {
  return request.documents
    .filter((doc) => doc.type === type)
    .map((doc) => `- ${doc.name}:\n${summarizeDocument(doc.content, DOC_CHAR_LIMITS[type])}`)
    .join('\n\n')
}

function buildUserPrompt(request: WriteDraftRequest): string {
  const openComments = request.comments
    .filter((comment) => !comment.resolved)
    .map((comment) => `- Fragment: ${comment.fragment}\n  Opmerking: ${comment.note}`)
    .join('\n')

  const currentDraftBlock = request.currentDraft?.trim()
    ? `HUIDIG CONCEPT (uitgangspunt — structuur behouden tenzij leidraad anders vereist):
${request.currentDraft.slice(0, 40_000)}`
    : ''

  const volumeLimited = request.analysis ? hasVolumeLimit(request.analysis) : false

  const stageTask =
    request.stage === 'brons'
      ? volumeLimited
        ? 'Schrijf het volledige inschrijfstuk en gebruik het volumemaximum uit de leidraad bijna volledig (97–100%, zonder overschrijding).'
        : 'Schrijf het volledige inschrijfstuk zeer uitgebreid — minimaal 2500 woorden, met alle verplichte onderwerpen diepgaand uitgewerkt.'
      : request.stage === 'zilver'
        ? volumeLimited
          ? 'Verbeter het huidige concept; verwerk alle open reviewopmerkingen en breid uit tot dicht bij het leidraad-maximum.'
          : 'Verbeter het huidige concept; verwerk alle open reviewopmerkingen en breid uit waar nodig.'
        : volumeLimited
          ? 'Finaliseer het concept op 97–100% van het leidraad-maximum, exportklaar.'
          : 'Finaliseer het concept: volledig en uitgebreid, zonder inhoud weg te laten.'

  return `Fase: ${stageLabels[request.stage]} — ${stageInstructions[request.stage]}

Project:
- Titel: ${request.project.title}
- Opdrachtgever: ${request.project.buyer}
- Deadline: ${request.project.deadline}
- TenderNed: ${request.project.tendernedId}

${buildAnalysisBlock(request.analysis)}

${buildStructureInstruction(request.analysis)}

=== BRONNEN ===

Aanbestedingsstukken (leidraad — leidend voor structuur en eisen):
${docsByType(request, 'tender') || '- geen'}

Bedrijfsinformatie (feiten voor onderbouwing):
${docsByType(request, 'company') || '- geen'}

Schrijfregels & kwaliteitsstandaarden (verplicht — formulering en kwaliteit):
${docsByType(request, 'rules') || '- geen'}

Schrijfstijl & voorbeeldteksten (toon/structuur — geen nieuwe inhoud):
${docsByType(request, 'training') || '- geen'}

Open reviewopmerkingen:
${openComments || '- geen'}

${currentDraftBlock}

${stageTask}
Lever uitsluitend het HTML-artikel.`
}

function extractHtml(content: string): string {
  const fenced = content.match(/```html?\s*([\s\S]*?)```/i)
  if (fenced?.[1]?.trim() && isArticleComplete(fenced[1])) return fenced[1].trim()

  const article = content.match(/<article[\s\S]*<\/article>/i)
  if (article?.[0]) return article[0]

  const trimmed = content.trim()
  if (trimmed.startsWith('<article') && isArticleComplete(trimmed)) return trimmed

  throw new Error('Concept is onvolledig — het HTML-artikel is niet afgesloten.')
}

function isArticleComplete(content: string): boolean {
  return /<\/article>\s*$/i.test(content.trim())
}

function countVisibleWords(html: string): number {
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return plain ? plain.split(' ').length : 0
}

function countVisibleCharacters(html: string): number {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length
}

function minimumWordTarget(request: WriteDraftRequest): number {
  const analysis = request.analysis
  if (analysis?.targetWordCount) {
    return Math.round(analysis.targetWordCount * VOLUME_TARGET_RATIO)
  }
  const mandatory = analysis?.contentRequirements?.filter((item) => item.mandatory).length ?? 0
  return Math.max(2500, mandatory * 350)
}

function needsContinuation(accumulated: string, request: WriteDraftRequest): boolean {
  if (!isArticleComplete(accumulated)) return true

  const analysis = request.analysis
  const words = countVisibleWords(accumulated)

  if (analysis?.targetWordCount) {
    return words < Math.round(analysis.targetWordCount * VOLUME_FLOOR_RATIO)
  }

  if (analysis?.targetCharCount) {
    return countVisibleCharacters(accumulated) < Math.round(analysis.targetCharCount * VOLUME_FLOOR_RATIO)
  }

  return words < minimumWordTarget(request)
}

function buildContinuationPrompt(request: WriteDraftRequest, accumulated: string): string {
  const analysis = request.analysis
  const words = countVisibleWords(accumulated)
  let volumeHint = ''

  if (analysis?.targetWordCount) {
    const target = analysis.targetWordCount
    const aimLow = Math.round(target * VOLUME_TARGET_RATIO)
    volumeHint = ` Het concept telt nu circa ${words} woorden. Breid uit richting het maximum van ${target} woorden (streef ${aimLow}–${target}) zonder het maximum te overschrijden.`
  } else if (analysis?.targetCharCount) {
    const target = analysis.targetCharCount
    const chars = countVisibleCharacters(accumulated)
    const aimLow = Math.round(target * VOLUME_TARGET_RATIO)
    volumeHint = ` Het concept telt nu circa ${chars.toLocaleString('nl-NL')} karakters. Breid uit richting het maximum van ${target.toLocaleString('nl-NL')} karakters (streef ${aimLow.toLocaleString('nl-NL')}–${target.toLocaleString('nl-NL')}).`
  } else {
    volumeHint = ` Het concept telt nu circa ${words} woorden. Werk alle resterende verplichte onderwerpen volledig uit tot minimaal ${minimumWordTarget(request)} woorden.`
  }

  return `Het vorige antwoord stopte voortijdig. Ga EXACT verder waar de tekst stopte — herhaal geen bestaande alinea's of secties. Sluit alle open HTML-tags af en eindig met </article>.${volumeHint}`
}

async function streamDraftToCompletion(
  ai: AiRuntimeConfig,
  request: WriteDraftRequest,
  send: (payload: Record<string, unknown>) => void,
): Promise<string> {
  const options = chatOptions(request)
  const baseMessages = buildChatMessages(request)
  let accumulated = ''
  let messages: AiMessage[] = baseMessages
  const maxPasses = 5

  for (let pass = 0; pass < maxPasses; pass++) {
    if (pass > 0) {
      send({ type: 'status', message: `Concept voortzetten (deel ${pass + 1})…` })
    }

    for await (const chunk of streamChat(ai, messages, options)) {
      accumulated += chunk
      send({ type: 'delta', text: chunk, accumulated })
    }

    if (!needsContinuation(accumulated, request)) {
      return extractHtml(accumulated)
    }

    messages = [
      ...baseMessages,
      { role: 'assistant', content: accumulated },
      { role: 'user', content: buildContinuationPrompt(request, accumulated) },
    ]
  }

  if (accumulated.trim().startsWith('<article')) {
    const closed = `${accumulated.trim()}\n</article>`
    if (isArticleComplete(closed)) return closed
  }

  throw new Error('Concept kon niet volledig worden afgerond. Probeer opnieuw te genereren.')
}

function buildChatMessages(request: WriteDraftRequest) {
  return [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: buildUserPrompt(request) },
  ]
}

function chatOptions(request: WriteDraftRequest) {
  return {
    maxTokens: 64_000,
    timeoutMs: 300_000,
    useThinking: false,
    effort: request.stage === 'goud' ? ('xhigh' as const) : ('high' as const),
  }
}

export function handleWriteDraftStreamRequest(request: WriteDraftRequest, ai: AiRuntimeConfig): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      try {
        const html = await streamDraftToCompletion(ai, request, send)
        send({
          type: 'done',
          html,
          model: ai.model,
          provider: ai.provider,
        })
        controller.close()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Onbekende fout bij genereren.'
        send({ type: 'error', error: message })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

export async function generateDraftWithAi(
  request: WriteDraftRequest,
  ai: AiRuntimeConfig,
): Promise<WriteDraftResponse> {
  let accumulated = ''
  const options = chatOptions(request)
  const baseMessages = buildChatMessages(request)
  let messages: AiMessage[] = baseMessages

  for (let pass = 0; pass < 5; pass++) {
    const chunk = await completeChat(ai, messages, options)
    accumulated += chunk
    if (!needsContinuation(accumulated, request)) break
    messages = [
      ...baseMessages,
      { role: 'assistant', content: accumulated },
      { role: 'user', content: buildContinuationPrompt(request, accumulated) },
    ]
  }

  return {
    html: extractHtml(accumulated),
    model: ai.model,
    provider: ai.provider,
  }
}

export async function handleWriteDraftRequest(body: unknown): Promise<Response> {
  try {
    const request = (body ?? {}) as WriteDraftRequest
    if (!request.project?.title?.trim()) {
      throw new Error('Projectgegevens ontbreken.')
    }
    if (!['brons', 'zilver', 'goud'].includes(request.stage)) {
      throw new Error('Ongeldige fase.')
    }

    const ai = resolveAiFromRequest(request.ai as AiRuntimeConfig | undefined, 'WRITER_MODEL')

    if (request.stream) {
      return handleWriteDraftStreamRequest(request, ai)
    }

    const result = await generateDraftWithAi(request, ai)
    return Response.json(result satisfies WriteDraftResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout bij genereren.'
    return Response.json({ error: message }, { status: 400 })
  }
}
