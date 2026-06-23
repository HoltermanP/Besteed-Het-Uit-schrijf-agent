import { completeChat, resolveAiFromRequest, type AiRuntimeConfig } from './aiClient'
import type {
  RewriteFragmentRequest,
  RewriteFragmentResponse,
} from '../../src/types/rewriteFragment'
import type { TenderAnalysis } from '../../src/types/tenderAnalysis'

const stageLabels: Record<RewriteFragmentRequest['stage'], string> = {
  brons: 'Brons (eerste concept)',
  zilver: 'Zilver (review verwerkt)',
  goud: 'Goud (eindversie)',
}

const DOC_CHAR_LIMIT = 6_000
const SECTION_CHAR_LIMIT = 20_000

const SYSTEM_PROMPT = `Je bent een senior bidwriter voor Nederlandse aanbestedingen (Aanbestedingswet, EMVI, BPKV).
Je krijgt ÉÉN afgebakend onderdeel (een <section> of <header>) uit een lopend inschrijfdocument, plus één concrete reviewopmerking van een menselijke reviewer over een specifiek tekstfragment binnen dat onderdeel.

OPDRACHT
- Verwerk de opmerking door zo GERICHT mogelijk te herschrijven. Standaard pas je alleen de betreffende zin of alinea aan.
- Herschrijf een hele paragraaf of het volledige onderdeel ALLEEN als de opmerking dat inhoudelijk vereist (bijv. "herschrijf deze paragraaf", "dit hoofdstuk klopt niet", een tegenstrijdigheid die de hele sectie raakt).
- Behoud al het overige EXACT ongewijzigd: koppen, niet-genoemde alinea's, opsommingen, tabellen, visuele modellen, nummering en volgorde. Kopieer ongewijzigde delen letterlijk over.
- Verander het sectienummer en de titel (<h2>) niet, tenzij de opmerking daar expliciet om vraagt.

STIJL & INHOUD
- Nederlands, formeel, toetsbaar, actief waar passend. Volg de bestaande schrijfstijl en eventuele schrijfregels.
- Onderbouw met feiten uit de aangeleverde bronnen; verzin geen feiten; geen lege superlatieven.
- Verwijs niet naar AI, prompts of het reviewproces.
- Behoud de HTML-conventies: tabellen in <div class="table-wrap"><table><caption>…</caption>…; visuele modellen als <figure class="doc-model"> met een type-tabel (process-flow / timeline / org-chart / matrix-2x2 / model-grid). Voeg alleen een model of tabel toe als de opmerking daarom vraagt of het de boodschap aantoonbaar versterkt.

OUTPUT
- Uitsluitend het bijgewerkte onderdeel als geldige HTML, beginnend met hetzelfde root-element (<section …> of <header …>) en eindigend met de bijbehorende sluit-tag.
- Geen markdown, geen codeblok, geen uitleg, geen tekst eromheen.`

function trimText(text: string, max: number): string {
  const cleaned = (text ?? '').replace(/\s+/g, ' ').trim()
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned
}

function formatStyleContext(analysis: TenderAnalysis | null): string {
  if (!analysis) return '- Geen leidraadanalyse beschikbaar; volg de stijl van het bestaande onderdeel.'
  const lines = [`- Gecombineerde schrijfstijl: ${analysis.styleProfile.blendedGuidance}`]
  if (analysis.styleProfile.buyerSignals?.length) {
    lines.push(`- Opdrachtgevertaal: ${analysis.styleProfile.buyerSignals.join('; ')}`)
  }
  if (analysis.evaluationCriteria?.length) {
    lines.push(`- Relevante beoordelingscriteria: ${analysis.evaluationCriteria.slice(0, 6).join(', ')}`)
  }
  if (analysis.underlyingIntent) {
    lines.push(`- Vraag achter de vraag: ${analysis.underlyingIntent.questionBehindQuestion}`)
  }
  return lines.join('\n')
}

function formatDocuments(
  documents: RewriteFragmentRequest['documents'],
  types: RewriteFragmentRequest['documents'][number]['type'][],
): string {
  const relevant = documents.filter((doc) => types.includes(doc.type))
  if (!relevant.length) return '- geen'
  return relevant.map((doc) => `- [${doc.type}] ${doc.name}: ${trimText(doc.content, DOC_CHAR_LIMIT)}`).join('\n')
}

function buildUserPrompt(request: RewriteFragmentRequest): string {
  return `Fase: ${stageLabels[request.stage]}

Project:
- Titel: ${request.project.title}
- Opdrachtgever: ${request.project.buyer}
- Deadline: ${request.project.deadline}
- TenderNed: ${request.project.tendernedId}

Stijl- en beoordelingscontext:
${formatStyleContext(request.analysis)}

Schrijfregels & voorbeeldstijl (volg toon en formulering):
${formatDocuments(request.documents, ['rules', 'training'])}

Onderbouwende feiten over de inschrijver:
${formatDocuments(request.documents, ['company'])}

=== REVIEWOPMERKING ===
- Tekstfragment waar de opmerking over gaat: "${trimText(request.fragment, 600)}"
- Opmerking / instructie: ${request.note}

=== ONDERDEEL OM AAN TE PASSEN (herschrijf gericht, behoud de rest letterlijk) ===
${trimText(request.sectionHtml, SECTION_CHAR_LIMIT)}

Lever uitsluitend het bijgewerkte onderdeel als HTML, met hetzelfde root-element.`
}

function rootTagOf(html: string): string {
  return html.trim().match(/^<\s*([a-zA-Z0-9]+)/)?.[1]?.toLowerCase() ?? 'section'
}

function extractElement(content: string, rootTag: string): string {
  const fenced = content.match(/```html?\s*([\s\S]*?)```/i)?.[1]
  const text = (fenced ?? content).trim()
  const match = text.match(new RegExp(`<${rootTag}[\\s\\S]*</${rootTag}>`, 'i'))
  if (match?.[0]?.trim()) return match[0].trim()
  throw new Error('Het herschreven onderdeel kon niet worden uitgelezen. Probeer opnieuw.')
}

export async function generateFragmentRewrite(
  request: RewriteFragmentRequest,
  ai: AiRuntimeConfig,
): Promise<RewriteFragmentResponse> {
  const rootTag = rootTagOf(request.sectionHtml)
  const content = await completeChat(
    ai,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(request) },
    ],
    { maxTokens: 16_000, timeoutMs: 120_000, useThinking: false, effort: 'high' },
  )

  return {
    html: extractElement(content, rootTag),
    model: ai.model,
    provider: ai.provider,
  }
}

export async function handleRewriteFragmentRequest(body: unknown): Promise<Response> {
  try {
    const request = (body ?? {}) as RewriteFragmentRequest
    if (!request.sectionHtml?.trim()) {
      throw new Error('Geen onderdeel om te herschrijven.')
    }
    if (!request.note?.trim()) {
      throw new Error('Geen opmerking om te verwerken.')
    }
    if (!['brons', 'zilver', 'goud'].includes(request.stage)) {
      throw new Error('Ongeldige fase.')
    }

    const ai = resolveAiFromRequest(request.ai as AiRuntimeConfig | undefined, 'WRITER_MODEL')
    const result = await generateFragmentRewrite(request, ai)
    return Response.json(result satisfies RewriteFragmentResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout bij herschrijven.'
    return Response.json({ error: message }, { status: 400 })
  }
}
