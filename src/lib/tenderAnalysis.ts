import type { SourceDocument } from '../types/tenderAnalysis'
import type {
  ContentRequirement,
  DocumentRequirement,
  StyleProfile,
  SubmissionRequirement,
  TenderAnalysis,
  UnderlyingIntent,
  WordLimit,
} from '../types/tenderAnalysis'

const LEIDRAAD_HINTS = ['leidraad', 'inschrijfleidraad', 'aanbestedingsleidraad', 'beoordelingsleidraad']
const TOPIC_KEYWORDS = [
  'plan van aanpak',
  'team',
  'competent',
  'referentie',
  'duurzaamheid',
  'implementatie',
  'risico',
  'continuiteit',
  'kwaliteit',
  'prijs',
  'emvi',
  'social return',
  'innovatie',
  'borging',
  'planning',
  'sla',
  'privacy',
  'avg',
  'veiligheid',
]

const DOCUMENT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /referentie(?:lijst|overzicht)?/i, label: 'Referentielijst' },
  { pattern: /teamoverzicht|cv'?s?|curriculum vitae/i, label: 'Teamoverzicht met CV\'s' },
  { pattern: /invullingsblad|gunningsblad|emvi/i, label: 'Invullingsblad / EMVI' },
  { pattern: /plan van aanpak/i, label: 'Plan van aanpak' },
  { pattern: /prijs(?:blad|formulier)|begroting/i, label: 'Prijsblad / begroting' },
  { pattern: /eigen verklaring|uav/i, label: 'Eigen verklaring (UAV)' },
  { pattern: /nota van inlichtingen/i, label: 'Nota van Inlichtingen (referentie)' },
  { pattern: /verklaring\s+.*?integriteit/i, label: 'Integriteitsverklaring' },
]

