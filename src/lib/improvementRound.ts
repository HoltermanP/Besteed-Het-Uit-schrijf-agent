import type { ImprovementProposal, ImprovementRound, InformationRequest, Stage } from '../types/dossier'
import type { ReviewDraftResponse, ReviewRoundContext } from '../types/reviewDraft'
import type { Requirement } from '../types/tenderAnalysis'
import type { WriteDraftImprovements } from '../types/writeDraft'

/**
 * Verbeterronde tussen de stadia: de AI-review vraagt gericht informatie op en doet
 * voorstellen (verbeteren / overtreffen); de gebruiker beantwoordt en keurt goed; pas
 * daarna verwerkt de schrijfagent ze in de volgende versie. Deze helpers houden de ronde
 * per stuk bij en vertalen haar naar de prompts van reviewer en schrijfagent.
 */

export const nextStageFor = (stage: Stage): Stage => (stage === 'brons' ? 'zilver' : 'goud')

const makeId = () => Math.random().toString(36).slice(2, 10)

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Nieuwe reviewuitkomst samenvoegen met de vorige ronde van dit stuk: beantwoorde vragen en
 * beoordeelde voorstellen blijven staan (feiten en besluiten gaan mee naar latere versies);
 * nieuwe vragen/voorstellen komen erbij, zonder herhaling van wat al gesteld of besloten is.
 */
export function mergeRound(
  previous: ImprovementRound | null | undefined,
  stage: Stage,
  response: Pick<ReviewDraftResponse, 'informationRequests' | 'proposals' | 'provider' | 'model'>,
): ImprovementRound {
  const keptRequests = (previous?.informationRequests ?? []).filter((item) => item.status !== 'open')
  const keptProposals = (previous?.proposals ?? []).filter((item) => item.status !== 'voorgesteld')
  const seenQuestions = new Set(keptRequests.map((item) => normalize(item.question)))
  const seenTitles = new Set(keptProposals.map((item) => normalize(item.title)))

  const informationRequests: InformationRequest[] = [...keptRequests]
  for (const item of response.informationRequests ?? []) {
    const key = normalize(item.question)
    if (!key || seenQuestions.has(key)) continue
    seenQuestions.add(key)
    informationRequests.push({
      id: `vraag-${makeId()}`,
      question: item.question,
      reason: item.reason,
      section: item.section,
      requirementId: item.requirementId,
      priority: item.priority,
      status: 'open',
      askedAtStage: stage,
    })
  }

  const proposals: ImprovementProposal[] = [...keptProposals]
  for (const item of response.proposals ?? []) {
    const key = normalize(item.title)
    if (!key || seenTitles.has(key)) continue
    seenTitles.add(key)
    proposals.push({
      id: `voorstel-${makeId()}`,
      kind: item.kind,
      title: item.title,
      detail: item.detail,
      rationale: item.rationale,
      section: item.section,
      criterion: item.criterion,
      needsInput: item.needsInput,
      status: 'voorgesteld',
      proposedAtStage: stage,
    })
  }

  return {
    stage,
    reviewedAt: new Date().toISOString(),
    provider: response.provider,
    model: response.model,
    informationRequests,
    proposals,
  }
}

/**
 * Zonder AI-reviewer: stel de open eisen die het bidteam zelf moet afdekken als
 * informatievragen, zodat de ronde ook dan gericht uitvraagt.
 */
export function roundFromOpenRequirements(
  previous: ImprovementRound | null | undefined,
  stage: Stage,
  openUserRequirements: Requirement[],
): ImprovementRound {
  return mergeRound(previous, stage, {
    provider: 'heuristiek',
    model: 'lokaal',
    informationRequests: openUserRequirements
      .filter((req) => req.question)
      .slice(0, 10)
      .map((req) => ({
        question: req.question!,
        reason: `Open eis uit het register (${req.source}): ${req.text}`,
        requirementId: req.id,
        priority: req.mandatory ? 'hoog' : 'normaal',
      })),
    proposals: [],
  })
}

/** Context van de vorige ronde voor de reviewer (niet herhalen; verwerking controleren). */
export function roundToReviewContext(round: ImprovementRound | null | undefined): ReviewRoundContext | undefined {
  if (!round) return undefined
  return {
    stage: round.stage,
    answered: round.informationRequests
      .filter((item) => item.status === 'beantwoord' && item.answer?.trim())
      .map((item) => ({ question: item.question, answer: item.answer!.trim() })),
    unanswered: round.informationRequests.filter((item) => item.status === 'open').map((item) => item.question),
    skipped: round.informationRequests.filter((item) => item.status === 'overgeslagen').map((item) => item.question),
    approved: round.proposals
      .filter((item) => item.status === 'goedgekeurd' || item.status === 'verwerkt')
      .map((item) => ({ title: item.title, detail: item.detail, input: item.input, processed: item.status === 'verwerkt' })),
    rejected: round.proposals.filter((item) => item.status === 'afgewezen').map((item) => item.title),
  }
}

/** Wat de schrijfagent mag verwerken: goedgekeurde voorstellen en gegeven antwoorden; de rest is verboden terrein. */
export function roundToImprovements(round: ImprovementRound | null | undefined): WriteDraftImprovements | undefined {
  if (!round) return undefined
  const approvedProposals = round.proposals
    .filter((item) => item.status === 'goedgekeurd')
    .map((item) => ({
      kind: item.kind,
      title: item.title,
      detail: item.detail,
      rationale: item.rationale,
      section: item.section,
      input: item.input?.trim() || undefined,
    }))
  const answers = round.informationRequests
    .filter((item) => item.status === 'beantwoord' && item.answer?.trim())
    .map((item) => ({ question: item.question, answer: item.answer!.trim(), section: item.section }))
  const unanswered = round.informationRequests
    .filter((item) => item.status !== 'beantwoord')
    .map((item) => ({ question: item.question, reason: item.reason, section: item.section }))
  if (!approvedProposals.length && !answers.length && !unanswered.length) return undefined
  return { approvedProposals, answers, unanswered }
}

/** Na verwerking door de schrijfagent: goedgekeurde voorstellen zijn verwerkt. */
export function markRoundProcessed(round: ImprovementRound): ImprovementRound {
  return {
    ...round,
    proposals: round.proposals.map((item) => (item.status === 'goedgekeurd' ? { ...item, status: 'verwerkt' } : item)),
  }
}

export function summarizeRound(round: ImprovementRound | null | undefined) {
  const requests = round?.informationRequests ?? []
  const proposals = round?.proposals ?? []
  return {
    openQuestions: requests.filter((item) => item.status === 'open').length,
    answered: requests.filter((item) => item.status === 'beantwoord').length,
    pendingProposals: proposals.filter((item) => item.status === 'voorgesteld').length,
    approved: proposals.filter((item) => item.status === 'goedgekeurd').length,
    /** Goedgekeurd maar nog zonder de feitelijke input die het voorstel vereist. */
    approvedMissingInput: proposals.filter((item) => item.status === 'goedgekeurd' && item.needsInput && !item.input?.trim())
      .length,
    hasWork: proposals.some((item) => item.status === 'goedgekeurd') || requests.some((item) => item.status === 'beantwoord'),
    isEmpty: !requests.length && !proposals.length,
  }
}
