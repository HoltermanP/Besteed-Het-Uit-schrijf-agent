import { evidenceHandle, isCitable } from './evidence'
import type { EvidenceBlock } from '../types/evidenceBlock'
import type { ClaimCheckItem, ClaimStatus } from '../types/reviewDraft'

/*
 * Bewijscheck: welke harde claims staan er in het concept, en zijn ze terug te voeren op
 * een bouwsteen of een bron?
 *
 * Dit is de deterministische basis — hij draait ook zonder AI en levert altijd iets op.
 * De AI-reviewer vult hem aan met claims die geen cijfer of superlatief bevatten maar
 * inhoudelijk wél een belofte doen. De uitkomsten worden samengevoegd (mergeClaimChecks):
 * de reviewer mag een gevonden claim herbeoordelen, maar niet laten verdwijnen.
 */

export type ClaimCheck = ClaimCheckItem & { id: string }

/** Meer dan dit tonen maakt het paneel onleesbaar en de review stomp. */
const MAX_CLAIMS = 25
const MIN_SENTENCE_CHARS = 25
const MAX_FRAGMENT_CHARS = 220

/** Markering die een geciteerde bouwsteen door het platte-tekstproces heen sleept. */
const CITATION_OPEN = '⟦'
const CITATION_CLOSE = '⟧'

/** Getallen die zonder bron een feitelijke bewering zijn (bedragen, percentages, aantallen). */
const MEASURE_PATTERN =
  /(?:€\s?\d|\d+(?:[.,]\d+)?\s*(?:%|procent|promille|fte|uur|uren|jaar|jaren|maand(?:en)?|we(?:ek|ken)|dag(?:en)?|klanten|opdrachten|projecten|aanbestedingen|inschrijvingen|referenties|medewerkers|specialisten|locaties|gemeenten|euro|mln|miljoen|miljard|k€|ton|kg|km))/i

/** Normen en certificaten: verifieerbare claims die in de bronnen moeten staan. */
const STANDARD_PATTERN = /\b(?:ISO|NEN|EN|VCA|BRL|BREEAM|CO2|CSRD|ISAE|SOC)[\s-]?\d[\w.:-]*/gi

/** Absolute uitspraken zonder cijfer; zonder bron zijn dit lege superlatieven. */
const SUPERLATIVES = [
  'marktleider',
  'de beste',
  'de grootste',
  'de snelste',
  'toonaangevend',
  'uniek in',
  'als enige',
  'altijd',
  'nooit',
  'gegarandeerd',
  'garanderen wij',
  'bewezen',
  'aantoonbaar',
  'jarenlange ervaring',
  'ruime ervaring',
  'zeer ervaren',
  'volledig ontzorgd',
  '100%',
]

