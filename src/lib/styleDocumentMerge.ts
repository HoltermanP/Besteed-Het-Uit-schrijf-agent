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

export function styleDocumentsToSourceDocuments(documents: StyleDocument[]): StyleSourceDocument[] {
  return documents.map((doc) => ({
    id: `style-doc-${doc.id}`,
    name: `${doc.name} (${doc.category})`,
    type: doc.promptType,
    content: `[${doc.category} | ${doc.fileName}]\n${doc.content}`,
    importedAt: doc.updatedAt,
  }))
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
