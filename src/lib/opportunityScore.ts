import type { CompanyConfig } from '../types/companyConfig'
import type { SourceDocument, TenderAnalysis } from '../types/tenderAnalysis'

/**
 * Kansscore: een eerlijke inschatting van de winkans van DEZE inschrijver op DEZE
 * aanbesteding. In tegenstelling tot een tekstkwaliteitsmeter kijkt deze score naar
 * de match tussen bedrijfsprofiel en uitvraag, naar referenties, naar harde (knock-out)
 * eisen en naar de te verwachten concurrentie.
 */

export type OpportunityFactorKey = 'profielmatch' | 'referenties' | 'hardeEisen' | 'concurrentie'

export type OpportunityFactor = {
  key: OpportunityFactorKey
  label: string
  /** 0–100 deelscore voor deze factor */
  score: number
  /** relatief gewicht binnen de totaalscore (0–1) */
  weight: number
  /** één regel met de kern van de inschatting */
  summary: string
  /** concrete, toetsbare observaties die de deelscore onderbouwen */
  signals: string[]
}

export type OpportunityLevel = 'laag' | 'matig' | 'kansrijk' | 'sterk'

export type OpportunityScore = {
  /** 0–100 gewogen totaal */
  score: number
  level: OpportunityLevel
  factors: OpportunityFactor[]
  /** kanttekeningen bij de betrouwbaarheid (bv. ontbrekend profiel/analyse) */
  caveats: string[]
}

const FACTOR_WEIGHTS: Record<OpportunityFactorKey, number> = {
  profielmatch: 0.35,
  referenties: 0.25,
  hardeEisen: 0.25,
  concurrentie: 0.15,
}

const FACTOR_LABELS: Record<OpportunityFactorKey, string> = {
  profielmatch: 'Profielmatch',
  referenties: 'Referenties',
  hardeEisen: 'Harde eisen',
  concurrentie: 'Concurrentie',
}

// Nederlandse stopwoorden + aanbestedings-ruiswoorden die niets zeggen over inhoudelijke match.
const STOPWORDS = new Set([
  'de', 'het', 'een', 'en', 'van', 'voor', 'met', 'aan', 'op', 'in', 'te', 'is', 'zijn', 'wordt',
  'worden', 'dat', 'die', 'deze', 'dit', 'door', 'naar', 'als', 'bij', 'om', 'of', 'uit', 'over',
  'per', 'tot', 'ook', 'niet', 'wel', 'meer', 'moet', 'moeten', 'dient', 'kan', 'kunnen', 'heeft',
  'hebben', 'wij', 'ons', 'onze', 'zij', 'haar', 'hun', 'uw', 'het', 'alle', 'andere', 'tussen',
  'inschrijver', 'inschrijving', 'opdrachtgever', 'opdracht', 'aanbesteding', 'aanbestedende',
  'dienst', 'criterium', 'criteria', 'eis', 'eisen', 'wens', 'wensen', 'gunning', 'beoordeling',
  'minimaal', 'maximaal', 'aantal', 'jaar', 'jaren', 'euro', 'bedrag', 'conform', 'inzake',
  'betreffende', 'middels', 'binnen', 'zowel', 'alsmede', 'waarbij', 'waaronder', 'waarin',
])

function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9àáâäçéèêëíïîóôöúûü\s-]/gi, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ''))
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
}

function termSet(text: string): Set<string> {
  return new Set(tokenize(text))
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)))
}

/** Bouwt de "vraagkant": waar draait deze aanbesteding inhoudelijk om? */
function buildDemandText(analysis: TenderAnalysis): string {
  const parts: string[] = [analysis.summary]
  analysis.contentRequirements.forEach((c) => parts.push(c.topic, c.detail))
  analysis.evaluationCriteria.forEach((c) => parts.push(c.replace(/\(\s*\d+\s*%?\s*\)/g, '')))
  if (analysis.underlyingIntent) {
    parts.push(
      analysis.underlyingIntent.underlyingNeed,
      analysis.underlyingIntent.questionBehindQuestion,
      ...analysis.underlyingIntent.buyerPriorities,
      ...analysis.underlyingIntent.implicitSuccessFactors,
    )
  }
  return parts.filter(Boolean).join(' ')
}

