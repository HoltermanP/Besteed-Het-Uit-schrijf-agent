import {
  isKaderCategory,
  kaderSections,
  type KaderSectionKey,
  type StyleDocument,
} from '../types/styleDocument'
import type { SourceType } from '../types/tenderAnalysis'
import { loadStored, saveStored } from './storage'

/**
 * Het Schrijfkader bestaat per sectie (schrijfregels, schrijfwijze, kwaliteit) uit drie lagen:
 *
 *   1. Basis — ingebouwde uitwerking die altijd geldt (hieronder in {@link kaderBasis}).
 *   2. Vastgelegde regels — door de gebruiker geschreven of uit bronnen gedistilleerde regels
 *      (StyleDocument met mimeType text/plain in een kader-categorie).
 *   3. Handmatige aanpassingen — vrije tekst per sectie plus één algemeen veld, met de
 *      hoogste prioriteit. Hiermee stuur je de agent bij zonder regels te herschrijven.
 *
 * Dezelfde compilatie wordt op de Schrijfkader-pagina getoond ("zo schrijft de agent") én
 * letterlijk als bron aan de schrijf-, review- en herschrijfagent meegegeven, zodat wat je
 * ziet exact is wat de agent krijgt.
 */

export type SchrijfkaderAanpassingen = {
  /** Geldt boven alle secties — voor accenten die overal moeten doorwerken. */
  algemeen: string
  richtlijnen: string
  schrijfstijl: string
  kwaliteit: string
  updatedAt?: string
}

export type AanpassingKey = Exclude<keyof SchrijfkaderAanpassingen, 'updatedAt'>

const STORAGE_KEY = 'bid-agent-schrijfkader-aanpassingen'

export const emptyAanpassingen: SchrijfkaderAanpassingen = {
  algemeen: '',
  richtlijnen: '',
  schrijfstijl: '',
  kwaliteit: '',
}

export function getSchrijfkaderAanpassingen(): SchrijfkaderAanpassingen {
  const stored = loadStored<Partial<SchrijfkaderAanpassingen>>(STORAGE_KEY, {})
  return {
    algemeen: stored.algemeen ?? '',
    richtlijnen: stored.richtlijnen ?? '',
    schrijfstijl: stored.schrijfstijl ?? '',
    kwaliteit: stored.kwaliteit ?? '',
    updatedAt: stored.updatedAt,
  }
}

export function saveSchrijfkaderAanpassingen(value: SchrijfkaderAanpassingen): SchrijfkaderAanpassingen {
  const next: SchrijfkaderAanpassingen = {
    algemeen: value.algemeen ?? '',
    richtlijnen: value.richtlijnen ?? '',
    schrijfstijl: value.schrijfstijl ?? '',
    kwaliteit: value.kwaliteit ?? '',
    updatedAt: new Date().toISOString(),
  }
  saveStored(STORAGE_KEY, next)
  return next
}

export function hasAanpassingen(value: SchrijfkaderAanpassingen): boolean {
  return Boolean(
    value.algemeen.trim() || value.richtlijnen.trim() || value.schrijfstijl.trim() || value.kwaliteit.trim(),
  )
}

export type KaderBasis = {
  /** Eén zin die samenvat wat deze sectie voor de agent betekent. */
  lead: string
  /** Hoe de agent deze sectie moet wegen t.o.v. de rest van de prompt. */
  mandate: string
  points: string[]
}

