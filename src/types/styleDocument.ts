export type StyleDocumentCategory = 'richtlijnen' | 'kwaliteit' | 'schrijfstijl' | 'voorbeeld'

export type StyleDocumentPromptType = 'rules' | 'training'

export type StyleDocument = {
  id: string
  name: string
  fileName: string
  mimeType: string
  category: StyleDocumentCategory
  promptType: StyleDocumentPromptType
  content: string
  createdAt: string
  updatedAt: string
}

export type StyleDocumentInput = {
  name: string
  category: StyleDocumentCategory
  promptType: StyleDocumentPromptType
}

export const styleCategoryLabels: Record<StyleDocumentCategory, string> = {
  richtlijnen: 'Richtlijnen & regels',
  kwaliteit: 'Kwaliteitsstandaarden',
  schrijfstijl: 'Schrijfstijl',
  voorbeeld: 'Voorbeeldteksten',
}

export const styleCategoryDefaultPromptType: Record<
  StyleDocumentCategory,
  StyleDocumentPromptType
> = {
  richtlijnen: 'rules',
  kwaliteit: 'rules',
  schrijfstijl: 'training',
  voorbeeld: 'training',
}

export const acceptedStyleExtensions = [
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.txt',
  '.md',
  '.csv',
]