/** Bouwt de "aanbodkant": wat brengt deze inschrijver mee? */
function buildSupplyText(company: CompanyConfig): string {
  const parts = [company.profile, company.competencies, company.usps, company.tagline, company.references]
  company.files.forEach((f) => parts.push(f.name, f.content))
  return parts.filter(Boolean).join(' ')
}

// ── Factor 1: profielmatch ───────────────────────────────────────────────────
function scoreProfielmatch(company: CompanyConfig, analysis: TenderAnalysis): OpportunityFactor {
  const demand = termSet(buildDemandText(analysis))
  const supply = buildSupplyText(company)
  const supplyTerms = termSet(supply)
  const signals: string[] = []

  if (!supplyTerms.size) {
    return {
      key: 'profielmatch',
      label: FACTOR_LABELS.profielmatch,
      score: 25,
      weight: FACTOR_WEIGHTS.profielmatch,
      summary: 'Geen bedrijfsprofiel ingevuld — match niet te bepalen.',
      signals: ['Vul profiel, kerncompetenties en onderscheidend vermogen in om de match te meten.'],
    }
  }
  if (!demand.size) {
    return {
      key: 'profielmatch',
      label: FACTOR_LABELS.profielmatch,
      score: 50,
      weight: FACTOR_WEIGHTS.profielmatch,
      summary: 'Uitvraag nog niet geanalyseerd — match indicatief.',
      signals: ['Analyseer eerst de leidraad voor een betrouwbare profielmatch.'],
    }
  }

  const matched: string[] = []
  demand.forEach((term) => {
    if (supplyTerms.has(term)) matched.push(term)
  })
  const coverage = matched.length / demand.size

  // Dekking van de beoordelingscriteria weegt zwaarder dan de algemene tekst:
  // dáár wordt op gescoord. We trekken die apart.
  const criteriaTerms = termSet(
    analysis.evaluationCriteria.map((c) => c.replace(/\(\s*\d+\s*%?\s*\)/g, '')).join(' '),
  )
  let criteriaHits = 0
  criteriaTerms.forEach((t) => {
    if (supplyTerms.has(t)) criteriaHits += 1
  })
  const criteriaCoverage = criteriaTerms.size ? criteriaHits / criteriaTerms.size : coverage

  // Gewogen: 60% algemene inhoudelijke dekking, 40% dekking op beoordelingscriteria.
  const blended = coverage * 0.6 + criteriaCoverage * 0.4
  // Een match van 35% van de unieke vraagtermen is in de praktijk al sterk; schaal daarnaartoe.
  const score = clamp(blended * 180 + 18)

  signals.push(
    `${matched.length}/${demand.size} kernthema's uit de uitvraag komen terug in het profiel${
      matched.length ? ` (o.a. ${matched.slice(0, 5).join(', ')})` : ''
    }.`,
  )
  if (criteriaTerms.size) {
    signals.push(
      `Dekking op beoordelingscriteria: ${Math.round(criteriaCoverage * 100)}% van de criteriumtermen.`,
    )
  }
  if (coverage < 0.15) {
    signals.push('Lage overlap: het profiel sluit nog beperkt aan op deze opdracht.')
  }

  return {
    key: 'profielmatch',
    label: FACTOR_LABELS.profielmatch,
    score,
    weight: FACTOR_WEIGHTS.profielmatch,
    summary:
      score >= 70
        ? 'Profiel sluit goed aan op wat de opdrachtgever vraagt.'
        : score >= 50
          ? 'Gedeeltelijke aansluiting; scherp het profiel aan op de kernthema\'s.'
          : 'Beperkte aansluiting tussen profiel en uitvraag.',
    signals,
  }
}