/** Ingebouwde basisuitwerking per sectie — altijd actief, overschrijfbaar met eigen regels en aanpassingen. */
export const kaderBasis: Record<KaderSectionKey, KaderBasis> = {
  richtlijnen: {
    lead: 'Harde schrijfregels die in elke zin van elk inschrijfstuk gelden: terminologie, perspectief, verboden formuleringen en vormvoorschriften.',
    mandate: 'verplicht — geldt voor elke zin',
    points: [
      'Schrijf in correct, formeel Nederlands; neem de terminologie van de leidraad letterlijk over (dezelfde benaming van criteria, onderdelen, rollen en documenten).',
      'Noem de opdrachtgever zoals de leidraad dat doet (bijv. "de Gemeente", "Opdrachtgever") en de inschrijver consequent met één en dezelfde naam.',
      'Gebruik één perspectief: "wij" voor de inschrijver en "u" voor de opdrachtgever — tenzij de leidraad anonimiteit of een andere vorm voorschrijft.',
      'Geen superlatieven of claims zonder bewijs: "uniek", "toonaangevend", "marktleider", "state-of-the-art", "de beste" zijn verboden, tenzij direct onderbouwd met een feit, cijfer of referentie.',
      'Volg de structuur, nummering en kopjes die de leidraad voorschrijft; verzin geen eigen hoofdstukindeling.',
      'Respecteer harde vormeisen uit de leidraad: anonimiteit, taal, maximale lengte, verplichte bijlagen en opmaak.',
      'Begin elk antwoord met de kern; herhaal de vraag van de opdrachtgever niet als inleiding.',
      'Licht afkortingen toe bij eerste gebruik; schrijf getallen, eenheden en datums consequent.',
      'Verwijs nooit naar het schrijfproces, AI, prompts, interne review of dit schrijfkader.',
    ],
  },
  schrijfstijl: {
    lead: 'De toon en opbouw waarin de agent schrijft: zakelijk, actief, concreet en vanuit het belang van de opdrachtgever.',
    mandate: 'toon en opbouw — consequent toepassen tot de laatste zin',
    points: [
      'Toon: zakelijk, zelfverzekerd en feitelijk. Overtuig met inhoud en bewijs, niet met bijvoeglijke naamwoorden.',
      'Actieve zinnen met een duidelijke actor ("Wij plannen…", "Onze projectleider bewaakt…"); vermijd de lijdende vorm waar dat kan.',
      'Zinslengte gemiddeld 12–18 woorden en maximaal circa 25; één gedachte per zin.',
      'Alinea\'s van 4–7 zinnen met de kernzin vooraan. Opbouw per alinea: bewering → hoe wij dat doen → bewijs of effect voor de opdrachtgever.',
      'Schrijf vanuit het belang van de opdrachtgever: vertaal elke eigenschap of werkwijze naar het effect (zekerheid, grip, minder risico, continuïteit, lagere kosten).',
      'Concreet en toetsbaar: benoem wie, wat, wanneer, hoe vaak en met welk meetpunt. Vermijd vaagheden als "adequaat", "optimaal", "waar nodig", "in principe".',
      'Vermijd jargon en Engelse termen zonder uitleg; kies het gewone Nederlandse woord als dat bestaat.',
      'Gebruik opsommingen en tabellen voor stappen, rollen, planning en KPI\'s — als aanvulling op lopende tekst, nooit als vervanging van de uitwerking.',
      'Koppen zijn informatief (ze zeggen wat de sectie oplevert) en volgen de nummering van de leidraad.',
    ],
  },
  kwaliteit: {
    lead: 'De kwaliteitsnormen waaraan elke sectie wordt getoetst vóór oplevering: onderbouwing, volledigheid, consistentie en toetsbaarheid.',
    mandate: 'kwaliteitsnormen — toets elke sectie hieraan vóór oplevering',
    points: [
      'Elke claim is onderbouwd met een feit, cijfer, referentie, werkwijze of instrument uit de bedrijfsbronnen. Geen onderbouwing beschikbaar? Dan weglaten of voorzichtig formuleren — nooit verzinnen.',
      'Elk beoordelingscriterium en subcriterium wordt expliciet en herkenbaar geadresseerd; de beoordelaar moet per criterium kunnen aanwijzen waar het antwoord staat.',
      'Beantwoord de letterlijke vraag én de onderliggende behoefte van de opdrachtgever (de vraag achter de vraag).',
      'Toezeggingen zijn SMART: specifiek, meetbaar, met eigenaar en tijdstip. "Wij streven naar kwaliteit" telt niet; "De projectleider rapporteert elke twee weken over KPI X" wel.',
      'Risico\'s altijd met eigenaar, beheersmaatregel en terugvaloptie.',
      'Geen tegenstrijdigheden tussen secties in planning, rollen, aantallen, namen en toezeggingen.',
      'Gebruik het volumebudget: binnen de limiet van de leidraad blijven, maar het budget vrijwel volledig benutten; geen opvulling of herhaling.',
      'Eindcontrole vóór oplevering: structuur gelijk aan de leidraad, alle verplichte onderdelen aanwezig, verboden formuleringen verwijderd, stijl van de eerste tot de laatste sectie gelijk.',
    ],
  },
}

export const kaderSectionType: Record<KaderSectionKey, SourceType> = {
  richtlijnen: 'rules',
  schrijfstijl: 'training',
  kwaliteit: 'rules',
}

/** Brondocument zoals de schrijf-, review- en herschrijfagent het ontvangt. */
export type KaderSourceDocument = {
  id: string
  name: string
  type: SourceType
  content: string
  importedAt: string
}

export type KaderRule = Pick<StyleDocument, 'id' | 'name' | 'content' | 'updatedAt'>
export type KaderSource = Pick<StyleDocument, 'id' | 'name' | 'fileName' | 'content' | 'updatedAt'>

export type KaderSectionCompilation = {
  key: KaderSectionKey
  title: string
  type: SourceType
  basis: KaderBasis
  aanpassing: string
  /** Geschreven of gedistilleerde regels (volledige tekst gaat mee naar de agent). */
  rules: KaderRule[]
  /** Geüploade bronnen die (nog) niet tot regels zijn gedistilleerd; gaan als ruwe tekst mee. */
  sources: KaderSource[]
  /** Letterlijke tekst die als bron naar de agent gaat. */
  promptText: string
}

export function isWrittenRule(doc: Pick<StyleDocument, 'mimeType'>): boolean {
  return doc.mimeType === 'text/plain'
}

