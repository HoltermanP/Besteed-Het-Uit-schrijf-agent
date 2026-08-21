import { buildStartDraft, isStartDraft } from './buildDraft'
import { FALLBACK_DOCUMENT_ID, writableDocuments } from './requestedDocuments'
import type { DossierSnapshot, DraftDocument, ReviewComment, SourceDocument, Stage, TenderProject } from '../types/dossier'
import type { RequestedDocument, TenderAnalysis } from '../types/tenderAnalysis'

/**
 * Meerdere stukken per project: elk op te stellen document (uit de leidraadanalyse of
 * handmatig toegevoegd) heeft een eigen concept, stadium en opmerkingen. Deze helpers
 * migreren oudere dossiers (één concept) en houden de lijst in lijn met de analyse.
 */

/** Id van het enige stuk in oudere dossiers; valt samen met het standaard-inschrijfstuk. */
export const LEGACY_DRAFT_ID = FALLBACK_DOCUMENT_ID

const nowIso = () => new Date().toISOString()

export function makeDraftDocument(input: {
  requested: RequestedDocument
  project: TenderProject
  documents: SourceDocument[]
  source: DraftDocument['source']
  html?: string
  stage?: Stage
  comments?: ReviewComment[]
}): DraftDocument {
  return {
    id: input.requested.id,
    title: input.requested.title,
    source: input.source,
    requested: input.requested,
    stage: input.stage ?? 'brons',
    html: input.html ?? buildStartDraft(input.project, input.documents, input.requested),
    comments: input.comments ?? [],
    updatedAt: nowIso(),
  }
}

/** Een handmatig toegevoegd stuk: de gebruiker geeft titel en (optioneel) de vraag. */
export function makeCustomRequestedDocument(title: string, question: string, existingIds: string[]): RequestedDocument {
  const base = title.trim() || 'Eigen stuk'
  const slug = base
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  let id = `eigen-${slug || 'stuk'}`
  let counter = 2
  while (existingIds.includes(id)) id = `eigen-${slug || 'stuk'}-${counter++}`
  return {
    id,
    title: base,
    kind: 'schrijfstuk',
    question: question.trim(),
    criteria: [],
    topics: [],
    wordLimits: [],
    mandatory: false,
    source: 'handmatig toegevoegd',
  }
}

/**
 * Lees de stukken uit een (mogelijk ouder) dossier. Ontbreekt `drafts`, dan wordt het
 * enkele concept (`draft`/`stage`/`comments`) als enig stuk opgevoerd. Bestaat er een
 * analyse, dan worden de schrijfstukken daaruit direct aangevuld.
 */
export function loadDraftsFromSnapshot(
  snapshot: Pick<DossierSnapshot, 'drafts' | 'activeDraftId' | 'draft' | 'stage' | 'comments' | 'analysis'> | null,
  project: TenderProject,
  documents: SourceDocument[],
  legacy: { draft: string; stage: Stage; comments: ReviewComment[] },
): { drafts: DraftDocument[]; activeDraftId: string } {
  const analysis = snapshot?.analysis ?? null
  let drafts: DraftDocument[] = Array.isArray(snapshot?.drafts) && snapshot!.drafts!.length
    ? snapshot!.drafts!.map((draft) => ({
        ...draft,
        comments: Array.isArray(draft.comments) ? draft.comments : [],
        requested: draft.requested ?? { ...writableDocuments(analysis)[0], id: draft.id, title: draft.title },
      }))
    : [
        makeDraftDocument({
          requested: { ...writableDocuments(analysis)[0], id: LEGACY_DRAFT_ID },
          project,
          documents,
          source: 'analyse',
          html: legacy.draft,
          stage: legacy.stage,
          comments: legacy.comments,
        }),
      ]

  drafts = reconcileDrafts(drafts, analysis, project, documents)

  const activeDraftId =
    snapshot?.activeDraftId && drafts.some((draft) => draft.id === snapshot.activeDraftId)
      ? snapshot.activeDraftId
      : drafts[0].id
  return { drafts, activeDraftId }
}

/**
 * Breng de stukken in lijn met de (nieuwe) analyse:
 * - elk schrijfstuk uit de analyse krijgt een concept (bestaande concepten blijven staan,
 *   alleen de opdracht/titel wordt ververst);
 * - niet-gestarte analysestukken die de analyse niet meer noemt, vervallen;
 * - geschreven stukken en eigen stukken blijven altijd behouden.
 */
export function reconcileDrafts(
  current: DraftDocument[],
  analysis: TenderAnalysis | null,
  project: TenderProject,
  documents: SourceDocument[],
): DraftDocument[] {
  const writable = writableDocuments(analysis)
  const writableIds = new Set(writable.map((doc) => doc.id))
  const byId = new Map(current.map((draft) => [draft.id, draft]))

  const fromAnalysis: DraftDocument[] = writable.map((requested) => {
    const existing = byId.get(requested.id)
    if (!existing) return makeDraftDocument({ requested, project, documents, source: 'analyse' })
    const html = isStartDraft(existing.html) ? buildStartDraft(project, documents, requested) : existing.html
    return { ...existing, title: requested.title, requested, html, source: 'analyse' }
  })

  const rest = current.filter((draft) => {
    if (writableIds.has(draft.id)) return false
    if (draft.source === 'eigen') return true
    // Analysestuk dat niet meer terugkomt: alleen bewaren als er al in geschreven is.
    return !isStartDraft(draft.html)
  })

  return [...fromAnalysis, ...rest]
}

/** Leesbare status van een stuk voor de documentenlijst. */
export function draftStatusLabel(draft: DraftDocument): 'niet gestart' | 'brons' | 'zilver' | 'goud' {
  return isStartDraft(draft.html) ? 'niet gestart' : draft.stage
}
