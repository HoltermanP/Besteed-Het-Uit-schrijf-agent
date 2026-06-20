import type { SourceProfile } from '../../src/types/styleDocument'
import { type AiRuntimeConfig, completeChat } from './aiClient'

const MAX_INPUT_CHARS = 30_000
const MAX_SECTION_CHARS = 4_000
const NULL_BYTE = /\u0000/g

const SYSTEM_PROMPT = `Je bent een senior bid-analist voor Nederlandse aanbestedingen.
Je krijgt een brondocument (bijvoorbeeld een eerder inschrijfstuk of achtergrondmateriaal).
Distilleer het tot een bruikbaar profiel voor een schrijfagent, opgedeeld in vier aspecten.

Regels:
- Baseer je uitsluitend op het document; verzin geen feiten, cijfers of referenties.
- Schrijf in het Nederlands, beknopt en concreet — puntsgewijs waar dat helpt.
- schrijfstijl: kenmerk de toon, zinsbouw, structuur en formuleringsvoorkeuren (geen inhoud).
- kennis: concrete feiten, cijfers, methodieken en inhoudelijke kennis die onderbouwing geven.
- ervaringen: ervaringen, referenties, cases en resultaten uit eerdere opdrachten.
- achtergrond: bredere context (organisatie, markt, opdrachtgever) die het schrijven verrijkt.
- Laat een aspect leeg ("") als het document daarover niets bruikbaars bevat. Vul niet op.
- Houd elk aspect onder de ${MAX_SECTION_CHARS} tekens.

Antwoord uitsluitend met geldig JSON:
{
  "schrijfstijl": "",
  "kennis": "",
  "ervaringen": "",
  "achtergrond": ""
}`

function trimInput(text: string): string {
  const cleaned = text.replace(NULL_BYTE, '').replace(/[ \t]+\n/g, '\n').trim()
  if (cleaned.length <= MAX_INPUT_CHARS) return cleaned
  return `${cleaned.slice(0, MAX_INPUT_CHARS)}…`
}

function clampSection(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (trimmed.length <= MAX_SECTION_CHARS) return trimmed
  return `${trimmed.slice(0, MAX_SECTION_CHARS)}…`
}

function parseProfile(content: string): SourceProfile {
  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim()
  let parsed: Partial<Record<keyof SourceProfile, unknown>>
  try {
    parsed = JSON.parse(jsonText) as Partial<Record<keyof SourceProfile, unknown>>
  } catch {
    throw new Error('AI-analyse leverde geen geldig profiel op.')
  }

  return {
    schrijfstijl: clampSection(parsed.schrijfstijl),
    kennis: clampSection(parsed.kennis),
    ervaringen: clampSection(parsed.ervaringen),
    achtergrond: clampSection(parsed.achtergrond),
  }
}

export function isEmptyProfile(profile: SourceProfile): boolean {
  return !profile.schrijfstijl && !profile.kennis && !profile.ervaringen && !profile.achtergrond
}

export async function analyzeSourceProfile(
  ai: AiRuntimeConfig,
  input: { name: string; content: string },
): Promise<SourceProfile> {
  const source = trimInput(input.content)
  if (!source) {
    throw new Error('Document bevat geen tekst om te analyseren.')
  }

  const userContent = `Documentnaam: ${input.name}

Documentinhoud:
${source}

Lever het profiel als JSON volgens het gevraagde formaat.`

  const content = await completeChat(
    ai,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    { jsonMode: ai.provider !== 'anthropic', maxTokens: 4_000, timeoutMs: 120_000, useThinking: false },
  )

  return parseProfile(content)
}
