import type { StyleDocument, StyleDocumentCategory, StyleDocumentPromptType } from '../types/styleDocument'
import { getApiConfig, isWriterConfigured } from './apiConfig'

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

export async function createRulesTextDocument(input: {
  name: string
  category: StyleDocumentCategory
  content: string
  promptType?: StyleDocumentPromptType
}): Promise<StyleDocument> {
  const formData = new FormData()
  formData.append('name', input.name.trim())
  formData.append('category', input.category)
  formData.append('promptType', input.promptType ?? 'rules')
  formData.append('content', input.content)

  const response = await fetch('/api/style-documents', {
    method: 'POST',
    body: formData,
  })

  const data = (await response.json()) as StyleDocumentUploadResponse | StyleDocumentError
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'Opslaan mislukt.')
  }

  return data.document
}

export async function updateStyleDocument(input: {
  id: string
  name?: string
  category?: StyleDocumentCategory
  content?: string
}): Promise<StyleDocument> {
  const response = await fetch('/api/style-documents', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  const data = (await response.json()) as StyleDocumentUploadResponse | StyleDocumentError
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'Bijwerken mislukt.')
  }

  return data.document
}

export async function analyzeStyleDocument(id: string): Promise<StyleDocument> {
  const apiConfig = getApiConfig()
  const ai = isWriterConfigured(apiConfig)
    ? {
        provider: apiConfig.writer.provider,
        baseUrl: apiConfig.writer.baseUrl,
        apiKey: apiConfig.writer.apiKey,
        model: apiConfig.writer.model,
      }
    : undefined

  const response = await fetch('/api/style-documents', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'analyze', id, ai }),
  })

  const data = (await response.json()) as StyleDocumentUploadResponse | StyleDocumentError
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'AI-analyse mislukt.')
  }

  return data.document
}

export async function distillRulesFromDocument(id: string): Promise<string> {
  const apiConfig = getApiConfig()
  const ai = isWriterConfigured(apiConfig)
    ? {
        provider: apiConfig.writer.provider,
        baseUrl: apiConfig.writer.baseUrl,
        apiKey: apiConfig.writer.apiKey,
        model: apiConfig.writer.model,
      }
    : undefined

  const response = await fetch('/api/style-documents', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'distill-rules', id, ai }),
  })

  const data = (await response.json()) as { rules?: string; error?: string }
  if (!response.ok || data.error || typeof data.rules !== 'string') {
    throw new Error(data.error ?? 'AI kon geen regels distilleren.')
  }

  return data.rules
}

export function isRulesDocument(document: StyleDocument): boolean {
  return document.promptType === 'rules'
}
