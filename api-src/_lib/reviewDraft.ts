import { completeChat, resolveAiFromRequest } from './aiClient'
import type {
  ClaimCheckItem,
  ReviewDraftRequest,
  ReviewDraftResponse,
  ReviewFindingItem,
  ReviewInformationRequest,
  ReviewPriority,
  ReviewProposal,
} from '../../src/types/reviewDraft'
import type { Requirement, RequirementCheck, TenderAnalysis } from '../../src/types/tenderAnalysis'
import { normalizeRequirementChecks, requirementsForDocument } from '../../src/lib/requirements'
import { formatLimits, limitsForAnalysis } from '../../src/lib/volumeLimits'

const DOC_CHAR_LIMIT = 40_000
const DRAFT_CHAR_LIMIT = 120_000
const MAX_FINDINGS = 14
// Eisen die de reviewer per stuk toetst; meer dan dit maakt de JSON-output onbetrouwbaar.
const MAX_REQUIREMENT_CHECKS = 40
const MAX_INFORMATION_REQUESTS = 10
const MAX_PROPOSALS = 8
// Bewijscheck: meer claims dan dit maakt het oordeel oppervlakkig en de JSON onbetrouwbaar.
const MAX_CLAIM_CHECKS = 25
const CLAIM_FRAGMENT_CHARS = 220

const PRIORITY_RANK: Record<ReviewPriority, number> = {
  kritiek: 0,
  hoog: 1,
  normaal: 2,
}

const stageLabels: Record<ReviewDraftRequest['stage'], string> = {
  brons: 'Brons (eerste concept)',
  zilver: 'Zilver (review verwerkt)',
  goud: 'Goud (eindversie)',
}

// De verbeterronde per stadium: wat de review moet opleveren om de volgende versie beter te maken.
const STAGE_FOCUS: Record<ReviewDraftRequest['stage'], string> = {
  brons:
    'Eerste versie. Toets volledigheid tegen de eisen en de vraag van dit stuk. Vraag ALLE informatie op die nodig is om eisen af te dekken en claims te onderbouwen. Doe voorstellen om te verbeteren én om de uitvraag te overtreffen waar de opdrachtgever dat aantoonbaar waardeert (prioriteiten, vraag achter de vraag, beoordelingscriteria met hoge weging).',
  zilver:
    'Review verwerkt. Controleer of elk goedgekeurd voorstel en elk antwoord uit de vorige ronde daadwerkelijk én feitelijk juist is verwerkt — niet of half verwerkt is een bevinding "hoog". Signaleer restpunten. Nieuwe voorstellen alleen als ze aantoonbaar punten opleveren; nieuwe informatievragen alleen voor wat nog mist.',
  goud:
    'Eindversie. Eindcontrole op eisen, feitencheck en consistentie; geen koerswijzigingen meer — alleen wat nog moet om in te dienen. Elke claim zonder onderbouwing in de bronnen is een informatievraag of moet worden geschrapt.',
}