function normalize(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function findLeidraadDoc(documents: SourceDocument[]) {
  return documents.find(
    (doc) =>
      doc.type === 'tender' &&
      (LEIDRAAD_HINTS.some((hint) => doc.name.toLowerCase().includes(hint)) ||
        LEIDRAAD_HINTS.some((hint) => doc.content.toLowerCase().includes(hint))),
  )
}

function parseNumber(value: string) {
  return Number.parseInt(value.replace(/\./g, ''), 10)
}

function extractWordLimits(text: string, source: string): WordLimit[] {
  const limits: WordLimit[] = []
  const seen = new Set<string>()

  const add = (limit: WordLimit) => {
    const key = `${limit.label}-${limit.min ?? ''}-${limit.max ?? ''}-${limit.unit}`
    if (seen.has(key)) return
    seen.add(key)
    limits.push(limit)
  }

  const rangeRegex = /(\d[\d.]*)\s*[-–]\s*(\d[\d.]*)\s+woorden/gi
  for (const match of text.matchAll(rangeRegex)) {
    add({
      label: 'Woordenaantal (bereik)',
      min: parseNumber(match[1]),
      max: parseNumber(match[2]),
      unit: 'woorden',
      source,
    })
  }

  const maxWordsRegex = /maximaal\s+(\d[\d.]*)\s+woorden(?:\s+voor\s+(?:het\s+|de\s+)?([^.;,\n]+))?/gi
  for (const match of text.matchAll(maxWordsRegex)) {
    add({
      label: 'Maximum woorden',
      section: match[2]?.trim(),
      max: parseNumber(match[1]),
      unit: 'woorden',
      source,
    })
  }

  const minWordsRegex = /minimaal\s+(\d[\d.]*)\s+woorden(?:\s+voor\s+(?:het\s+|de\s+)?([^.;,\n]+))?/gi
  for (const match of text.matchAll(minWordsRegex)) {
    add({
      label: 'Minimum woorden',
      section: match[2]?.trim(),
      min: parseNumber(match[1]),
      unit: 'woorden',
      source,
    })
  }

  const totWordsRegex = /tot\s+(\d[\d.]*)\s+woorden(?:\s+voor\s+(?:het\s+|de\s+)?([^.;,\n]+))?/gi
  for (const match of text.matchAll(totWordsRegex)) {
    add({
      label: 'Tot maximaal woorden',
      section: match[2]?.trim(),
      max: parseNumber(match[1]),
      unit: 'woorden',
      source,
    })
  }

  const pagesRegex = /maximaal\s+(\d+)\s+pagina(?:'?s)?(?:\s+voor\s+(?:het\s+|de\s+)?([^.;,\n]+))?/gi
  for (const match of text.matchAll(pagesRegex)) {
    add({
      label: 'Maximum pagina\'s',
      section: match[2]?.trim(),
      max: parseNumber(match[1]),
      unit: 'paginas',
      source,
    })
  }

  const maxCharsRegex =
    /maximaal\s+(\d[\d.]*)\s+(?:karakters?|tekens?)(?:\s+voor\s+(?:het\s+|de\s+)?([^.;,\n]+))?/gi
  for (const match of text.matchAll(maxCharsRegex)) {
    add({
      label: 'Maximum karakters',
      section: match[2]?.trim(),
      max: parseNumber(match[1]),
      unit: 'karakters',
      source,
    })
  }

  const maxCharsShortRegex =
    /max\.?\s+(\d[\d.]*)\s+(?:karakters?|tekens?)(?:\s+voor\s+(?:het\s+|de\s+)?([^.;,\n]+))?/gi
  for (const match of text.matchAll(maxCharsShortRegex)) {
    add({
      label: 'Maximum karakters',
      section: match[2]?.trim(),
      max: parseNumber(match[1]),
      unit: 'karakters',
      source,
    })
  }

  const totCharsRegex = /tot\s+(\d[\d.]*)\s+(?:karakters?|tekens?)(?:\s+voor\s+(?:het\s+|de\s+)?([^.;,\n]+))?/gi
  for (const match of text.matchAll(totCharsRegex)) {
    add({
      label: 'Tot maximaal karakters',
      section: match[2]?.trim(),
      max: parseNumber(match[1]),
      unit: 'karakters',
      source,
    })
  }

  const charsMaxRegex =
    /(\d[\d.]*)\s+(?:karakters?|tekens?)\s+maximaal(?:\s+voor\s+(?:het\s+|de\s+)?([^.;,\n]+))?/gi
  for (const match of text.matchAll(charsMaxRegex)) {
    add({
      label: 'Maximum karakters',
      section: match[2]?.trim(),
      max: parseNumber(match[1]),
      unit: 'karakters',
      source,
    })
  }

  const nietMeerWoordenRegex =
    /niet meer dan\s+(\d[\d.]*)\s+woorden(?:\s+voor\s+(?:het\s+|de\s+)?([^.;,\n]+))?/gi
  for (const match of text.matchAll(nietMeerWoordenRegex)) {
    add({
      label: 'Maximum woorden',
      section: match[2]?.trim(),
      max: parseNumber(match[1]),
      unit: 'woorden',
      source,
    })
  }

  return limits
}

function extractEvaluationCriteria(text: string): string[] {
  const criteria: string[] = []
  const percentRegex = /([A-Za-zÀ-ÿ\s/-]{3,40})\s+(\d{1,3})\s*%/g
  for (const match of text.matchAll(percentRegex)) {
    const label = normalize(match[1])
    if (label.length > 3 && !criteria.some((item) => item.startsWith(label))) {
      criteria.push(`${label} (${match[2]}%)`)
    }
  }

  const subRegex = /subcriteri(?:a|um)[^:]*:([^.\n]+)/gi
  for (const match of text.matchAll(subRegex)) {
    match[1]
      .split(/[,;]/)
      .map((part) => normalize(part))
      .filter((part) => part.length > 2)
      .forEach((part) => {
        if (!criteria.includes(part)) criteria.push(part)
      })
  }

  return criteria.slice(0, 8)
}

function extractContentRequirements(text: string, source: string): ContentRequirement[] {
  const requirements: ContentRequirement[] = []
  const seen = new Set<string>()

  TOPIC_KEYWORDS.forEach((topic) => {
    if (!text.toLowerCase().includes(topic)) return
    const regex = new RegExp(`([^.\\n]{0,90}${topic}[^.\\n]{0,90})`, 'i')
    const match = text.match(regex)
    const detail = match ? normalize(match[1]) : `Onderwerp "${topic}" genoemd in ${source}`
    if (seen.has(topic)) return
    seen.add(topic)
    requirements.push({
      topic,
      detail,
      mandatory: /verplicht|dient|moet|minimaal|maximaal/i.test(match?.[1] ?? text),
      source,
    })
  })

  const mustRegex = /(?:dient|moet|verplicht)[^.]{0,120}\./gi
  for (const match of text.matchAll(mustRegex)) {
    const sentence = normalize(match[0])
    const topic =
      TOPIC_KEYWORDS.find((keyword) => sentence.toLowerCase().includes(keyword)) ??
      sentence.slice(0, 48).toLowerCase()
    if (seen.has(topic) || sentence.length < 20) continue
    seen.add(topic)
    requirements.push({ topic, detail: sentence, mandatory: true, source })
  }

  return requirements.slice(0, 12)
}

function extractDocumentRequirements(text: string, source: string): DocumentRequirement[] {
  const requirements: DocumentRequirement[] = []
  const seen = new Set<string>()

  DOCUMENT_PATTERNS.forEach(({ pattern, label }) => {
    if (!pattern.test(text)) return
    if (seen.has(label)) return
    seen.add(label)
    requirements.push({
      name: label,
      mandatory: /verplicht|dient te worden ingediend|moet worden ingediend|bijlage/i.test(text),
      source,
    })
  })

  const bijlageRegex = /bijlage\s+[A-Z0-9][^:.\n]{0,60}/gi
  for (const match of text.matchAll(bijlageRegex)) {
    const name = normalize(match[0])
    if (seen.has(name)) continue
    seen.add(name)
    requirements.push({ name, mandatory: true, source })
  }

  return requirements
}

const SUBMISSION_PATTERNS: Array<{
  pattern: RegExp
  category: SubmissionRequirement['category']
  label: string
}> = [
  { pattern: /anoniem|geanonimiseerd|zonder (?:bedrijfs)?naam|herleidbaar/i, category: 'vorm', label: 'Inschrijving (mogelijk) anoniem/geanonimiseerd indienen' },
  { pattern: /pdf(?:[-\s]?formaat|[-\s]?bestand)?|in pdf/i, category: 'vorm', label: 'Aanleveren in PDF-formaat' },
  { pattern: /lettertype|arial|calibri|verdana|times new roman|font(?:grootte)?|pt(?:\s|$)|puntsgrootte/i, category: 'opmaak', label: 'Opmaak-eis (lettertype/lettergrootte)' },
  { pattern: /marge|regelafstand|kantlijn|a4/i, category: 'opmaak', label: 'Opmaak-eis (marges/regelafstand/A4)' },
  { pattern: /ondertekend|ondertekening|rechtsgeldig|bevoegd(?:e)? (?:persoon|vertegenwoordiger)/i, category: 'indiening', label: 'Rechtsgeldige ondertekening vereist' },
  { pattern: /tenderned|via (?:het )?(?:digitale )?(?:aanbestedings)?platform|uploaden via/i, category: 'indiening', label: 'Indienen via voorgeschreven platform (bv. TenderNed)' },
  { pattern: /uiterlijk|sluitingsdatum|sluitingstijd|deadline|voor \d{1,2}[:.]\d{2}/i, category: 'indiening', label: 'Harde sluitingsdatum/-tijd voor indiening' },
  { pattern: /geschiktheidseis|kerncompetentie|omzeteis|referentie-eis|beroepsbevoegdheid/i, category: 'geschiktheid', label: 'Geschiktheidseis (referenties/omzet/bevoegdheid)' },
  { pattern: /uitsluitingsgrond|uitsluiting|gedragsverklaring|verklaring omtrent gedrag|integriteit/i, category: 'uitsluiting', label: 'Uitsluitingsgrond / integriteitsverklaring' },
  { pattern: /uniform europees aanbestedingsdocument|\buea\b|eigen verklaring/i, category: 'geschiktheid', label: 'UEA / eigen verklaring vereist' },
  { pattern: /nota van inlichtingen|vragenronde|inlichtingen(?:ronde)?/i, category: 'proces', label: 'Vragen/Nota van Inlichtingen-procedure volgen' },
  { pattern: /in het nederlands|nederlandstalig|taal van de inschrijving/i, category: 'vorm', label: 'Inschrijving in het Nederlands opstellen' },
]

function extractSubmissionRequirements(text: string, source: string): SubmissionRequirement[] {
  const requirements: SubmissionRequirement[] = []
  const seen = new Set<string>()
  const mandatorySignal = /verplicht|dient|moet|uiterlijk|op straffe|uitsluiting|wordt terzijde/i

  SUBMISSION_PATTERNS.forEach(({ pattern, category, label }) => {
    const match = text.match(pattern)
    if (!match) return
    if (seen.has(label)) return
    seen.add(label)
    const sentence = text.match(new RegExp(`[^.\\n]{0,120}${pattern.source}[^.\\n]{0,120}`, 'i'))?.[0]
    requirements.push({
      category,
      requirement: sentence ? normalize(sentence) : label,
      mandatory: mandatorySignal.test(sentence ?? text),
      source,
    })
  })

  return requirements
}

function extractStyleSignals(text: string, kind: 'company' | 'buyer'): string[] {
  const signals: string[] = []
  const lower = text.toLowerCase()

  if (kind === 'buyer') {
    if (/formeel|toetsbaar|objectief/i.test(text)) signals.push('Formeel en toetsbaar formuleren')
    if (/vermijd.*?promot/i.test(text)) signals.push('Geen promotionele taal')
    if (/opdrachtgever|beoordelaar/i.test(text)) signals.push('Schrijf vanuit beoordelingsperspectief')
    if (/concreet|aantoonbaar|onderbouwd/i.test(text)) signals.push('Concreet en onderbouwd')
    if (/plan van aanpak|subcriter/i.test(text)) signals.push('Struktuur volgens beoordelingscriteria')
  } else {
    if (/wij|ons team|onze aanpak/i.test(text)) signals.push('Actieve bedrijfsstem (wij/ons)')
    if (/bewezen|ervaring|referentie/i.test(text)) signals.push('Bewijs via ervaring en referenties')
    if (/pragmatisch|praktisch/i.test(text)) signals.push('Pragmatische, uitvoerbare toon')
    if (/kwaliteit|borging|review/i.test(text)) signals.push('Kwaliteits- en reviewgericht')
    if (/duurzaam|innovati/i.test(text)) signals.push('Duurzaamheid/innovatie benadrukken')
  }

  if (signals.length === 0) {
    signals.push(
      kind === 'buyer'
        ? 'Sluit aan op taal en eisen uit aanbestedingsstukken'
        : 'Gebruik de tone-of-voice uit bedrijfsdocumenten',
    )
  }

  if (lower.includes('actieve zinnen')) signals.push('Actieve zinnen prefereren')
  return [...new Set(signals)].slice(0, 5)
}

function buildStyleProfile(
  companyDocs: SourceDocument[],
  tenderDocs: SourceDocument[],
  leidraad: SourceDocument | undefined,
  buyerName: string,
): StyleProfile {
  const companyText = companyDocs.map((doc) => doc.content).join(' ')
  const buyerText = [leidraad, ...tenderDocs].filter(Boolean).map((doc) => doc!.content).join(' ')
  const companyName =
    companyDocs[0]?.name.replace(/bedrijfsprofiel|profiel/i, '').trim() || 'Inschrijver'
  const companySignals = extractStyleSignals(companyText, 'company')
  const buyerSignals = extractStyleSignals(buyerText, 'buyer')

  const blendedGuidance = [
    `Combineer de stem van ${companyName || 'het inschrijvende bedrijf'} (${companySignals.slice(0, 2).join(', ')})`,
    `met de verwachtingen van ${buyerName} (${buyerSignals.slice(0, 2).join(', ')}).`,
    'Elke paragraaf moet zowel herkenbaar zijn als inschrijver als aansluiten op opdrachtgeverstaal uit de leidraad.',
  ].join(' ')

  return {
    companyName: companyName || 'Inschrijver',
    buyerName,
    companySignals,
    buyerSignals,
    blendedGuidance,
  }
}

function detectGaps(
  analysis: Omit<TenderAnalysis, 'gaps' | 'analyzedAt' | 'summary' | 'targetWordCount'>,
  documents: SourceDocument[],
): string[] {
  const gaps: string[] = []

  if (!analysis.leidraadFound) {
    gaps.push('Geen leidraad gevonden — upload of label het aanbestedingsdocument als leidraad.')
  }

  if (!documents.some((doc) => doc.type === 'company')) {
    gaps.push('Geen bedrijfsinformatie — schrijfstijl van inschrijver kan niet worden bepaald.')
  }

  if (analysis.documentRequirements.length === 0) {
    gaps.push('Geen verplichte documenten gedetecteerd — controleer leidraad handmatig.')
  }

  if (analysis.contentRequirements.length < 3) {
    gaps.push('Weinig inhoudelijke eisen gevonden — leidraad mogelijk incompleet of niet leesbaar.')
  }

  const docNames = documents.map((doc) => doc.name.toLowerCase()).join(' ')
  analysis.documentRequirements
    .filter((req) => req.mandatory)
    .forEach((req) => {
      const hint = req.name.toLowerCase().slice(0, 12)
      if (!docNames.includes(hint.split(' ')[0]) && !docNames.includes(hint)) {
        gaps.push(`Verplicht document "${req.name}" nog niet als bron aanwezig.`)
      }
    })

  return gaps
}

type IntentTheme = {
  patterns: RegExp[]
  label: string
  underlying: string
  success: string
}

const INTENT_THEMES: IntentTheme[] = [
  {
    patterns: [/continuiteit/i, /ononderbroken/i, /doorlooptijd/i],
    label: 'Continuïteit',
    underlying: 'Geen verstoring van dienstverlening, processen of kennis bij overgang',
    success: 'Aantoonbare overdraagbaarheid, vaste teams en back-up zonder overname-risico',
  },
  {
    patterns: [/implementatie|inwerking|ingang|startfase/i],
    label: 'Implementatie',
    underlying: 'Snelle, beheersbare start zonder verrassingen in planning of scope',
    success: 'Concrete planning, heldere fasering en meetbare mijlpalen vanaf dag één',
  },
  {
    patterns: [/risico|beheers/i],
    label: 'Risicobeheersing',
    underlying: 'Voorspelbare uitvoering met zicht op keuzes en escalaties',
    success: 'Risico-eigenaren, preventieve maatregelen en herstelroutes per scenario',
  },
  {
    patterns: [/kwaliteit|borging|review|toetsbaar/i],
    label: 'Kwaliteit',
    underlying: 'Objectief bewijs dat beloften worden waargemaakt, niet alleen beloofd',
    success: 'Toetsbare werkwijze, KPI\'s en kwaliteitscontroles die de beoordelaar kan volgen',
  },
  {
    patterns: [/team|competent|capaciteit|cv/i],
    label: 'Team en competenties',
    underlying: 'Zekerheid dat de juiste mensen beschikbaar blijven gedurende de looptijd',
    success: 'Named resources, relevante ervaring en vervangbaarheid per rol',
  },
  {
    patterns: [/duurzaam|mvo|co2|circulair/i],
    label: 'Duurzaamheid',
    underlying: 'Maatschappelijke en organisatorische verantwoordelijkheid zonder greenwashing',
    success: 'Concrete, meetbare duurzaamheidsmaatregelen gekoppeld aan de opdracht',
  },
  {
    patterns: [/prijs|kosten|effici[eë]nt|tarief/i],
    label: 'Prijs en efficiency',
    underlying: 'Waarde voor geld zonder kwaliteits- of scope-inlevering achteraf',
    success: 'Transparante prijsopbouw en aantoonbare efficiency zonder verborgen risico\'s',
  },
  {
    patterns: [/innovati|verbeter|digital/i],
    label: 'Innovatie',
    underlying: 'Vooruitgang zonder experimentele risico\'s voor de opdrachtgever',
    success: 'Bewezen verbeteringen met pilot- of referentiebewijs',
  },
  {
    patterns: [/privacy|avg|beveilig|security|iso\s*27001/i],
    label: 'Privacy en veiligheid',
    underlying: 'Betrouwbare omgang met gevoelige data en compliance-eisen',
    success: 'Concrete beheersmaatregelen, rollen en audittrail',
  },
  {
    patterns: [/social return|srk|participatie/i],
    label: 'Social return',
    underlying: 'Maatschappelijke impact die aansluit bij beleid van de opdrachtgever',
    success: 'Meetbare participatie-afspraken en rapportage',
  },
]

function parseCriterionWeight(criterion: string): number {
  const match = criterion.match(/(\d{1,3})\s*%/)
  return match ? Number.parseInt(match[1], 10) : 0
}

function buildExplicitQuestion(
  contentRequirements: ContentRequirement[],
  documentRequirements: DocumentRequirement[],
): string {
  const mandatoryTopics = contentRequirements
    .filter((req) => req.mandatory)
    .slice(0, 4)
    .map((req) => req.topic)
  const mandatoryDocs = documentRequirements
    .filter((req) => req.mandatory)
    .slice(0, 4)
    .map((req) => req.name)

  const parts: string[] = []
  if (mandatoryDocs.length) {
    parts.push(`het indienen van ${mandatoryDocs.join(', ')}`)
  }
  if (mandatoryTopics.length) {
    parts.push(`een uitwerking van ${mandatoryTopics.join(', ')}`)
  }

  if (!parts.length) {
    return 'een volledig, beoordelingsgericht inschrijfstuk dat aansluit op de aanbestedingsstukken'
  }

  return parts.join(' en ')
}

function detectIntentThemes(text: string): IntentTheme[] {
  return INTENT_THEMES.filter((theme) => theme.patterns.some((pattern) => pattern.test(text)))
}

function buildTeamBrief(
  buyerName: string,
  intent: Omit<UnderlyingIntent, 'teamBrief'>,
): string {
  const priorityBlock =
    intent.buyerPriorities.length > 0
      ? `\n\nPrioriteiten volgens beoordeling: ${intent.buyerPriorities.join('; ')}.`
      : ''
  const successBlock =
    intent.implicitSuccessFactors.length > 0
      ? `\n\nWat de opdrachtgever impliciet succesvol vindt:\n${intent.implicitSuccessFactors.map((item) => `• ${item}`).join('\n')}`
      : ''

  return `Intern — niet opnemen in het inschrijfdocument

De opdrachtgever (${buyerName}) vraagt expliciet om ${intent.explicitQuestion}.

De vraag achter de vraag: ${intent.questionBehindQuestion}

Onderliggende behoefte: ${intent.underlyingNeed}${priorityBlock}${successBlock}

Schrijflens voor het team: ${intent.writingGuidance}`
}

export function extractUnderlyingIntent(
  text: string,
  buyerName: string,
  contentRequirements: ContentRequirement[],
  documentRequirements: DocumentRequirement[],
  evaluationCriteria: string[],
  styleProfile: StyleProfile,
): UnderlyingIntent {
  const themes = detectIntentThemes(text)
  const explicitQuestion = buildExplicitQuestion(contentRequirements, documentRequirements)

  const sortedCriteria = [...evaluationCriteria].sort(
    (a, b) => parseCriterionWeight(b) - parseCriterionWeight(a),
  )
  const buyerPriorities =
    sortedCriteria.length > 0
      ? sortedCriteria.slice(0, 5)
      : themes.slice(0, 3).map((theme) => theme.label)

  const topCriterion = sortedCriteria[0]
  const topTheme = themes[0]

  let underlyingNeed = topTheme?.underlying ?? 'Zekerheid over uitvoering, grip op risico\'s en aantoonbare kwaliteit'
  if (/kwaliteit\s+\d/i.test(text) && /prijs\s+\d/i.test(text)) {
    const qualityMatch = text.match(/kwaliteit\s+(\d{1,3})\s*%/i)
    const priceMatch = text.match(/prijs\s+(\d{1,3})\s*%/i)
    if (qualityMatch && priceMatch) {
      const q = Number.parseInt(qualityMatch[1], 10)
      const p = Number.parseInt(priceMatch[1], 10)
      if (q > p) {
        underlyingNeed = `${underlyingNeed}. Kwaliteit weegt zwaarder (${q}% vs ${p}% prijs) — bewijs en uitvoerbaarheid zijn belangrijker dan de laagste prijs`
      }
    }
  }

  if (/formeel|toetsbaar|objectief/i.test(text)) {
    underlyingNeed = `${underlyingNeed}. Formele, toetsbare onderbouwing zonder promotionele taal`
  }
  if (/grip|beheers|controle/i.test(text)) {
    underlyingNeed = `${underlyingNeed}. De opdrachtgever wil grip houden op voortgang en keuzes`
  }

  const themeLabels = themes.map((theme) => theme.label.toLowerCase())
  const questionBehindQuestion = topCriterion
    ? `${buyerName} wil vooral zekerheid dat inschrijvers scoren op "${topCriterion.replace(/\s*\(\d+%\)/, '')}" — niet alleen het formulier invullen, maar aantonen dat de aanpak het werkelijke doel van de opdracht dient${themeLabels.length ? ` (${themeLabels.slice(0, 3).join(', ')})` : ''}.`
    : topTheme
      ? `${buyerName} zoekt een partner die ${topTheme.label.toLowerCase()} concreet waarborgt — de leidraad is het bewijs, niet het doel op zich.`
      : `${buyerName} zoekt een partner die de opdracht beheersbaar maakt: voorspelbare kwaliteit, heldere verantwoordelijkheden en onderbouwbare keuzes.`

  const implicitSuccessFactors = [
    ...themes.slice(0, 4).map((theme) => theme.success),
    ...styleProfile.buyerSignals
      .filter((signal) => /concreet|onderbouwd|toetsbaar|beoordel/i.test(signal))
      .slice(0, 2),
  ].slice(0, 5)

  if (implicitSuccessFactors.length === 0) {
    implicitSuccessFactors.push(
      'Elke claim is gekoppeld aan bewijs uit referenties, team of werkwijze',
      'De tekst is direct toetsbaar aan beoordelingscriteria uit de leidraad',
    )
  }

  const priorityHint = buyerPriorities[0]
    ? ` Begin elke sectie met wat ${buyerName} op "${buyerPriorities[0].replace(/\s*\(\d+%\)/, '')}" wil zien.`
    : ''

  const writingGuidance = [
    `Schrijf op de onderliggende behoefte (${underlyingNeed.slice(0, 120)}${underlyingNeed.length > 120 ? '…' : ''}), niet alleen op de checklist.`,
    `Koppel elke paragraaf aan minstens één beoordelingscriterium en maak claims toetsbaar.`,
    `Blend de stem van ${styleProfile.companyName} met de formele verwachtingen van ${buyerName}.${priorityHint}`,
  ].join(' ')

  const partial = {
    explicitQuestion,
    underlyingNeed,
    questionBehindQuestion,
    buyerPriorities,
    implicitSuccessFactors: [...new Set(implicitSuccessFactors)],
    writingGuidance,
  }

  return {
    ...partial,
    teamBrief: buildTeamBrief(buyerName, partial),
  }
}

export function analyzeTenderDocuments(
  documents: SourceDocument[],
  buyerName: string,
): TenderAnalysis {
  const leidraad = findLeidraadDoc(documents)
  const tenderDocs = documents.filter((doc) => doc.type === 'tender')
  const companyDocs = documents.filter((doc) => doc.type === 'company')
  const rulesDocs = documents.filter((doc) => doc.type === 'rules')

  const analysisSources = leidraad
    ? [leidraad]
    : tenderDocs.length
      ? tenderDocs
      : documents.filter((doc) => doc.type === 'tender')

  const combinedText = analysisSources.map((doc) => doc.content).join('\n')
  const allTenderText = tenderDocs.map((doc) => doc.content).join('\n')

  const wordLimits = analysisSources.flatMap((doc) => extractWordLimits(doc.content, doc.name))
  const contentRequirements = analysisSources.flatMap((doc) =>
    extractContentRequirements(doc.content, doc.name),
  )
  const documentRequirements = analysisSources.flatMap((doc) =>
    extractDocumentRequirements(doc.content, doc.name),
  )
  const submissionRequirements = analysisSources.flatMap((doc) =>
    extractSubmissionRequirements(doc.content, doc.name),
  )
  const evaluationCriteria = extractEvaluationCriteria(allTenderText || combinedText)

  const styleProfile = buildStyleProfile(companyDocs, tenderDocs, leidraad, buyerName)

  rulesDocs.forEach((doc) => {
    styleProfile.companySignals.push(...extractStyleSignals(doc.content, 'company'))
  })
  styleProfile.companySignals = [...new Set(styleProfile.companySignals)].slice(0, 5)

  const wordTarget = wordLimits
    .filter((limit) => limit.unit === 'woorden' && limit.max)
    .reduce<number | undefined>((min, limit) => {
      const value = limit.max!
      return min === undefined ? value : Math.min(min, value)
    }, undefined)

  const charTarget = wordLimits
    .filter((limit) => limit.unit === 'karakters' && limit.max)
    .reduce<number | undefined>((min, limit) => {
      const value = limit.max!
      return min === undefined ? value : Math.min(min, value)
    }, undefined)

  const partial = {
    leidraadFound: Boolean(leidraad),
    leidraadSource: leidraad?.name,
    wordLimits,
    contentRequirements,
    documentRequirements,
    submissionRequirements,
    evaluationCriteria,
    styleProfile,
  }

  const gaps = detectGaps(partial, documents)

  const intentText = [combinedText, allTenderText].filter(Boolean).join('\n')
  const underlyingIntent = extractUnderlyingIntent(
    intentText,
    buyerName,
    contentRequirements,
    documentRequirements,
    evaluationCriteria,
    styleProfile,
  )

  const summary = leidraad
    ? `Leidraad "${leidraad.name}" geanalyseerd: ${contentRequirements.length} inhoudseisen, ${documentRequirements.length} documenten, ${wordLimits.length} limieten, vraag-achter-de-vraag inzicht en gecombineerde schrijfstijl (${styleProfile.companyName} × ${buyerName}).`
    : `Analyse op basis van ${tenderDocs.length} aanbestedingsbron(nen): voeg een leidraad toe voor volledige eisen, limieten en opdrachtintentie.`

  return {
    ...partial,
    underlyingIntent,
    analyzedAt: new Date().toLocaleString('nl-NL'),
    summary,
    gaps,
    targetWordCount: wordTarget,
    targetCharCount: charTarget,
  }
}

export function countWords(html: string) {
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return plain ? plain.split(' ').length : 0
}

export function countCharacters(html: string) {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length
}

export function hasVolumeLimit(analysis: TenderAnalysis): boolean {
  return Boolean(
    analysis.targetWordCount ||
      analysis.targetCharCount ||
      analysis.wordLimits.some((limit) => limit.unit === 'paginas' && limit.max),
  )
}

export function reviewAgainstAnalysis(
  html: string,
  analysis: TenderAnalysis,
): Array<{ priority: 'kritiek' | 'hoog' | 'normaal'; title: string; detail: string }> {
  const findings: Array<{ priority: 'kritiek' | 'hoog' | 'normaal'; title: string; detail: string }> = []
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase()
  const words = countWords(html)
  const chars = countCharacters(html)

  if (!analysis.leidraadFound) {
    findings.push({
      priority: 'kritiek',
      title: 'Leidraad ontbreekt in bronnen',
      detail: 'Upload de aanbestedingsleidraad zodat woordlimieten, onderwerpen en verplichte bijlagen zichtbaar worden.',
    })
  }

  if (analysis.targetWordCount && words > analysis.targetWordCount) {
    findings.push({
      priority: 'hoog',
      title: 'Woordlimiet overschreden',
      detail: `Concept telt ${words} woorden; leidraad maximaal ${analysis.targetWordCount} woorden.`,
    })
  }

  if (analysis.targetCharCount && chars > analysis.targetCharCount) {
    findings.push({
      priority: 'hoog',
      title: 'Karakterlimiet overschreden',
      detail: `Concept telt ${chars.toLocaleString('nl-NL')} karakters; leidraad maximaal ${analysis.targetCharCount.toLocaleString('nl-NL')} karakters.`,
    })
  }

  if (analysis.targetWordCount && words < analysis.targetWordCount * 0.9) {
    findings.push({
      priority: 'hoog',
      title: 'Concept onder woorddoel',
      detail: `Concept telt ${words} woorden; leidraad maximaal ${analysis.targetWordCount} — streef naar ${Math.round(analysis.targetWordCount * 0.97)}–${analysis.targetWordCount} woorden.`,
    })
  }

  analysis.contentRequirements
    .filter((req) => req.mandatory)
    .forEach((req) => {
      const keywords = req.topic.split(/\s+/).filter((part) => part.length > 3)
      const hit = keywords.some((keyword) => plain.includes(keyword.toLowerCase()))
      if (!hit) {
        findings.push({
          priority: 'hoog',
          title: `Verplicht onderwerp ontbreekt: ${req.topic}`,
          detail: req.detail,
        })
      }
    })

  const mandatorySubmission = (analysis.submissionRequirements ?? []).filter((req) => req.mandatory)

  // Anonimiteitseis: signaleer als de bedrijfsnaam toch in het concept staat
  const anonymity = mandatorySubmission.find((req) => /anoniem|geanonimiseerd|herleidbaar/i.test(req.requirement))
  const companyName = analysis.styleProfile.companyName?.trim()
  if (anonymity && companyName && companyName.length > 2 && companyName.toLowerCase() !== 'inschrijver') {
    if (plain.includes(companyName.toLowerCase())) {
      findings.push({
        priority: 'kritiek',
        title: 'Anonimiteitseis geschonden',
        detail: `De leidraad vraagt een anonieme inschrijving, maar de bedrijfsnaam "${companyName}" staat in het concept. Verwijder herleidbare gegevens.`,
      })
    }
  }

  // Verplichte inschrijvingseisen als toetsbare herinnering
  mandatorySubmission.slice(0, 5).forEach((req) => {
    findings.push({
      priority: 'normaal',
      title: `Inschrijvingseis bewaken: ${req.category}`,
      detail: `${req.requirement} (${req.source})`,
    })
  })

  analysis.gaps.slice(0, 3).forEach((gap) => {
    findings.push({ priority: 'hoog', title: 'Dossiergap', detail: gap })
  })

  if (analysis.styleProfile.companySignals.length && analysis.styleProfile.buyerSignals.length) {
    const companyHit = analysis.styleProfile.companySignals.some((signal) =>
      plain.includes(signal.split(' ')[0].toLowerCase()),
    )
    const buyerHit = analysis.styleProfile.buyerSignals.some((signal) =>
      plain.includes(signal.split(' ')[0].toLowerCase()),
    )
    if (!companyHit || !buyerHit) {
      findings.push({
        priority: 'normaal',
        title: 'Schrijfstijl kan sterker blenden',
        detail: analysis.styleProfile.blendedGuidance,
      })
    }
  }

  return findings
}
