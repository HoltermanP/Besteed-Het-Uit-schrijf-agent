import type { SourceType } from '../types/tenderAnalysis'
import type {
  StyleDocument,
  StyleDocumentCategory,
  StyleDocumentPromptType,
} from '../types/styleDocument'

export type StyleSourceDocument = {
  id: string
  name: string
  type: SourceType
  content: string
  importedAt: string
}

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

export function styleDocumentsToSourceDocuments(documents: StyleDocument[]): StyleSourceDocument[] {
  return documents.flatMap((doc) => {
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
}

export function mergeDocumentsWithStyleDocuments<T extends { type: SourceType }>(
  documents: T[],
  styleDocuments: StyleDocument[],
): T[] {
  const styleDocs = styleDocumentsToSourceDocuments(styleDocuments)
  if (!styleDocs.length) return documents

  const withoutStyleTypes = documents.filter((doc) => doc.type !== 'rules' && doc.type !== 'training')
  return [...withoutStyleTypes, ...(styleDocs as unknown as T[])]
}

export function categoryForPromptType(promptType: StyleDocumentPromptType): StyleDocumentCategory {
  return promptType === 'rules' ? 'richtlijnen' : 'schrijfstijl'
}