// ── Factor 2: referenties ────────────────────────────────────────────────────
const REFERENCE_RE = /referentie|kerncompetentie|vergelijkbare opdracht|soortgelijke opdracht/i

function countCompanyReferences(company: CompanyConfig): number {
  const text = company.references.trim()
  if (!text) {
    // Soms zit referentie-bewijs in geüploade bestanden.
    return company.files.some((f) => REFERENCE_RE.test(f.name) || REFERENCE_RE.test(f.content)) ? 1 : 0
  }
  const byLine = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const byBullet = text.split(/[•;]|(?:^|\s)\d+[.)]\s/).map((l) => l.trim()).filter((l) => l.length > 10)
  return Math.max(byLine.length, byBullet.length, 1)
}

function requiredReferenceCount(analysis: TenderAnalysis): number | null {
  const haystack = [
    ...analysis.submissionRequirements.map((r) => r.requirement),
    ...analysis.contentRequirements.map((c) => `${c.topic} ${c.detail}`),
    ...analysis.documentRequirements.map((d) => d.name),
  ].join(' ')
  const m = haystack.match(/(?:minimaal|minimum|ten minste|tenminste)\s+(\d{1,2})\s+(?:referentie|vergelijkbare|soortgelijke)/i)
  if (m) return Number.parseInt(m[1], 10)
  return null
}

function scoreReferenties(company: CompanyConfig, analysis: TenderAnalysis): OpportunityFactor {
  const required =
    analysis.submissionRequirements.some(
      (r) => r.category === 'geschiktheid' && REFERENCE_RE.test(r.requirement),
    ) ||
    analysis.documentRequirements.some((d) => REFERENCE_RE.test(d.name)) ||
    analysis.contentRequirements.some((c) => REFERENCE_RE.test(`${c.topic} ${c.detail}`))
  const have = countCompanyReferences(company)
  const requiredCount = requiredReferenceCount(analysis)
  const signals: string[] = []

  let score: number
  if (required) {
    if (have === 0) {
      score = 20
      signals.push('De uitvraag vraagt om referenties/kerncompetenties, maar er zijn geen referenties ingevuld.')
    } else if (requiredCount && have < requiredCount) {
      score = 45
      signals.push(`Gevraagd: minimaal ${requiredCount} referentie(s); beschikbaar in profiel: ${have}.`)
    } else {
      score = requiredCount ? 88 : 82
      signals.push(
        requiredCount
          ? `Voldoet aan de eis van minimaal ${requiredCount} referentie(s) (${have} beschikbaar).`
          : `${have} referentie(s) beschikbaar voor de gevraagde geschiktheidseis.`,
      )
      signals.push('Controleer of de referenties inhoudelijk vergelijkbaar zijn (omvang, scope, recent).')
    }
  } else {
    if (have === 0) {
      score = 55
      signals.push('Geen expliciete referentie-eis gevonden; toch ontbreken referenties om claims te bewijzen.')
    } else {
      score = 72
      signals.push(`${have} referentie(s) beschikbaar om de aanpak geloofwaardig te onderbouwen.`)
    }
  }

  return {
    key: 'referenties',
    label: FACTOR_LABELS.referenties,
    score: clamp(score),
    weight: FACTOR_WEIGHTS.referenties,
    summary: required
      ? have === 0
        ? 'Referentie-eis niet afgedekt — knock-out risico.'
        : 'Referenties aanwezig voor de gevraagde geschiktheidseis.'
      : 'Geen harde referentie-eis; referenties versterken het verhaal.',
    signals,
  }
}

