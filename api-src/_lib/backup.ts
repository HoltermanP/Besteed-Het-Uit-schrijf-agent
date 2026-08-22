import { BACKUP_FORMAT, BACKUP_VERSION, type BackupBundle, type BackupCompanyLibrary } from '../../src/types/backup'
import { readAllState } from './appState'
import { listEvidenceBlocks } from './evidenceBlocks'
import { listLessons } from './lessonsLearned'
import { listStyleDocuments } from './styleDocuments'

// Volledige back-up van de werkruimte: de key-value-opslag (projecten, dossiers met
// concepten en bronnen, versies, prullenbak) plus de bedrijfsbibliotheken uit de
// database (stijldocumenten, leerpunten, bewijsbouwstenen). Eén GET levert alles, zodat
// een beheerder een kopie buiten de applicatie kan bewaren.

const COMPANIES_KEY = 'bid-agent-companies'
const API_CONFIG_KEY = 'bid-agent-api-config'
const DEFAULT_COMPANY = { id: 'default', name: 'Besteed Het Uit' }

type StoredCompany = { id?: string; name?: string }

function parseCompanies(state: Record<string, string>): Array<{ id: string; name: string }> {
  try {
    const parsed = JSON.parse(state[COMPANIES_KEY] ?? '[]') as StoredCompany[]
    const companies = (Array.isArray(parsed) ? parsed : [])
      .filter((company) => typeof company?.id === 'string' && company.id)
      .map((company) => ({ id: company.id as string, name: company.name?.trim() || company.id as string }))
    return companies.length ? companies : [DEFAULT_COMPANY]
  } catch {
    return [DEFAULT_COMPANY]
  }
}

/**
 * Maak de API-configuratie leeg van geheimen. Een back-up gaat naar een schijf, een
 * mailbox of een gedeelde map; sleutels en connection strings horen daar niet in.
 */
function redactSecrets(state: Record<string, string>): Record<string, string> {
  const raw = state[API_CONFIG_KEY]
  if (!raw) return state
  try {
    const config = JSON.parse(raw) as Record<string, Record<string, unknown>>
    const blanked = { ...config }
    for (const section of ['tenderned', 'writer', 'review'] as const) {
      if (blanked[section]) blanked[section] = { ...blanked[section], apiKey: '' }
    }
    if (blanked.neon) blanked.neon = { ...blanked.neon, connectionString: '' }
    return { ...state, [API_CONFIG_KEY]: JSON.stringify(blanked) }
  } catch {
    // Onleesbare config: liever helemaal weglaten dan mogelijk een sleutel meesturen.
    const { [API_CONFIG_KEY]: _dropped, ...rest } = state
    return rest
  }
}

export async function buildBackupBundle(): Promise<BackupBundle> {
  const state = await readAllState()
  const companies = parseCompanies(state)

  const bibliotheek: BackupCompanyLibrary[] = await Promise.all(
    companies.map(async (company) => {
      const [styleDocuments, lessons, evidenceBlocks] = await Promise.all([
        listStyleDocuments(company.id),
        listLessons(company.id),
        listEvidenceBlocks(company.id),
      ])
      return { companyId: company.id, name: company.name, styleDocuments, lessons, evidenceBlocks }
    }),
  )

  return {
    formaat: BACKUP_FORMAT,
    versie: BACKUP_VERSION,
    gemaaktOp: new Date().toISOString(),
    werkruimte: redactSecrets(state),
    bibliotheek,
  }
}

export async function handleBackupRequest(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }
  return Response.json(await buildBackupBundle())
}
