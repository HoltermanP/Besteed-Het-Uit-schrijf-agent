import type { StyleDocumentCategory } from '../../src/types/styleDocument'
import { type AiRuntimeConfig, completeChat } from './aiClient'

const MAX_INPUT_CHARS = 30_000
const MAX_OUTPUT_CHARS = 6_000
const NULL_BYTE = /\u0000/g

/** Sectie-specifieke focus voor de AI bij het opstellen van regels. */
const SECTION_FOCUS: Record<'richtlijnen' | 'schrijfstijl' | 'kwaliteit', string> = {
  richtlijnen: `Focus: verplichte schrijfregels en formuleringsvoorschriften.
Distilleer concrete, dwingende regels: verplichte formuleringen, verboden woorden of stijlfiguren,
do's-and-don'ts, structuureisen en formele voorschriften die in elke inschrijving moeten gelden.`,
  schrijfstijl: `Focus: schrijfwijze, toon en stijl.
Distilleer concrete stijlregels: toon, perspectief, zinslengte, actief/passief, woordkeuze,
opbouw en opmaakvoorkeuren — zo dat een schrijfagent de stijl exact kan reproduceren.`,
  kwaliteit: `Focus: kwaliteitsnormen en toetsbaarheid.
Distilleer concrete kwaliteitsregels: eisen aan onderbouwing en bewijs, bronvermelding,
toetsbaarheid, reviewcriteria en checklist-punten waaraan elke tekst moet voldoen.`,
}

function buildSystemPrompt(focus: string): string {
  return `Je bent een senior bid-redacteur voor Nederlandse aanbestedingen.
Je krijgt een brondocument (bijvoorbeeld een schrijfwijzer, kwaliteitsstandaard of voorbeeldtekst).
Je taak: leid hieruit een set concrete, direct toepasbare regels af voor een schrijfagent.

${focus}

Regels voor je antwoord:
- Baseer je uitsluitend op het document; verzin geen regels die er niet uit volgen.
- Schrijf in het Nederlands. Geef een opsomming met "- " per regel, één regel per bullet.
- Maak elke regel concreet, imperatief en toetsbaar (bijv. "Vermijd superlatieven zonder bewijs"),
  niet vaag of beschrijvend.
- Geen inleiding, geen samenvatting, geen koppen — alleen de bulletlijst met regels.
- Maximaal 15 regels. Voeg geen regels samen die los duidelijker zijn.
- Als het document geen bruikbare regels bevat, antwoord dan met exact: GEEN REGELS GEVONDEN`
}

function trimInput(text: string): string {
  const cleaned = text.replace(NULL_BYTE, '').replace(/[ \t]+\n/g, '\n').trim()
  if (cleaned.length <= MAX_INPUT_CHARS) return cleaned
  return `${cleaned.slice(0, MAX_INPUT_CHARS)}…`
}

/** Map een opslagcategorie naar de sectie-focus; valt terug op richtlijnen. */
function focusForCategory(category: StyleDocumentCategory): string {
  if (category === 'schrijfstijl' || category === 'voorbeeld') return SECTION_FOCUS.schrijfstijl
  if (category === 'kwaliteit') return SECTION_FOCUS.kwaliteit
  return SECTION_FOCUS.richtlijnen
}

export async function distillRulesFromContent(
  ai: AiRuntimeConfig,
  input: { name: string; content: string; category: StyleDocumentCategory },
): Promise<string> {
  const source = trimInput(input.content)
  if (!source) {
    throw new Error('Document bevat geen tekst om regels uit te distilleren.')
  }

  const systemPrompt = buildSystemPrompt(focusForCategory(input.category))
  const userContent = `Documentnaam: ${input.name}

Documentinhoud:
${source}

Lever uitsluitend de bulletlijst met regels.`

  const content = await completeChat(
    ai,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    { jsonMode: false, maxTokens: 2_000, timeoutMs: 120_000, useThinking: false },
  )

  const rules = content.trim()
  if (!rules || /^geen regels gevonden/i.test(rules)) {
    throw new Error('De AI vond geen bruikbare regels in dit document.')
  }

  return rules.length <= MAX_OUTPUT_CHARS ? rules : `${rules.slice(0, MAX_OUTPUT_CHARS)}…`
}