// ── Factor 3: harde eisen (knock-out) ────────────────────────────────────────
function scoreHardeEisen(company: CompanyConfig, analysis: TenderAnalysis): OpportunityFactor {
  const knockoutReqs = analysis.submissionRequirements.filter(
    (r) => r.mandatory && (r.category === 'geschiktheid' || r.category === 'uitsluiting'),
  )
  const mandatoryDocs = analysis.documentRequirements.filter((d) => d.mandatory)
  const signals: string[] = []

  // Bedrijfs-"gereedheid": hoe volledig is het profiel om eisen aan te tonen?
  const readinessBits = [
    company.kvk.trim() ? 1 : 0,
    company.profile.trim() ? 1 : 0,
    company.competencies.trim() ? 1 : 0,
    company.references.trim() || company.files.length ? 1 : 0,
    company.usps.trim() ? 1 : 0,
  ]
  const readiness = readinessBits.reduce((a, b) => a + b, 0) / readinessBits.length

  // Basis: meer onbekende knock-out eisen = meer risico dat we ergens niet aan voldoen.
  let score = 82 - knockoutReqs.length * 7
  // Een goed gevuld bedrijfsdossier verlaagt het risico (we kunnen eisen aantonen).
  score += (readiness - 0.6) * 25
  // Door de analyse gemarkeerde risico's/gaten drukken de score.
  score -= Math.min(analysis.gaps.length, 4) * 4

  if (knockoutReqs.length) {
    signals.push(
      `${knockoutReqs.length} harde geschiktheids-/uitsluitingseis(en) gevonden — toets compliance vóór inschrijven.`,
    )
    knockoutReqs.slice(0, 3).forEach((r) => signals.push(`• ${r.requirement}`))
  } else {
    signals.push('Geen expliciete geschiktheids-/uitsluitingseisen gedetecteerd in de analyse.')
  }
  if (mandatoryDocs.length) {
    signals.push(`${mandatoryDocs.length} verplichte document(en)/bijlage(n) aan te leveren.`)
  }
  if (readiness < 0.6) {
    signals.push('Bedrijfsdossier is nog beperkt gevuld; lastiger om aan eisen te bewijzen.')
  }
  if (analysis.gaps.length) {
    signals.push(`${analysis.gaps.length} risicopunt(en) gesignaleerd in de analyse.`)
  }

  return {
    key: 'hardeEisen',
    label: FACTOR_LABELS.hardeEisen,
    score: clamp(score),
    weight: FACTOR_WEIGHTS.hardeEisen,
    summary:
      knockoutReqs.length === 0
        ? 'Geen duidelijke knock-out eisen gedetecteerd.'
        : 'Let op knock-out eisen; bevestig dat aan alle harde eisen wordt voldaan.',
    signals,
  }
}

// ── Factor 4: concurrentie ───────────────────────────────────────────────────
function parseCriteriaWeights(analysis: TenderAnalysis): { price: number; quality: number } {
  let price = 0
  let quality = 0
  const PRICE_RE = /prijs|kosten|tarief|tarieven|prijsstelling/i
  analysis.evaluationCriteria.forEach((c) => {
    const pct = c.match(/(\d{1,3})\s*%/)
    const weight = pct ? Number.parseInt(pct[1], 10) : 0
    if (PRICE_RE.test(c)) price += weight
    else quality += weight
  })
  return { price, quality }
}