const SYSTEM_PROMPT = `Je bent een senior kwaliteitsreviewer voor Nederlandse aanbestedingen (Aanbestedingswet, EMVI, BPKV).
Je beoordeelt een concept-inschrijfstuk tegen de leidraad, de beoordelingscriteria en de bedrijfsbronnen.

DOEL
Lever scherpe, toetsbare reviewbevindingen die de winkans vergroten. Geen complimenten, geen samenvatting — alleen wat beter moet en waarom.

WAAR JE OP LET
- Dekking: is elk verplicht onderwerp en beoordelingscriterium uit de leidraad inhoudelijk geraakt?
- Bewijslast: zijn claims onderbouwd met concrete feiten, cases, KPI's of processen uit de bedrijfsbronnen? Signaleer lege superlatieven.
- Vraag achter de vraag: adresseert de tekst de onderliggende behoefte van de opdrachtgever, niet alleen de letterlijke vraag?
- Eisen aan de inschrijving: vorm, anonimiteit, taal, opmaak, indiening — schending is kritiek.
- Volume: te kort laat punten liggen; overschrijding van een hard maximum is diskwalificerend.
- Consistentie en concreetheid: vage passages, herhaling, ontbrekende rollen/planning.
- Schrijfkader-naleving: toets het concept aan de bronnen met de kop [SCHRIJFKADER · …] (schrijfregels, schrijfwijze, kwaliteitseisen en de handmatige/algemene aanpassingen van de inschrijver). Handmatige aanpassingen gaan vóór vastgelegde regels, die gaan vóór basisregels. Een overtreding van een verplichte schrijfregel of een handmatige aanpassing is minimaal "hoog"; citeer het fragment en benoem de geschonden regel. Let ook op stijlverval verderop in het document (eerste secties wel, latere secties niet conform).

EISENREGISTER
Je krijgt een lijst eisen (elk met een id) die aan de tekst van dit stuk toetsbaar zijn. Beoordeel ELKE eis uit die lijst:
- met = true: het concept voldoet er aantoonbaar aan
- met = false: niet of onvoldoende voldaan — zet in note kort wat ontbreekt
- met = null: de eis is niet van toepassing op dít stuk (hoort bij een ander stuk van de inschrijving)
Gebruik uitsluitend de gegeven ids. Een niet-voldane verplichte eis is ook een bevinding ("kritiek").

FEITENCHECK (hard)
Elke claim in het concept — cijfers, referenties, certificaten, namen, resultaten, toezeggingen, werkwijzen — moet terug te voeren zijn op de bronnen, op een bewijsbouwsteen of op de aanvullende informatie van het bidteam (vorige ronde). Is dat niet zo: stel een informationRequest ("Onderbouw of schrap: …") met wat precies nodig is. Verzin NOOIT onderbouwing en stel nooit voor om iets te beweren dat niet uit de bronnen blijkt.

BEWIJSCHECK (claimChecks) — claims zonder bewijs markeren
Je krijgt de BEWIJSBIBLIOTHEEK van de inschrijver: vastgelegde referenties, cases en cijfers, elk met een korte verwijzing zoals B4F19C. De schrijfagent hoort daaruit te citeren; een geciteerd feit staat in het concept als "… [bewijs:B4F19C]".
Loop het concept langs op feitelijke claims — cijfers, percentages, bedragen, aantallen, doorlooptijden, certificaten en normen, referenties, resultaten en absolute uitspraken ("altijd", "marktleider", "gegarandeerd", "aantoonbaar") — en oordeel per claim:
- status "onderbouwd": de claim is herleidbaar tot een bouwsteen, een bron of een antwoord van het bidteam. Zet in "evidence" de verwijzing (B4F19C) of de naam van de bron.
- status "onbewezen": er is geen bouwsteen, bron of antwoord die deze claim draagt — of het concept citeert een bouwsteen die iets anders zegt dan er staat. Zet in "note" wat er precies ontbreekt en wat het bidteam moet aanleveren.
Neem in "fragment" het LETTERLIJKE fragment uit het concept over (één zin, maximaal ${CLAIM_FRAGMENT_CHARS} tekens), zodat het in de tekst terug te vinden is. Je krijgt een deterministische voorselectie van claims mee; herbeoordeel die en vul aan met claims die zij niet ziet. Elke onbewezen claim krijgt ook een informationRequest of moet volgens jou geschrapt worden. Maximaal ${MAX_CLAIM_CHECKS} claims, onbewezen eerst.

INFORMATIEVRAGEN (informationRequests) — gericht uitvragen bij het bidteam
Eén concrete vraag per item, beantwoordbaar door het bidteam, met reason (welke claim/sectie/eis er zonder dit antwoord niet feitelijk kan), section (sectie in het concept) en requirementId (alleen als de vraag een open eis uit het register afdekt; gebruik dan exact die id). Bronnen: (1) open eisen van het bidteam die niet uit de bronnen blijken, (2) claims zonder onderbouwing, (3) input die een voorstel nodig heeft. Herhaal geen vraag die in de vorige ronde al is beantwoord of bewust overgeslagen. Maximaal ${MAX_INFORMATION_REQUESTS}, belangrijkste eerst.

VOORSTELLEN (proposals) — worden pas verwerkt na goedkeuring door de gebruiker
- kind "verbeteren": beter voldoen aan de vraag of een eis, sterker bewijs, scherpere structuur, consistentie.
- kind "overtreffen": de uitvraag overstijgen op een punt waar de opdrachtgever dat aantoonbaar waardeert (prioriteiten, vraag achter de vraag, hoog gewogen criterium, win-thema's uit de bedrijfsbronnen). Alleen als het past binnen de limieten en de leidraad het niet verbiedt.
Per voorstel: title, detail (wat concreet verandert of bijkomt), rationale (waarom het punten oplevert, met het criterium), section, criterion en needsInput: de feitelijke input die het bidteam moet leveren om dit te schrijven zonder te verzinnen (leeg laten als de bronnen al volstaan). Herhaal geen afgewezen voorstel. Maximaal ${MAX_PROPOSALS}.

PRIORITEITEN
- "kritiek": diskwalificerend of een hard criterium dat ontbreekt/geschonden is
- "hoog": kost aantoonbaar punten of verzwakt de score
- "normaal": verbetering die de kwaliteit verhoogt

REGELS
- Baseer je uitsluitend op de aangeleverde bronnen, analyse en het concept. Verzin geen eisen.
- Je krijgt een heuristische baseline met al gevonden punten. Herhaal die niet; vul aan met inhoudelijke, kwalitatieve bevindingen die een mens zou maken.
- Elke bevinding is concreet en handelingsgericht: benoem WAT en HOE het beter moet, met verwijzing naar sectie/criterium waar relevant.
- Maximaal ${MAX_FINDINGS} bevindingen, geordend op prioriteit.
- Schrijf in het Nederlands.

Antwoord uitsluitend met geldig JSON in exact deze vorm:
{
  "findings": [
    { "priority": "kritiek|hoog|normaal", "title": "", "detail": "" }
  ],
  "requirementChecks": [
    { "id": "", "met": true, "note": "" }
  ],
  "informationRequests": [
    { "question": "", "reason": "", "section": "", "requirementId": "", "priority": "kritiek|hoog|normaal" }
  ],
  "proposals": [
    { "kind": "verbeteren|overtreffen", "title": "", "detail": "", "rationale": "", "section": "", "criterion": "", "needsInput": "" }
  ],
  "claimChecks": [
    { "fragment": "", "status": "onderbouwd|onbewezen", "evidence": "", "note": "" }
  ]
}`

