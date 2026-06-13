import type { StyleDocument, StyleDocumentCategory, StyleDocumentPromptType } from '../types/styleDocument'

type StyleDocumentsResponse = {
  documents: StyleDocument[]
}

type StyleDocumentUploadResponse = {
  document: StyleDocument
}

type StyleDocumentError = {
  error: string
}

export async function fetchStyleDocuments(): Promise<StyleDocument[]> {
  const response = await fetch('/api/style-documents')
  const data = (await response.json()) as StyleDocumentsResponse | StyleDocumentError
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'Schrijfstijl-documenten ophalen mislukt.')
  }
  return data.documents
}

export async function uploadStyleDocument(input: {
  file: File
  name: string
  category: StyleDocumentCategory
  promptType: StyleDocumentPromptType
}): Promise<StyleDocument> {
  const formData = new FormData()
  formData.append('file', input.file)
  formData.append('name', input.name.trim() || input.file.name)
  formData.append('category', input.category)
  formData.append('promptType', input.promptType)

  const response = await fetch('/api/style-documents', {
    method: 'POST',
    body: formData,
  })

  const data = (await response.json()) as StyleDocumentUploadResponse | StyleDocumentError
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'Upload mislukt.')
  }

  return data.document
}

export async function deleteStyleDocument(id: string): Promise<void> {
  const response = await fetch(`/api/style-documents?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  const data = (await response.json()) as { ok?: boolean; error?: string }
  if (!response.ok || data.error) {
    throw new Error(data.error ?? 'Verwijderen mislukt.')
  }
}
