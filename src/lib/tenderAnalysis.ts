import type { SourceDocument } from '../types/tenderAnalysis'
import type {
  ContentRequirement,
  DocumentRequirement,
  StyleProfile,
  TenderAnalysis,
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
    evaluationCriteria,
    styleProfile,
  }

  const gaps = detectGaps(partial, documents)

  const summary = leidraad
    ? `Leidraad "${leidraad.name}" geanalyseerd: ${contentRequirements.length} inhoudseisen, ${documentRequirements.length} documenten, ${wordLimits.length} limieten en gecombineerde schrijfstijl (${styleProfile.companyName} × ${buyerName}).`
    : `Analyse op basis van ${tenderDocs.length} aanbestedingsbron(nen): voeg een leidraad toe voor volledige eisen en limieten.`

  return {
    ...partial,
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

  if (analysis.targetWordCount && words < analysis.targetWordCount * 0.6) {
    findings.push({
      priority: 'normaal',
      title: 'Concept onder woorddoel',
      detail: `Concept telt ${words} woorden; leidraad suggereert circa ${analysis.targetWordCount} woorden.`,
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
