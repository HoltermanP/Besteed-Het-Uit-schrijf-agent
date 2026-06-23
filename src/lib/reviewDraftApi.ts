import { getApiConfig, isReviewConfigured, isWriterConfigured } from './apiConfig'
import type {
  ReviewDraftError,
  ReviewDraftRequest,
  ReviewDraftResponse,
  ReviewFindingItem,
} from '../types/reviewDraft'
import type { SourceDocument, TenderAnalysis } from '../types/tenderAnalysis'

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
  baseline: ReviewFindingItem[]
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
    baseline: args.baseline,
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
    }
  }

  try {
    const response = await fetch('/api/review-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
