import { getApiConfig, isReviewConfigured, isWriterConfigured } from './apiConfig'
import type { SourceDocument, SourceType, TenderAnalysis } from '../types/tenderAnalysis'
import type { LessonAiConfig } from '../types/lessonLearned'
import type {
  CompareProjectInput,
  CompareProjectsResponse,
} from '../types/compareProjects'

type ApiError = { error: string }

/** Werkruimte-snapshot zoals bewaard per dossier (zie WorkspacePage). */
export type CompareSnapshot = {
  project: { title: string; buyer: string; deadline: string }
  documents: SourceDocument[]
  stage: string
  draft: string
  analysis: TenderAnalysis | null
}

const EXCERPT_CHAR_LIMIT = 8_000

const sourceTypeLabels: Record<SourceType, string> = {
  tender: 'aanbesteding',
  company: 'bedrijfsinfo',
  rules: 'schrijfregels',
  training: 'schrijfstijl',
}

/** Review-config indien ingesteld, anders writer-config — gelijk aan de leerpunt-endpoints. */
function buildAi(): LessonAiConfig | undefined {
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
  }
}

function draftToPlainText(html: string): string {
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
  }
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Haalt de koppen (h1–h3) uit het concept op: de opbouw van het plan van aanpak. */
export function extractHeadings(html: string): string[] {
  if (typeof DOMParser === 'undefined') return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(doc.querySelectorAll('h1, h2, h3'))
    .map((node) => node.textContent?.trim() ?? '')
    .filter((text): text is string => text.length > 0)
}

export function countWords(html: string): number {
  const text = draftToPlainText(html)
  return text ? text.split(/\s+/).length : 0
}

/** Korte omschrijving van de gebruikte bronnen, gegroepeerd per type. */
export function summariseDocuments(documents: SourceDocument[]): string {
  const byType = new Map<SourceType, string[]>()
  documents.forEach((doc) => {
    const list = byType.get(doc.type) ?? []
    list.push(doc.name)
    byType.set(doc.type, list)
  })
  return Array.from(byType.entries())
    .map(([type, names]) => `${sourceTypeLabels[type]} (${names.length}): ${names.join(', ')}`)
    .join('; ')
}

/** Zet een dossier-snapshot om naar de compacte AI-vergelijkingsinput. */
export function buildCompareInput(id: string, snapshot: CompareSnapshot): CompareProjectInput {
  return {
    id,
    title: snapshot.project.title,
    buyer: snapshot.project.buyer,
    deadline: snapshot.project.deadline,
    stage: snapshot.stage,
    analysisSummary: snapshot.analysis?.summary ?? '',
    evaluationCriteria: snapshot.analysis?.evaluationCriteria ?? [],
    documentOverview: summariseDocuments(snapshot.documents),
    headings: extractHeadings(snapshot.draft),
    wordCount: countWords(snapshot.draft),
    draftExcerpt: draftToPlainText(snapshot.draft).slice(0, EXCERPT_CHAR_LIMIT),
  }
}

export async function compareProjectsViaApi(
  projects: CompareProjectInput[],
): Promise<CompareProjectsResponse> {
  const response = await fetch('/api/insights?action=compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projects, ai: buildAi() }),
  })
  const data = (await response.json()) as CompareProjectsResponse | ApiError
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'AI-vergelijking mislukt.')
  }
  return data
}