function sectionTitle(key: KaderSectionKey): string {
  return kaderSections.find((section) => section.key === key)?.title ?? key
}

function bulletize(text: string): string {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return lines.map((line) => (/^[-•*]\s/.test(line) ? `- ${line.replace(/^[-•*]\s+/, '')}` : `- ${line}`)).join('\n')
}

function latestTimestamp(values: Array<string | undefined>): string {
  const stamps = values.filter((value): value is string => Boolean(value)).sort()
  return stamps[stamps.length - 1] ?? ''
}

export function buildSectionPromptText(input: {
  key: KaderSectionKey
  aanpassing: string
  rules: KaderRule[]
}): string {
  const basis = kaderBasis[input.key]
  const title = sectionTitle(input.key).toUpperCase()
  const aanpassing = input.aanpassing.trim()

  const rulesBlock = input.rules.length
    ? input.rules.map((rule) => `## ${rule.name}\n${rule.content.trim()}`).join('\n\n')
    : '- geen aanvullende regels vastgelegd (de basisregels gelden)'

  return [
    `[SCHRIJFKADER · ${title} — ${basis.mandate}]`,
    basis.lead,
    'Prioriteit bij strijdigheid: handmatige aanpassingen > vastgelegde regels > basisregels. Alleen een expliciete eis uit de leidraad gaat hierboven.',
    '',
    'HANDMATIGE AANPASSINGEN (hoogste prioriteit in deze sectie):',
    aanpassing ? bulletize(aanpassing) : '- geen',
    '',
    'VASTGELEGDE REGELS:',
    rulesBlock,
    '',
    'BASISREGELS (ingebouwd):',
    basis.points.map((point) => `- ${point}`).join('\n'),
  ].join('\n')
}

export function buildAlgemeenPromptText(algemeen: string): string {
  return [
    '[SCHRIJFKADER · ALGEMENE AANPASSINGEN — hoogste prioriteit; gaat boven alle andere schrijfregels, schrijfwijze en kwaliteitseisen]',
    'Door de inschrijver handmatig opgegeven accenten. Pas ze in elke sectie en elke zin toe; alleen een expliciete eis uit de leidraad gaat hierboven.',
    '',
    bulletize(algemeen),
  ].join('\n')
}

export function compileKaderSection(
  key: KaderSectionKey,
  documents: StyleDocument[],
  aanpassingen: SchrijfkaderAanpassingen,
): KaderSectionCompilation {
  const inSection = documents.filter((doc) => doc.category === key)
  const rules = inSection.filter(isWrittenRule)
  const sources = inSection.filter((doc) => !isWrittenRule(doc))
  const aanpassing = aanpassingen[key] ?? ''

  return {
    key,
    title: sectionTitle(key),
    type: kaderSectionType[key],
    basis: kaderBasis[key],
    aanpassing,
    rules,
    sources,
    promptText: buildSectionPromptText({ key, aanpassing, rules }),
  }
}

/**
 * Zet het volledige schrijfkader om in brondocumenten voor de agent: één document per
 * sectie (basis + regels + aanpassingen), één voor algemene aanpassingen en één per
 * ruwe, nog niet gedistilleerde bron.
 */
export function schrijfkaderToSourceDocuments(
  documents: StyleDocument[],
  aanpassingen: SchrijfkaderAanpassingen = emptyAanpassingen,
): KaderSourceDocument[] {
  const kaderDocs = documents.filter((doc) => isKaderCategory(doc.category))
  const result: KaderSourceDocument[] = []

  const algemeen = aanpassingen.algemeen.trim()
  if (algemeen) {
    result.push({
      id: 'schrijfkader-algemeen',
      name: 'Schrijfkader — Algemene aanpassingen',
      type: 'rules',
      content: buildAlgemeenPromptText(algemeen),
      importedAt: aanpassingen.updatedAt ?? '',
    })
  }

  for (const section of kaderSections) {
    const compiled = compileKaderSection(section.key, kaderDocs, aanpassingen)
    result.push({
      id: `schrijfkader-${section.key}`,
      name: `Schrijfkader — ${compiled.title}`,
      type: compiled.type,
      content: compiled.promptText,
      importedAt: latestTimestamp([aanpassingen.updatedAt, ...compiled.rules.map((rule) => rule.updatedAt)]),
    })

    for (const source of compiled.sources) {
      result.push({
        id: `style-doc-${source.id}`,
        name: `${source.name} (bron · ${compiled.title})`,
        type: compiled.type,
        content: `[SCHRIJFKADER · BRON bij ${compiled.title.toUpperCase()} | ${source.fileName}]\nRuwe brontekst, nog niet tot regels gedistilleerd. Leid hieruit dezelfde soort regels af als in de sectie ${compiled.title} en pas ze toe.\n\n${source.content}`,
        importedAt: source.updatedAt,
      })
    }
  }

  return result
}