function trimSource(text: string, max = DOC_CHAR_LIMIT): string {
  const cleaned = text.replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max)}…`
}

/**
 * Concept naar platte tekst voor de reviewer. Citaten van bewijsbouwstenen zitten als
 * onzichtbare `data-bewijs`-spans in de HTML; die worden hier zichtbaar gemaakt als
 * "[bewijs:B4F19C]", zodat de reviewer kan nagaan of het citaat de claim ook echt draagt.
 */
function draftToPlainText(html: string): string {
  return html
    .replace(
      /<span\b[^>]*\bdata-bewijs="([^"]*)"[^>]*>([\s\S]*?)<\/span>/gi,
      (_match, handle: string, inner: string) => `${inner} [bewijs:${handle}]`,
    )
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DRAFT_CHAR_LIMIT)
}

function formatDocuments(request: ReviewDraftRequest): string {
  if (!request.documents.length) return '- geen bronnen aangeleverd'
  return request.documents
    .map((doc) => `- [${doc.type}] ${doc.name}:\n${trimSource(doc.content)}`)
    .join('\n\n')
}

function formatComments(request: ReviewDraftRequest): string {
  const open = request.comments.filter((comment) => !comment.resolved)
  if (!open.length) return '- geen open opmerkingen'
  return open.map((comment) => `- Fragment: ${comment.fragment}\n  Opmerking: ${comment.note}`).join('\n')
}

function formatBaseline(baseline: ReviewFindingItem[]): string {
  if (!baseline.length) return '- (geen)'
  return baseline.map((item) => `- [${item.priority}] ${item.title}: ${item.detail}`).join('\n')
}

function formatTargetDocument(request: ReviewDraftRequest): string {
  const doc = request.targetDocument
  if (!doc) return ''
  const lines = [
    'Te reviewen stuk (de inschrijving bestaat uit meerdere stukken; beoordeel dit concept ALLEEN op de vraag van dít stuk):',
    `- Titel: ${doc.title}`,
    `- Vraag/opdracht uit de leidraad: ${doc.question || '(niet letterlijk bekend)'}`,
    `- Beoordeeld op: ${doc.criteria.length ? doc.criteria.join('; ') : '(zie criteria in de analyse)'}`,
  ]
  if (doc.topics.length) lines.push(`- Verwachte onderwerpen/deelvragen: ${doc.topics.join('; ')}`)
  if (doc.format) lines.push(`- Vorm/format: ${doc.format}`)
  lines.push('- Let ook op: vaste documentopbouw (header met kern-antwoord, genummerde secties per deelvraag met "Beoordeeld op", slotsectie met toezeggingen) en consistente stem/terminologie met de andere stukken.')
  return `${lines.join('\n')}\n\n`
}

/** De eisen die de reviewer voor dít stuk toetst (agent-toetsbaar; stukgebonden + inschrijvingsbreed). */
function reviewableRequirements(request: ReviewDraftRequest): Requirement[] {
  if (!request.analysis) return []
  return requirementsForDocument(request.analysis, request.targetDocument).slice(0, MAX_REQUIREMENT_CHECKS)
}

function formatRequirements(requirements: Requirement[]): string {
  if (!requirements.length) return '- (geen toetsbare eisen in het register)'
  return requirements
    .map(
      (req) =>
        `- id=${req.id} [${req.category}${req.mandatory ? ', verplicht' : ', wens'}] ${req.text}${req.reference ? ` (${req.reference})` : ''}`,
    )
    .join('\n')
}

function formatOpenUserRequirements(request: ReviewDraftRequest): string {
  const list = (request.openUserRequirements ?? []).slice(0, 20)
  if (!list.length) return '- (geen open eisen voor het bidteam)'
  return list
    .map((req) => `- id=${req.id} [${req.category}${req.mandatory ? ', verplicht' : ''}] ${req.text}${req.question ? ` — vraag: ${req.question}` : ''}`)
    .join('\n')
}

/** De bouwstenen waaruit de schrijfagent mocht citeren, met hun verwijzing. */
function formatEvidence(request: ReviewDraftRequest): string {
  const blocks = request.evidence ?? []
  if (!blocks.length) {
    return '- (geen bewijsbouwstenen meegegeven; toets claims dan tegen de bronnen en de antwoorden van het bidteam)'
  }
  return blocks
    .map((block) => `- ${block.handle} [${block.kind}] ${block.title}: ${block.summary}`)
    .join('\n')
}

/** Wat de deterministische bewijscheck al vond; de reviewer herbeoordeelt en vult aan. */
function formatClaimBaseline(request: ReviewDraftRequest): string {
  const claims = (request.claimBaseline ?? []).slice(0, MAX_CLAIM_CHECKS)
  if (!claims.length) return '- (geen)'
  return claims.map((claim) => `- [${claim.status}] "${claim.fragment}" — ${claim.note}`).join('\n')
}

function formatPreviousRound(request: ReviewDraftRequest): string {
  const round = request.round
  if (!round) return '- (eerste ronde; geen eerdere vragen of voorstellen)'
  const lines: string[] = [`- Gereviewde versie vorige ronde: ${round.stage}`]
  if (round.answered.length) {
    lines.push('- Beantwoorde vragen (feitelijke basis — gebruik deze, vraag ze niet opnieuw):')
    round.answered.forEach((item) => lines.push(`  • V: ${item.question}\n    A: ${item.answer}`))
  }
  if (round.approved.length) {
    lines.push('- Goedgekeurde voorstellen (controleer of ze verwerkt zijn):')
    round.approved.forEach((item) =>
      lines.push(`  • ${item.title} — ${item.detail}${item.input ? `\n    Input bidteam: ${item.input}` : ''}${item.processed ? ' [door de schrijfagent verwerkt]' : ' [nog te verwerken]'}`),
    )
  }
  if (round.rejected.length) lines.push(`- Afgewezen voorstellen (niet opnieuw voorstellen): ${round.rejected.join('; ')}`)
  if (round.skipped.length) lines.push(`- Bewust overgeslagen vragen (niet opnieuw stellen): ${round.skipped.join('; ')}`)
  if (round.unanswered.length) lines.push(`- Nog onbeantwoord (mag herhaald worden als het nog nodig is): ${round.unanswered.join('; ')}`)
  return lines.join('\n')
}

function formatAnalysis(analysis: TenderAnalysis | null): string {
  if (!analysis) return 'Geen leidraadanalyse beschikbaar — beoordeel op basis van bronnen en het concept.'

  const lines = [
    `- Samenvatting: ${analysis.summary}`,
    `- Leidraad gevonden: ${analysis.leidraadFound ? 'ja' : 'nee'}`,
  ]

  // Omvangslimieten expliciet meegeven: overschrijding is een vormfout waarop de
  // inschrijving terzijde kan worden gelegd, dus de reviewer moet erop letten.
  const limits = formatLimits(limitsForAnalysis(analysis))
  if (limits) lines.push(`- Omvangslimiet (hard): ${limits}`)

  const mandatory = (analysis.contentRequirements ?? []).filter((req) => req.mandatory)
  if (mandatory.length) {
    lines.push('- Verplichte onderwerpen:')
    mandatory.forEach((req) => lines.push(`  • ${req.topic} — ${req.detail}`))
  }

  if ((analysis.evaluationCriteria ?? []).length) {
    lines.push('- Beoordelingscriteria:')
    analysis.evaluationCriteria.forEach((criterion) => lines.push(`  • ${criterion}`))
  }

  const mandatorySubmission = (analysis.submissionRequirements ?? []).filter((req) => req.mandatory)
  if (mandatorySubmission.length) {
    lines.push('- Verplichte eisen aan de inschrijving (hard):')
    mandatorySubmission.forEach((req) => lines.push(`  • [${req.category}] ${req.requirement}`))
  }

  if (analysis.underlyingIntent) {
    lines.push(`- Vraag achter de vraag: ${analysis.underlyingIntent.questionBehindQuestion}`)
    lines.push(`- Onderliggende behoefte: ${analysis.underlyingIntent.underlyingNeed}`)
  }

  if ((analysis.gaps ?? []).length) {
    lines.push('- Bekende gaten:')
    analysis.gaps.forEach((gap) => lines.push(`  • ${gap}`))
  }

  return lines.join('\n')
}

/**
 * Stabiel bronnenblok als eerste user-bericht: identiek over herhaalde reviews
 * van hetzelfde project, zodat de cache-marker (zie aiClient) hits oplevert.
 * Alles wat per review verandert (baseline, opmerkingen, concept) staat in het
 * taakblok erna.
 */
function buildSourcesPrompt(request: ReviewDraftRequest): string {
  return `=== BRONNEN ===