function scoreConcurrentie(analysis: TenderAnalysis, documents: SourceDocument[]): OpportunityFactor {
  const { price, quality } = parseCriteriaWeights(analysis)
  const signals: string[] = []
  const tenderText = documents
    .filter((d) => d.type === 'tender')
    .map((d) => d.content)
    .join(' ')
    .toLowerCase()

  let score = 55 // neutrale uitgangspositie

  if (price + quality > 0) {
    const qualityFraction = quality / (price + quality)
    // Kwaliteitsgedreven gunning (EMVI/BPKV) beloont een onderscheidend verhaal en
    // beperkt het "race-to-the-bottom"-effect waar veel partijen op inschrijven.
    score = 38 + qualityFraction * 44
    signals.push(
      `Gunning ${Math.round(qualityFraction * 100)}% op kwaliteit / ${Math.round((1 - qualityFraction) * 100)}% op prijs.`,
    )
    if (qualityFraction >= 0.6) signals.push('Kwaliteitsgedreven: onderscheidend vermogen telt zwaar.')
    else if (qualityFraction <= 0.35) signals.push('Prijsgedreven: verwacht scherpe prijsconcurrentie.')
  } else {
    signals.push('Geen gewichten van beoordelingscriteria gevonden; concurrentie indicatief ingeschat.')
  }

  // Procedurevorm: openbaar trekt doorgaans meer inschrijvers dan niet-openbaar/selectie.
  if (/\bopenbare?\s+procedure\b|openbare aanbesteding/i.test(tenderText)) {
    score -= 6
    signals.push('Openbare procedure: doorgaans meer inschrijvers.')
  } else if (/niet-openbare|onderhandse|meervoudig onderhands|selectie(?:fase|leidraad)/i.test(tenderText)) {
    score += 8
    signals.push('(Niet-openbare/onderhandse) selectie: beperkter deelnemersveld.')
  }

  // Specialistische/niche-scope laat zich minder makkelijk door veel partijen invullen.
  if (/specialis|niche|hoogwaardige|complexe|innovatie|maatwerk/i.test(tenderText)) {
    score += 5
    signals.push('Specialistische scope beperkt het aantal serieuze concurrenten.')
  }

  return {
    key: 'concurrentie',
    label: FACTOR_LABELS.concurrentie,
    score: clamp(score),
    weight: FACTOR_WEIGHTS.concurrentie,
    summary:
      score >= 65
        ? 'Gunstige concurrentiepositie op deze opdracht.'
        : score >= 45
          ? 'Gemiddelde concurrentiedruk verwacht.'
          : 'Stevige concurrentie verwacht — onderscheid is cruciaal.',
    signals,
  }
}

function levelFor(score: number): OpportunityLevel {
  if (score >= 78) return 'sterk'
  if (score >= 60) return 'kansrijk'
  if (score >= 42) return 'matig'
  return 'laag'
}

/**
 * Berekent de kansscore op basis van de match tussen bedrijfsprofiel en uitvraag,
 * referenties, harde eisen en de te verwachten concurrentie.
 */
export function computeOpportunityScore(
  company: CompanyConfig,
  analysis: TenderAnalysis | null,
  documents: SourceDocument[] = [],
): OpportunityScore {
  const caveats: string[] = []

  if (!analysis) {
    caveats.push('Nog geen uitvraag-analyse: analyseer de leidraad voor een betrouwbare kansscore.')
  }
  const hasCompany = Boolean(
    company.profile.trim() || company.competencies.trim() || company.usps.trim() || company.references.trim() || company.files.length,
  )
  if (!hasCompany) {
    caveats.push('Geen bedrijfsprofiel ingesteld: vul profiel en referenties in voor een scherpere score.')
  }

  // Zonder analyse kunnen we alleen een voorzichtige, lage indicatie geven.
  const safeAnalysis: TenderAnalysis =
    analysis ?? {
      analyzedAt: '',
      leidraadFound: false,
      summary: '',
      wordLimits: [],
      contentRequirements: [],
      documentRequirements: [],
      submissionRequirements: [],
      evaluationCriteria: [],
      styleProfile: { companyName: '', buyerName: '', companySignals: [], buyerSignals: [], blendedGuidance: '' },
      gaps: [],
    }

  const factors: OpportunityFactor[] = [
    scoreProfielmatch(company, safeAnalysis),
    scoreReferenties(company, safeAnalysis),
    scoreHardeEisen(company, safeAnalysis),
    scoreConcurrentie(safeAnalysis, documents),
  ]

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0)
  let score = Math.round(factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight)

  // Bij ontbrekende analyse is de score onbetrouwbaar; begrens hem zodat hij niet vals geruststelt.
  if (!analysis) score = Math.min(score, 45)

  return {
    score: clamp(score),
    level: levelFor(score),
    factors,
    caveats,
  }
}
