import { buildStartDraft } from './buildDraft'
import { loadDossier, saveDossier, setActiveDossierId } from './dossier'
import { makeProjectId, upsertProject } from './projects'
import type { DossierSnapshot, SourceDocument, TenderProject } from '../types/dossier'
import type { SavedTender } from '../types/tenderNed'

// Aanmaken van projecten (blanco of vanuit een gedownloade aanbesteding), gedeeld
// door het projectenoverzicht, de TenderNed-catalogus en de werkplek. Elk project
// krijgt direct een opgeslagen dossier-snapshot, zodat /projecten/[id] altijd kan openen.

const makeId = () => Math.random().toString(36).slice(2, 10)

const nowImportedLabel = () =>
  new Date().toLocaleString('nl-NL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

/** Tekstbronnen die een aanbesteding aan een project toevoegt (volledige tekst + samenvatting). */
export function buildTenderSourceDocuments(tender: SavedTender): SourceDocument[] {
  const documents: SourceDocument[] = [
    {
      id: makeId(),
      name: tender.aanbestedingNaam,
      type: 'tender',
      content: tender.documentText || tender.opdrachtBeschrijving,
      importedAt: nowImportedLabel(),
    },
  ]
  if (tender.opdrachtBeschrijving && tender.opdrachtBeschrijving !== tender.documentText) {
    documents.push({
      id: makeId(),
      name: `${tender.aanbestedingNaam} — samenvatting`,
      type: 'tender',
      content: tender.opdrachtBeschrijving,
      importedAt: nowImportedLabel(),
    })
  }
  return documents
}

// Verse werkruimte voor een aanbesteding waar nog niet in is gewerkt.
export function buildFreshDossier(tender: SavedTender): DossierSnapshot {
  const documents = buildTenderSourceDocuments(tender)
  const project: TenderProject = {
    title: tender.aanbestedingNaam,
    buyer: tender.opdrachtgeverNaam,
    tendernedId: `TN-${tender.kenmerk}`,
    deadline: tender.sluitingsDatum?.slice(0, 10) ?? '',
  }
  return {
    project,
    documents,
    tenderDocuments: tender.documents ?? [],
    comments: [],
    stage: 'brons',
    draft: buildStartDraft(project, documents),
    analysis: null,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Maak (of heropen) het project bij een gedownloade aanbesteding en geef het project-id
 * terug. Bestaat er al een dossier voor deze publicatie, dan blijft het werk staan en
 * worden alleen de nieuwste archieflinks van de documenten meegenomen.
 */
export function createProjectFromTender(tender: SavedTender): string {
  const id = tender.publicatieId
  const existing = loadDossier<DossierSnapshot>(id)
  const snapshot: DossierSnapshot = existing
    ? {
        ...existing,
        tenderDocuments: tender.documents?.length ? tender.documents : existing.tenderDocuments ?? [],
      }
    : buildFreshDossier(tender)
  saveDossier(id, snapshot)
  upsertProject({
    id,
    title: snapshot.project.title || 'Naamloos project',
    buyer: snapshot.project.buyer,
    updatedAt: snapshot.updatedAt,
    source: 'tender',
  })
  setActiveDossierId(id)
  return id
}

/** Maak een nieuw, blanco project en geef het project-id terug. */
export function createBlankProject(input?: { title?: string; buyer?: string; deadline?: string }): string {
  const id = makeProjectId()
  const project: TenderProject = {
    title: input?.title?.trim() || 'Nieuw project',
    tendernedId: '',
    buyer: input?.buyer?.trim() ?? '',
    deadline: input?.deadline ?? '',
  }
  const snapshot: DossierSnapshot = {
    project,
    documents: [],
    tenderDocuments: [],
    comments: [],
    stage: 'brons',
    draft: buildStartDraft(project, []),
    analysis: null,
    updatedAt: new Date().toISOString(),
  }
  saveDossier(id, snapshot)
  upsertProject({
    id,
    title: project.title,
    buyer: project.buyer,
    updatedAt: snapshot.updatedAt,
    source: 'blank',
  })
  setActiveDossierId(id)
  return id
}