let counter = 0
function nextId(): string {
  counter += 1
  return `claim-${counter}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Concept-HTML naar zinnen, met de geciteerde bouwstenen erin bewaard. Blokgrenzen
 * tellen als zinseinde, zodat lijstitems en tabelcellen losse claims worden.
 */
function toSentences(html: string): string[] {
  const withCitations = html.replace(
    /<span\b[^>]*\bdata-bewijs="([^"]*)"[^>]*>([\s\S]*?)<\/span>/gi,
    (_match, handle: string, inner: string) => `${inner} ${CITATION_OPEN}${handle}${CITATION_CLOSE}`,
  )
  const plain = withCitations
    .replace(/<\/(p|li|h1|h2|h3|h4|td|th|figcaption|caption|dt|dd)>/gi, ' ¶ ')
    .replace(/<br\s*\/?>/gi, ' ¶ ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

  const chunks = plain
    .split(/(?<=[.!?])\s+|\s*¶\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  // Een citaat dat de hele zin omvat komt ná de punt te staan en zou dan als losse
  // "zin" eindigen; plak zo'n restje terug aan de zin waar het bij hoort.
  const sentences: string[] = []
  for (const chunk of chunks) {
    const onlyCitation = new RegExp(`^(?:${CITATION_OPEN}[^${CITATION_CLOSE}]*${CITATION_CLOSE}\\s*)+$`).test(chunk)
    if (onlyCitation && sentences.length) sentences[sentences.length - 1] += ` ${chunk}`
    else sentences.push(chunk)
  }
  return sentences
}

/** De verwijzingen die in deze zin zijn geciteerd, en de zin zonder die markeringen. */
function splitCitations(sentence: string): { text: string; handles: string[] } {
  const handles: string[] = []
  const text = sentence
    .replace(new RegExp(`${CITATION_OPEN}([^${CITATION_CLOSE}]*)${CITATION_CLOSE}`, 'g'), (_match, raw: string) => {
      raw
        .split(/[\s,]+/)
        .map((handle) => handle.trim().toUpperCase())
        .filter(Boolean)
        .forEach((handle) => handles.push(handle))
      return ''
    })
    .replace(/\s+/g, ' ')
    .trim()
  return { text, handles }
}

/** De toetsbare kern van een claim: bedragen, aantallen, percentages en normen. */
function measurableTokens(sentence: string): string[] {
  const tokens = new Set<string>()
  for (const match of sentence.matchAll(/\d+(?:[.,]\d+)?/g)) tokens.add(match[0].replace(',', '.'))
  for (const match of sentence.matchAll(STANDARD_PATTERN)) tokens.add(match[0].replace(/\s|-/g, '').toUpperCase())
  return [...tokens]
}

function superlativesIn(sentence: string): string[] {
  const lower = sentence.toLowerCase()
  return SUPERLATIVES.filter((word) => lower.includes(word))
}

/**
 * Bevat deze zin een feitelijke claim? Een zin zonder cijfer, norm of absolute uitspraak
 * is een intentie of een werkwijze; die hoeft geen bewijs.
 */
function isFactualClaim(sentence: string): boolean {
  if (sentence.length < MIN_SENTENCE_CHARS) return false
  if (MEASURE_PATTERN.test(sentence)) return true
  STANDARD_PATTERN.lastIndex = 0
  if (STANDARD_PATTERN.test(sentence)) return true
  return superlativesIn(sentence).length > 0
}

function shorten(text: string): string {
  return text.length > MAX_FRAGMENT_CHARS ? `${text.slice(0, MAX_FRAGMENT_CHARS - 1)}…` : text
}

/** Alles waar een claim tegen getoetst mag worden: bronteksten en bouwstenen. */
type Haystack = { label: string; text: string }

function normalizeHaystack(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ')
}

export type ClaimCheckSources = {
  /** Bronnen van het project en het bedrijfsprofiel (naam + inhoud). */
  documents: Array<{ name: string; content: string }>
  /** De bouwstenen uit de bewijsbibliotheek die bij dit stuk zijn meegegeven. */
  evidence: EvidenceBlock[]
}

/**
 * Toets de harde claims in een concept tegen de bouwstenen en de bronnen.
 * Levert per claim of hij herleidbaar is, en zo niet: wat er ontbreekt.
 */
export function checkClaims(html: string, sources: ClaimCheckSources): ClaimCheck[] {
  const citable = sources.evidence.filter((block) => isCitable(block))
  const byHandle = new Map(citable.map((block) => [evidenceHandle(block.id), block]))

  const haystacks: Haystack[] = [
    ...citable.map((block) => ({
      label: `bouwsteen ${evidenceHandle(block.id)}`,
      text: normalizeHaystack(`${block.title} ${block.situation} ${block.claim} ${block.result} ${block.value ?? ''} ${block.proof}`),
    })),
    ...sources.documents.map((doc) => ({ label: doc.name, text: normalizeHaystack(doc.content) })),
  ]

  const checks: ClaimCheck[] = []
  const seen = new Set<string>()

  for (const sentence of toSentences(html)) {
    if (checks.length >= MAX_CLAIMS) break
    const { text, handles } = splitCitations(sentence)
    if (!isFactualClaim(text)) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const fragment = shorten(text)

    // 1. De schrijfagent heeft een bouwsteen geciteerd — controleer of die bestaat.
    if (handles.length) {
      const known = handles.filter((handle) => byHandle.has(handle))
      if (known.length) {
        checks.push({
          id: nextId(),
          fragment,
          status: 'onderbouwd',
          evidence: known.join(', '),
          note: `Geciteerd uit ${known.map((handle) => byHandle.get(handle)!.title).join(', ')}.`,
        })
      } else {
        checks.push({
          id: nextId(),
          fragment,
          status: 'onbewezen',
          note: `Verwijst naar bouwsteen ${handles.join(', ')}, maar die staat niet (meer) citeerbaar in de bewijsbibliotheek.`,
        })
      }
      continue
    }

    // 2. Geen citaat: staan de getallen en normen uit de claim ergens in de bronnen?
    const tokens = measurableTokens(text)
    if (tokens.length) {
      const match = haystacks.find((stack) => tokens.every((token) => stack.text.includes(token.toLowerCase())))
      checks.push(
        match
          ? {
              id: nextId(),
              fragment,
              status: 'onderbouwd',
              evidence: match.label,
              note: `Alle cijfers uit deze claim komen terug in ${match.label}.`,
            }
          : {
              id: nextId(),
              fragment,
              status: 'onbewezen',
              note: `De cijfers ${tokens.join(', ')} staan in geen enkele bron of bouwsteen. Onderbouw met een bouwsteen of schrap het getal.`,
            },
      )
      continue
    }

    // 3. Absolute uitspraak zonder cijfer: alleen houdbaar als een bron hem letterlijk draagt.
    const words = superlativesIn(text)
    const match = haystacks.find((stack) => words.some((word) => stack.text.includes(word)))
    checks.push(
      match
        ? {
            id: nextId(),
            fragment,
            status: 'onderbouwd',
            evidence: match.label,
            note: `Deze uitspraak komt terug in ${match.label}.`,
          }
        : {
            id: nextId(),
            fragment,
            status: 'onbewezen',
            note: `Absolute uitspraak (${words.join(', ')}) zonder onderbouwing. Koppel er een referentie, case of cijfer aan of formuleer het zonder claim.`,
          },
    )
  }

  return checks
}

function fragmentKey(fragment: string): string {
  return fragment.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 120)
}

/**
 * Voeg het oordeel van de AI-reviewer samen met de deterministische bewijscheck. De
 * reviewer wint bij dezelfde claim (hij ziet meer context), maar claims die alleen de
 * heuristiek vond blijven staan — anders verdwijnt een onbewezen cijfer uit beeld.
 */
export function mergeClaimChecks(baseline: ClaimCheck[], aiChecks: ClaimCheckItem[]): ClaimCheck[] {
  const merged = new Map<string, ClaimCheck>()
  baseline.forEach((check) => merged.set(fragmentKey(check.fragment), check))

  for (const item of aiChecks) {
    const fragment = shorten(item.fragment.trim())
    if (!fragment) continue
    const key = fragmentKey(fragment)
    const existing = merged.get(key)
    merged.set(key, {
      id: existing?.id ?? nextId(),
      fragment,
      status: item.status,
      evidence: item.evidence || existing?.evidence,
      note: item.note || existing?.note || '',
    })
  }

  const all = [...merged.values()]
  const rank: Record<ClaimStatus, number> = { onbewezen: 0, onderbouwd: 1 }
  return all.sort((a, b) => rank[a.status] - rank[b.status]).slice(0, MAX_CLAIMS)
}

export function unprovenClaims(checks: ClaimCheck[]): ClaimCheck[] {
  return checks.filter((check) => check.status === 'onbewezen')
}
