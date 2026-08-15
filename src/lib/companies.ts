import { DEFAULT_COMPANY_ID, loadStored, purgeCompanyData, saveStored } from './storage'

// Register van bedrijven waarvoor in de applicatie wordt gewerkt. Alle werkdata
// (projecten, dossiers, bronnen, bedrijfsconfig, opgeslagen aanbestedingen) is
// per bedrijf gescheiden via de opslaglaag (zie storage.ts). Het register en de
// active-pointer zelf zijn app-breed.

export type Company = {
  id: string
  name: string
  createdAt: string
}

const REGISTRY_KEY = 'bid-agent-companies'
const ACTIVE_KEY = 'bid-agent-active-company'

export { DEFAULT_COMPANY_ID }

export function getCompanies(): Company[] {
  const list = loadStored<Company[]>(REGISTRY_KEY, [])
  if (list.length) return list

  // Eerste keer met bedrijvenondersteuning: de bestaande werkdata wordt het
  // eerste bedrijf. Naam komt uit de al ingevulde bedrijfsconfiguratie (op dit
  // moment is 'default' actief, dus deze read raakt de bestaande sleutel).
  const legacyConfig = loadStored<{ name?: string }>('bid-agent-company-config', {})
  const seeded: Company[] = [
    {
      id: DEFAULT_COMPANY_ID,
      name: legacyConfig.name?.trim() || 'Besteed Het Uit',
      createdAt: new Date().toISOString(),
    },
  ]
  saveStored(REGISTRY_KEY, seeded)
  return seeded
}

export function getActiveCompanyId(): string {
  const companies = getCompanies()
  const id = loadStored<string>(ACTIVE_KEY, DEFAULT_COMPANY_ID)
  return companies.some((company) => company.id === id) ? id : companies[0].id
}

export function getActiveCompany(): Company {
  const id = getActiveCompanyId()
  const companies = getCompanies()
  return companies.find((company) => company.id === id) ?? companies[0]
}

export function setActiveCompanyId(id: string) {
  saveStored(ACTIVE_KEY, id)
}

export function createCompany(name: string): Company {
  const company: Company = {
    id: `co-${Math.random().toString(36).slice(2, 10)}`,
    name: name.trim() || 'Nieuw bedrijf',
    createdAt: new Date().toISOString(),
  }
  saveStored(REGISTRY_KEY, [...getCompanies(), company])
  return company
}

/** Houdt de registernaam in sync met de bedrijfsnaam uit de bedrijfsconfiguratie. */
export function renameCompany(id: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) return
  saveStored(
    REGISTRY_KEY,
    getCompanies().map((company) => (company.id === id ? { ...company, name: trimmed } : company)),
  )
}

/**
 * Verwijdert een bedrijf inclusief al zijn werkdata. Het laatste bedrijf kan
 * niet worden verwijderd. Was het verwijderde bedrijf actief, dan wordt het
 * eerstoverblijvende bedrijf actief.
 */
export function removeCompany(id: string): boolean {
  const companies = getCompanies()
  if (companies.length <= 1) return false
  const remaining = companies.filter((company) => company.id !== id)
  if (loadStored<string>(ACTIVE_KEY, DEFAULT_COMPANY_ID) === id) {
    saveStored(ACTIVE_KEY, remaining[0].id)
  }
  purgeCompanyData(id)
  saveStored(REGISTRY_KEY, remaining)
  return true
}
