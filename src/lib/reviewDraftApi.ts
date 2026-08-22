import { getApiConfig, isReviewConfigured, isWriterConfigured } from './apiConfig'
import type {
  ClaimCheckItem,
  ReviewDraftError,
  ReviewDraftRequest,
  ReviewDraftResponse,
  ReviewFindingItem,
  ReviewRoundContext,
} from '../types/reviewDraft'
import type { EvidenceBlock } from '../types/evidenceBlock'
import { evidenceForReview } from './evidence'
import type { RequestedDocument, Requirement, SourceDocument, TenderAnalysis } from '../types/tenderAnalysis'
import { usageHeaders } from './usageScope'

type ReviewComment = {
  fragment: string
  note: string
  resolved: boolean
}

async function readApiJson<T>(response: Response): Promise<T | ReviewDraftError> {
  const raw = await response.text()
  if (!raw.trim()) {
    return { error: 'Lege serverrespons ontvangen.' }
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return { error: 'Ongeldige serverrespons bij review.' }
  }
}

/**
 * Vraagt de AI-reviewagent om de heuristische baseline aan te vullen.
 * Gebruikt de toegewijde review-config; valt terug op de writer-config wanneer
 * alleen die is ingesteld. Geeft `null` terug bij fouten, zodat de UI de
 * heuristische baseline kan blijven tonen.
 */
export async function reviewDraftViaApi(args: {
  stage: ReviewDraftRequest['stage']
  project: ReviewDraftRequest['project']
  draft: string
  documents: SourceDocument[]
  comments: ReviewComment[]
  analysis: TenderAnalysis | null
  /** Het stuk dat gereviewd wordt (bij meerdere stukken per inschrijving). */
  targetDocument?: RequestedDocument
  baseline: ReviewFindingItem[]
  /** Open eisen die het bidteam zelf moet afdekken (kandidaat-informatievragen). */
  openUserRequirements?: Requirement[]
  /** Vorige verbeterronde van dit stuk. */
  round?: ReviewRoundContext
  /** De bouwstenen die bij dit stuk zijn toegepast; hiertegen toetst de reviewer de claims. */
  evidence?: EvidenceBlock[]
  /** Wat de deterministische bewijscheck al vond. */
  claimBaseline?: ClaimCheckItem[]
}): Promise<ReviewDraftResponse | null> {
  const payload: ReviewDraftRequest = {
    stage: args.stage,
    project: args.project,
    draft: args.draft,
    documents: args.documents.map((doc) => ({
      name: doc.name,
      type: doc.type,
      content: doc.content,
    })),
    comments: args.comments.map((comment) => ({
      fragment: comment.fragment,
      note: comment.note,
      resolved: comment.resolved,
    })),
    analysis: args.analysis,
    targetDocument: args.targetDocument,
    baseline: args.baseline,
    openUserRequirements: args.openUserRequirements,
    round: args.round,
    evidence: args.evidence?.length ? evidenceForReview(args.evidence) : undefined,
    claimBaseline: args.claimBaseline?.length ? args.claimBaseline : undefined,
  }

  const apiConfig = getApiConfig()
  const aiSection = isReviewConfigured(apiConfig)
    ? apiConfig.review
    : isWriterConfigured(apiConfig)
      ? apiConfig.writer
      : null

  if (aiSection) {
    payload.ai = {
      provider: aiSection.provider,
      baseUrl: aiSection.baseUrl,
      apiKey: aiSection.apiKey,
      model: aiSection.model,
      testMode: apiConfig.testMode || undefined,
    }
  }

  try {
    const response = await fetch('/api/review-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...usageHeaders() },
      body: JSON.stringify(payload),
    })

    const data = await readApiJson<ReviewDraftResponse>(response)
    if (!response.ok || 'error' in data) {
      return null
    }
    return data
  } catch {
    return null
  }
}