${formatDocuments(request)}`
}

function buildTaskPrompt(request: ReviewDraftRequest): string {
  return `Fase: ${stageLabels[request.stage]}
Focus van deze verbeterronde: ${STAGE_FOCUS[request.stage]}

Project:
- Titel: ${request.project.title}
- Opdrachtgever: ${request.project.buyer}
- Deadline: ${request.project.deadline}
- TenderNed: ${request.project.tendernedId}

${formatTargetDocument(request)}Leidraadanalyse:
${formatAnalysis(request.analysis)}

Eisenregister — toets elke eis (requirementChecks):
${formatRequirements(reviewableRequirements(request))}

Open eisen die het bidteam zelf moet afdekken (kandidaat-informatievragen; blijkt de eis al uit de bronnen, stel dan geen vraag):
${formatOpenUserRequirements(request)}

Bewijsbibliotheek — hiernaar mag het concept verwijzen met [bewijs:…]:
${formatEvidence(request)}

Bewijscheck-baseline (deterministisch gevonden claims — herbeoordeel en vul aan):
${formatClaimBaseline(request)}

Vorige verbeterronde:
${formatPreviousRound(request)}

Heuristische baseline (al gesignaleerd — NIET herhalen, wel aanvullen):
${formatBaseline(request.baseline)}

