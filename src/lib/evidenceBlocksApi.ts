import { getApiConfig, isReviewConfigured, isWriterConfigured } from './apiConfig'
import { getActiveCompanyId } from './companies'
import { evidenceHandle, evidenceSummary, isCitable } from './evidence'
import type { TenderAnalysis } from '../types/tenderAnalysis'
import type {
  EvidenceAiConfig,
  EvidenceBlock,
  EvidenceBlockInput,
  EvidenceBlockPatch,
  SelectEvidenceResponse,
} from '../types/evidenceBlock'
import { usageHeaders } from './usageScope'

type BlocksResponse = { blocks: EvidenceBlock[] }
type BlockResponse = { block: EvidenceBlock }
type ApiError = { error: string }

/** AI-config voor de bewijsselectie: review-config indien ingesteld, anders die van de schrijver. */
function buildAi(): EvidenceAiConfig | undefined {
  const apiConfig = getApiConfig()
  const section = isReviewConfigured(apiConfig)
    ? apiConfig.review
    : isWriterConfigured(apiConfig)
      ? apiConfig.writer
      : null
  if (!section) return undefined
  return {
    provider: section.provider,
    baseUrl: section.baseUrl,
    apiKey: section.apiKey,
    model: section.model,
    testMode: apiConfig.testMode || undefined,
  }
}

export async function fetchEvidenceBlocks(): Promise<EvidenceBlock[]> {
  const response = await fetch(`/api/evidence?companyId=${encodeURIComponent(getActiveCompanyId())}`)
  const data = (await response.json()) as BlocksResponse | ApiError
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'Bewijsbibliotheek ophalen mislukt.')
  }
  return data.blocks
}

export async function createEvidenceBlock(input: EvidenceBlockInput): Promise<EvidenceBlock> {
  const response = await fetch('/api/evidence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...usageHeaders() },
    body: JSON.stringify({ ...input, companyId: getActiveCompanyId() }),
  })
  const data = (await response.json()) as BlockResponse | ApiError
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'Bouwsteen opslaan mislukt.')
  }
  return data.block
}

export async function updateEvidenceBlock(patch: EvidenceBlockPatch): Promise<EvidenceBlock> {
  const response = await fetch('/api/evidence', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...usageHeaders() },
    body: JSON.stringify({ ...patch, companyId: getActiveCompanyId() }),
  })
  const data = (await response.json()) as BlockResponse | ApiError
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'Bouwsteen bijwerken mislukt.')
  }
  return data.block
}

export async function deleteEvidenceBlock(id: string): Promise<void> {
  const response = await fetch(
    `/api/evidence?id=${encodeURIComponent(id)}&companyId=${encodeURIComponent(getActiveCompanyId())}`,
    { method: 'DELETE' },
  )
  const data = (await response.json()) as { ok?: boolean; error?: string }
  if (!response.ok || data.error) {
    throw new Error(data.error ?? 'Bouwsteen verwijderen mislukt.')
  }
}

/**
 * Laat de AI de bouwstenen kiezen die bij dit stuk horen. Alleen citeerbare bouwstenen
 * doen mee: zonder vastgelegd bewijs is het een aanname en die hoort de schrijfagent
 * niet te zien. Geeft bij een storing de citeerbare bouwstenen ongefilterd terug, zodat
 * de agent nooit zonder bewijs komt te zitten.
 */
export async function selectRelevantEvidence(args: {
  project: { title: string; buyer: string }
  analysis: TenderAnalysis | null
  document?: { title: string; question: string }
  tenderSummary?: string
  candidates: EvidenceBlock[]
}): Promise<EvidenceBlock[]> {
  const citable = args.candidates.filter((block) => isCitable(block))
  if (!citable.length) return []

  try {
    const response = await fetch('/api/evidence?action=select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...usageHeaders() },
      body: JSON.stringify({
        project: args.project,
        analysis: args.analysis,
        document: args.document,
        tenderSummary: args.tenderSummary,
        candidates: citable.map((block) => ({
          id: block.id,
          handle: evidenceHandle(block.id),
          kind: block.kind,
          title: block.title,
          client: block.client,
          category: block.category,
          summary: evidenceSummary(block),
        })),
        ai: buildAi(),
      }),
    })

    const data = (await response.json()) as SelectEvidenceResponse | ApiError
    if (!response.ok || 'error' in data) return citable

    const byId = new Map(citable.map((block) => [block.id, block]))
    const selected = data.selected
      .map((item) => byId.get(item.id))
      .filter((block): block is EvidenceBlock => Boolean(block))
    return selected.length ? selected : citable
  } catch {
    return citable
  }
}
