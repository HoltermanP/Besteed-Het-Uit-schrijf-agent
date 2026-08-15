import { type CompanyConfig, defaultCompanyConfig } from '../types/companyConfig'
import type { SourceType } from '../types/tenderAnalysis'
import { getActiveCompanyId, renameCompany } from './companies'
import { loadStored, saveStored } from './storage'

const STORAGE_KEY = 'bid-agent-company-config'

export type CompanySourceDocument = {
  id: string
  name: string
  type: SourceType
  content: string
  importedAt: string
}

export function getCompanyConfig(): CompanyConfig {
  const stored = loadStored<Partial<CompanyConfig>>(STORAGE_KEY, {})
  return {
    ...defaultCompanyConfig,
    ...stored,
    cpvCodes: stored.cpvCodes ?? defaultCompanyConfig.cpvCodes,
    files: stored.files ?? defaultCompanyConfig.files,
  }
}

export function saveCompanyConfig(config: CompanyConfig) {
  saveStored(STORAGE_KEY, {
    ...config,
    updatedAt: new Date().toISOString(),
  })
  // Naam in het bedrijvenregister meebewegen met de configuratie, zodat de
  // bedrijfskiezer overal de actuele naam toont.
  if (config.name.trim()) renameCompany(getActiveCompanyId(), config.name)
}

export function isCompanyConfigured(config = getCompanyConfig()) {
  const hasText = Boolean(
    config.name.trim() ||
      config.profile.trim() ||
      config.competencies.trim() ||
      config.usps.trim() ||
      config.references.trim(),
  )
  return hasText || config.files.length > 0
}

export function companyConfigToSourceDocuments(config = getCompanyConfig()): CompanySourceDocument[] {
  if (!isCompanyConfigured(config)) return []

  const docs: CompanySourceDocument[] = []
  const profileParts = [
    config.name.trim() ? `Organisatie: ${config.name.trim()}` : '',
    config.tagline.trim() ? `Positionering: ${config.tagline.trim()}` : '',
    config.kvk.trim() ? `KVK: ${config.kvk.trim()}` : '',
    config.website.trim() ? `Website: ${config.website.trim()}` : '',
    config.contactEmail.trim() ? `Contact: ${config.contactEmail.trim()}` : '',
    config.profile.trim() ? `Profiel: ${config.profile.trim()}` : '',
    config.competencies.trim() ? `Kerncompetenties: ${config.competencies.trim()}` : '',
    config.usps.trim() ? `Onderscheidend vermogen: ${config.usps.trim()}` : '',
    config.references.trim() ? `Referenties: ${config.references.trim()}` : '',
    config.cpvCodes.length
      ? `CPV-codes: ${config.cpvCodes
          .map((cpv) => (cpv.omschrijving ? `${cpv.code} (${cpv.omschrijving})` : cpv.code))
          .join(', ')}`
      : '',
  ].filter(Boolean)

  if (profileParts.length) {
    docs.push({
      id: 'config-company-profile',
      name: config.name.trim() ? `${config.name.trim()} — bedrijfsprofiel` : 'Bedrijfsprofiel',
      type: 'company',
      content: profileParts.join('\n\n'),
      importedAt: config.updatedAt || new Date().toISOString(),
    })
  }

  config.files.forEach((file) => {
    docs.push({
      id: `config-file-${file.id}`,
      name: file.name,
      type: 'company',
      content: file.content,
      importedAt: file.uploadedAt,
    })
  })

  return docs
}

/** Vervangt dossier-bedrijfsbronnen door de centrale bedrijfsconfiguratie. */
export function mergeDocumentsWithCompanyConfig<T extends CompanySourceDocument>(documents: T[]): T[] {
  const configDocs = companyConfigToSourceDocuments()
  if (!configDocs.length) return documents
  const other = documents.filter((doc) => doc.type !== 'company')
  return [...(configDocs as T[]), ...other]
}