Open menselijke reviewopmerkingen (betrek in je oordeel):
${formatComments(request)}

De bronnen staan in het vorige bericht.

=== CONCEPT (platte tekst) ===
${draftToPlainText(request.draft) || '(leeg concept)'}

Lever je reviewbevindingen als JSON.`
}

function normalizePriority(value: unknown): ReviewPriority {
  return value === 'kritiek' || value === 'hoog' ? value : value === 'normaal' ? 'normaal' : 'hoog'
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseInformationRequests(value: unknown, knownRequirementIds: Set<string>): ReviewInformationRequest[] {
  if (!Array.isArray(value)) return []
  return value
    .map((raw): ReviewInformationRequest | null => {
      if (!raw || typeof raw !== 'object') return null
      const item = raw as Record<string, unknown>
      const question = str(item.question)
      if (!question) return null
      const requirementId = str(item.requirementId)
      return {
        question,
        reason: str(item.reason) || 'Nodig voor een feitelijk onderbouwde volgende versie.',
        section: str(item.section) || undefined,
        requirementId: knownRequirementIds.has(requirementId) ? requirementId : undefined,
        priority: normalizePriority(item.priority),
      }
    })
    .filter((item): item is ReviewInformationRequest => item !== null)
    .slice(0, MAX_INFORMATION_REQUESTS)
}

function parseProposals(value: unknown): ReviewProposal[] {
  if (!Array.isArray(value)) return []
  return value
    .map((raw): ReviewProposal | null => {
      if (!raw || typeof raw !== 'object') return null
      const item = raw as Record<string, unknown>
      const title = str(item.title)
      const detail = str(item.detail)
      if (!title || !detail) return null
      return {
        kind: str(item.kind) === 'overtreffen' ? 'overtreffen' : 'verbeteren',
        title,
        detail,
        rationale: str(item.rationale) || 'Verhoogt de score op de beoordelingscriteria.',
        section: str(item.section) || undefined,
        criterion: str(item.criterion) || undefined,
        needsInput: str(item.needsInput) || undefined,
      }
    })
    .filter((item): item is ReviewProposal => item !== null)
    .slice(0, MAX_PROPOSALS)
}

function parseClaimChecks(value: unknown): ClaimCheckItem[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value
    .map((raw): ClaimCheckItem | null => {
      if (!raw || typeof raw !== 'object') return null
      const item = raw as Record<string, unknown>
      const fragment = str(item.fragment).slice(0, CLAIM_FRAGMENT_CHARS)
      if (!fragment) return null
      const key = fragment.toLowerCase()
      if (seen.has(key)) return null
      seen.add(key)
      // Bij twijfel geldt een claim als onbewezen: liever een keer te veel uitvragen dan
      // met een onbewijsbare bewering indienen.
      const status = str(item.status) === 'onderbouwd' ? 'onderbouwd' : 'onbewezen'
      return {
        fragment,
        status,
        evidence: str(item.evidence) || undefined,
        note: str(item.note) || (status === 'onbewezen' ? 'Geen bron of bouwsteen gevonden die deze claim draagt.' : ''),
      }
    })
    .filter((item): item is ClaimCheckItem => item !== null)
    .slice(0, MAX_CLAIM_CHECKS)
}

function parseReview(
  content: string,
  requirements: Requirement[],
  knownRequirementIds: Set<string>,
): {
  findings: ReviewFindingItem[]
  requirementChecks: RequirementCheck[]
  informationRequests: ReviewInformationRequest[]
  proposals: ReviewProposal[]
  claimChecks: ClaimCheckItem[]
} {
  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim()
  let parsed: {
    findings?: unknown
    requirementChecks?: unknown
    informationRequests?: unknown
    proposals?: unknown
    claimChecks?: unknown
  }
  try {
    parsed = JSON.parse(jsonText) as typeof parsed
  } catch {
    return { findings: [], requirementChecks: [], informationRequests: [], proposals: [], claimChecks: [] }
  }

  const findings = Array.isArray(parsed.findings)
    ? parsed.findings
        .map((raw): ReviewFindingItem | null => {
          if (!raw || typeof raw !== 'object') return null
          const item = raw as Record<string, unknown>
          const title = typeof item.title === 'string' ? item.title.trim() : ''
          const detail = typeof item.detail === 'string' ? item.detail.trim() : ''
          if (!title || !detail) return null
          return { priority: normalizePriority(item.priority), title, detail }
        })
        .filter((item): item is ReviewFindingItem => item !== null)
    : []

  return {
    findings,
    requirementChecks: normalizeRequirementChecks(parsed.requirementChecks, requirements),
    informationRequests: parseInformationRequests(parsed.informationRequests, knownRequirementIds),
    proposals: parseProposals(parsed.proposals),
    claimChecks: parseClaimChecks(parsed.claimChecks),
  }
}

/** Onbewezen claims worden ook bevindingen: zonder bewijs indienen is een reëel risico. */
function findingsFromClaims(claims: ClaimCheckItem[]): ReviewFindingItem[] {
  return claims
    .filter((claim) => claim.status === 'onbewezen')
    .slice(0, 5)
    .map((claim) => ({
      priority: 'hoog' as const,
      title: `Claim zonder bewijs: ${claim.fragment.length > 80 ? `${claim.fragment.slice(0, 77)}…` : claim.fragment}`,
      detail: `${claim.note} Koppel er een bouwsteen uit de bewijsbibliotheek aan of schrap de claim.`,
    }))
}

/** Niet-voldane eisen worden ook als bevinding zichtbaar: verplicht = kritiek, wens = hoog. */
function findingsFromChecks(checks: RequirementCheck[], requirements: Requirement[]): ReviewFindingItem[] {
  const byId = new Map(requirements.map((req) => [req.id, req]))
  return checks
    .filter((check) => check.met === false)
    .map((check): ReviewFindingItem | null => {
      const req = byId.get(check.id)
      if (!req) return null
      return {
        priority: req.mandatory ? 'kritiek' : 'hoog',
        title: `Eis niet voldaan: ${req.text.length > 90 ? `${req.text.slice(0, 87)}…` : req.text}`,
        detail: `${check.note || 'Het concept voldoet niet aantoonbaar aan deze eis.'} (${req.source}${req.reference ? `, ${req.reference}` : ''})`,
      }
    })
    .filter((item): item is ReviewFindingItem => item !== null)
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Baseline (deterministische feiten) + AI-bevindingen, ontdubbeld op titel, geordend op prioriteit. */
function mergeFindings(baseline: ReviewFindingItem[], aiFindings: ReviewFindingItem[]): ReviewFindingItem[] {
  const seen = new Set<string>()
  const merged: ReviewFindingItem[] = []

  for (const item of [...baseline, ...aiFindings]) {
    const key = normalizeTitle(item.title)
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }

  return merged
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    .slice(0, MAX_FINDINGS)
}

export async function handleReviewDraftRequest(request: ReviewDraftRequest): Promise<Response> {
  if (!request.draft?.trim()) {
    return Response.json({ error: 'Geen concept om te reviewen.' }, { status: 400 })
  }

  const baseline = Array.isArray(request.baseline) ? request.baseline : []

  let ai: ReturnType<typeof resolveAiFromRequest>
  try {
    ai = resolveAiFromRequest(request.ai, 'REVIEW_MODEL', 'analysis')
  } catch {
    // Geen AI-reviewagent geconfigureerd → lever de heuristische baseline ongewijzigd terug.
    return Response.json({
      findings: baseline,
      provider: 'heuristiek',
      model: 'lokaal',
      enriched: false,
    } satisfies ReviewDraftResponse)
  }

  try {
    const content = await completeChat(
      ai,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildSourcesPrompt(request) },
        { role: 'user', content: buildTaskPrompt(request) },
      ],
      {
        jsonMode: ai.provider !== 'anthropic',
        // Bevindingen, oordeel per eis, informatievragen en voorstellen.
        maxTokens: 8_000,
        timeoutMs: 120_000,
        useThinking: false,
        // Herhaalde reviews van hetzelfde project herlezen het bronnenblok;
        // 1h-TTL omdat een review-fix-cyclus doorgaans langer dan 5 min duurt.
        cachePrompt: true,
        cacheTtl: '1h',
        label: 'ai-review',
      },
    )

    const requirements = reviewableRequirements(request)
    const knownRequirementIds = new Set((request.analysis?.requirements ?? []).map((req) => req.id))
    const { findings: aiFindings, requirementChecks, informationRequests, proposals, claimChecks } = parseReview(
      content,
      requirements,
      knownRequirementIds,
    )

    return Response.json({
      findings: mergeFindings(baseline, [
        ...findingsFromChecks(requirementChecks, requirements),
        ...findingsFromClaims(claimChecks),
        ...aiFindings,
      ]),
      provider: ai.provider,
      model: ai.model,
      enriched:
        aiFindings.length > 0 ||
        requirementChecks.length > 0 ||
        informationRequests.length > 0 ||
        proposals.length > 0 ||
        claimChecks.length > 0,
      requirementChecks,
      informationRequests,
      proposals,
      claimChecks,
    } satisfies ReviewDraftResponse)
  } catch {
    // AI-call mislukt → val terug op de baseline zodat de review altijd iets oplevert.
    return Response.json({
      findings: baseline,
      provider: 'heuristiek',
      model: 'lokaal',
      enriched: false,
    } satisfies ReviewDraftResponse)
  }
}
