import { completeChat, resolveAiFromRequest, type AiRuntimeConfig } from './aiClient'
import type { WriteDraftDocument, WriteDraftRequest, WriteDraftResponse } from '../../src/types/writeDraft'

const stageInstructions: Record<WriteDraftRequest['stage'], string> = {
  brons:
    'Maak een scherpe eerste versie. Focus op compliance, structuur, beoordelingscriteria en het benutten van alle bronnen.',
  zilver:
    'Verwerk menselijke opmerkingen en verbeter bewijsvoering, specificiteit, toon, consistentie en win-thema’s.',
  goud:
    'Maak de eindversie overtuigend, compact, controleerbaar en exportklaar met duidelijke koppen en sterke HTML-opmaak.',
}

const stageLabels: Record<WriteDraftRequest['stage'], string> = {
  brons: 'Brons',
  zilver: 'Zilver',
  goud: 'Goud',
}

const SYSTEM_PROMPT = `Je bent een senior bidwriter voor Nederlandse aanbestedingen.
Schrijf in het Nederlands, formeel en toetsbaar. Vermijd promotionele taal.
Gebruik uitsluitend feiten en claims die onderbouwd zijn vanuit de aangeleverde bronnen.
Volg de schrijfregels, kwaliteitsstandaarden en voorbeeldteksten uit de stijlbibliotheek strikt.
Laat stijl, toon, structuur en kwaliteitsniveau aansluiten op de trainings- en richtlijndocumenten.
Antwoord uitsluitend met geldige HTML: één <article class="proposal-doc">…</article>.
Gebruik semantische secties (<header>, <section class="doc-section">, <h1>, <h2>, <p>, <ul>, <table> waar passend).
Voeg een kicker toe met de fase (Brons/Zilver/Goud versie), metadata (opdrachtgever, deadline, TenderNed) en een lead-paragraaf.
Verwerk expliciet de beoordelingscriteria, risico’s, duurzaamheid, implementatie en continuiteit als de bronnen dat vragen.
Geen markdown, geen uitleg buiten de HTML.`

function summarizeDocument(content: string, max = 6_000): string {
  const clean = content.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean
}

function buildUserPrompt(request: WriteDraftRequest): string {
  const docsByType = (type: WriteDraftDocument['type']) =>
    request.documents
      .filter((doc) => doc.type === type)
      .map((doc) => `- ${doc.name}: ${summarizeDocument(doc.content)}`)
      .join('\n')

  const openComments = request.comments
    .filter((comment) => !comment.resolved)
    .map((comment) => `- Fragment: ${comment.fragment}\n  Opmerking: ${comment.note}`)
    .join('\n')

  const analysisBlock = request.analysis
    ? `Leidraadanalyse:
- Samenvatting: ${request.analysis.summary}
- Doel woorden: ${request.analysis.targetWordCount ?? 'onbekend'}
- Beoordelingscriteria: ${request.analysis.evaluationCriteria.join('; ') || 'niet gevonden'}
- Stijl: ${request.analysis.styleProfile.blendedGuidance}
- Inhoudseisen: ${request.analysis.contentRequirements
        .slice(0, 10)
        .map((item) => `${item.topic} (${item.mandatory ? 'verplicht' : 'gewenst'})`)
        .join('; ')}`
    : 'Geen leidraadanalyse beschikbaar.'

  const currentDraftBlock = request.currentDraft?.trim()
    ? `Huidig concept (verbeteren, niet opnieuw beginnen tenzij nodig):\n${request.currentDraft.slice(0, 12_000)}`
    : ''

  return `Fase: ${stageLabels[request.stage]} — ${stageInstructions[request.stage]}

Project:
- Titel: ${request.project.title}
- Opdrachtgever: ${request.project.buyer}
- Deadline: ${request.project.deadline}
- TenderNed: ${request.project.tendernedId}

${analysisBlock}

Aanbestedingsbronnen:
${docsByType('tender') || '- geen'}

Bedrijfsbronnen:
${docsByType('company') || '- geen'}

Schrijfregels en kwaliteitsrichtlijnen (verplicht volgen):
${docsByType('rules') || '- geen'}

Schrijfstijl, voorbeelden en trainingsmateriaal (toon/structuur/kwaliteit):
${docsByType('training') || '- geen'}

Open reviewopmerkingen:
${openComments || '- geen'}

${currentDraftBlock}

Genereer het volledige HTML-artikel.`
}

function extractHtml(content: string): string {
  const fenced = content.match(/```html?\s*([\s\S]*?)```/i)
  if (fenced?.[1]?.trim()) return fenced[1].trim()

  const article = content.match(/<article[\s\S]*<\/article>/i)
  if (article?.[0]) return article[0]

  const trimmed = content.trim()
  if (trimmed.startsWith('<article')) return trimmed

  throw new Error('Schrijfagent gaf geen geldige HTML terug.')
}

export async function generateDraftWithAi(request: WriteDraftRequest): Promise<WriteDraftResponse> {
  const ai = resolveAiFromRequest(request.ai as AiRuntimeConfig | undefined, 'WRITER_MODEL')
  const content = await completeChat(
    ai,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(request) },
    ],
    {
      maxTokens: 16_000,
      timeoutMs: 180_000,
      effort: request.stage === 'goud' ? 'xhigh' : 'high',
    },
  )

  return {
    html: extractHtml(content),
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

    const result = await generateDraftWithAi(request)
    return Response.json(result satisfies WriteDraftResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout bij genereren.'
    return Response.json({ error: message }, { status: 400 })
  }
}
