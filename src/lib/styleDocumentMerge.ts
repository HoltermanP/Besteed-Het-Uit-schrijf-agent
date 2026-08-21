import type { SourceType } from '../types/tenderAnalysis'
import {
  isKaderCategory,
  type StyleDocument,
  type StyleDocumentCategory,
  type StyleDocumentPromptType,
} from '../types/styleDocument'
import {
  emptyAanpassingen,
  schrijfkaderToSourceDocuments,
  type KaderSourceDocument,
  type SchrijfkaderAanpassingen,
} from './schrijfkader'

export type StyleSourceDocument = KaderSourceDocument

/**
 * Een geanalyseerd document levert een gedistilleerd profiel: de schrijfstijl gaat als
 * 'training' (toon/structuur) en kennis/ervaringen/achtergrond als 'company' (feiten voor
 * onderbouwing) de schrijfprompt in. Niet-geanalyseerde documenten houden hun ruwe tekst.
 */
function analyzedDocumentToSources(doc: StyleDocument): StyleSourceDocument[] {
  const analysis = doc.analysis
  if (!analysis) return []

  const sources: StyleSourceDocument[] = []
  const style = analysis.schrijfstijl?.trim()
  if (style) {
    sources.push({
      id: `style-doc-${doc.id}-stijl`,
      name: `${doc.name} — schrijfstijl`,
      type: 'training',
      content: `[schrijfstijl uit ${doc.fileName}]\n${style}`,
      importedAt: doc.updatedAt,
    })
  }

  const facts = [
    analysis.kennis?.trim() ? `Kennis & feiten:\n${analysis.kennis.trim()}` : '',
    analysis.ervaringen?.trim() ? `Ervaringen & cases:\n${analysis.ervaringen.trim()}` : '',
    analysis.achtergrond?.trim() ? `Achtergrond & context:\n${analysis.achtergrond.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  if (facts) {
    sources.push({
      id: `style-doc-${doc.id}-kennis`,
      name: `${doc.name} — kennis & ervaring`,
      type: 'company',
      content: `[gedistilleerd uit ${doc.fileName}]\n${facts}`,
      importedAt: doc.updatedAt,
    })
  }

  return sources
}

/**
 * Alle bronnen die de stijlbibliotheek aan de agent levert: eerst het gecompileerde
 * schrijfkader (basis + regels + handmatige aanpassingen per sectie), daarna de
 * profielen uit eerdere aanbestedingen en achtergrondstukken.
 */
export function styleDocumentsToSourceDocuments(
  documents: StyleDocument[],
  aanpassingen: SchrijfkaderAanpassingen = emptyAanpassingen,
): StyleSourceDocument[] {
  const kader = schrijfkaderToSourceDocuments(documents, aanpassingen)

  const rest = documents
    .filter((doc) => !isKaderCategory(doc.category))
    .flatMap((doc) => {
      const analyzed = analyzedDocumentToSources(doc)
      if (analyzed.length) return analyzed

      return [
        {
          id: `style-doc-${doc.id}`,
          name: `${doc.name} (${doc.category})`,
          type: doc.promptType,
          content: `[${doc.category} | ${doc.fileName}]\n${doc.content}`,
          importedAt: doc.updatedAt,
        },
      ]
    })

  return [...kader, ...rest]
}

/**
 * Voegt het schrijfkader samen met de projectbronnen. Projectspecifieke schrijfregels en
 * stijlbronnen blijven staan: ze vullen het kader aan voor dit ene project en worden
 * niet meer verdrongen door de bibliotheek.
 */
export function mergeDocumentsWithStyleDocuments<T extends { type: SourceType }>(
  documents: T[],
  styleDocuments: StyleDocument[],
  aanpassingen: SchrijfkaderAanpassingen = emptyAanpassingen,
): T[] {
  const styleDocs = styleDocumentsToSourceDocuments(styleDocuments, aanpassingen)
  return [...(styleDocs as unknown as T[]), ...documents]
}

export function categoryForPromptType(promptType: StyleDocumentPromptType): StyleDocumentCategory {
  return promptType === 'rules' ? 'richtlijnen' : 'schrijfstijl'
}
