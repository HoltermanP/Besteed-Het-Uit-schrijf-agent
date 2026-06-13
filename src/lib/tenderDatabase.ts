import { getApiConfig, isNeonConfigured } from './apiConfig'
import { loadStored, saveStored } from './storage'
import type { SavedTender, TenderDetail } from '../types/tenderNed'
import { fetchPublicationDocumentText } from './tenderNedApi'

const STORAGE_KEY = 'bid-agent-saved-tenders'

export function getSavedTenders(): SavedTender[] {
  return loadStored<SavedTender[]>(STORAGE_KEY, [])
}

export function saveTendersLocally(tenders: SavedTender[]) {
  const current = getSavedTenders()
  const map = new Map(current.map((item) => [item.publicatieId, item]))
  tenders.forEach((item) => map.set(item.publicatieId, item))
  saveStored(STORAGE_KEY, [...map.values()])
}

export async function downloadTenderToDatabase(detail: TenderDetail): Promise<SavedTender> {
  const documentText = await fetchPublicationDocumentText(detail.publicatieId).catch(
    () => detail.opdrachtBeschrijving,
  )

  const saved: SavedTender = {
    id: `tn-${detail.publicatieId}`,
    publicatieId: detail.publicatieId,
    kenmerk: detail.kenmerk,
    aanbestedingNaam: detail.aanbestedingNaam,
    opdrachtgeverNaam: detail.opdrachtgeverNaam,
    sluitingsDatum: detail.sluitingsDatum,
    cpvCodes: detail.cpvCodes,
    opdrachtBeschrijving: detail.opdrachtBeschrijving,
    documentText,
    tendernedUrl: detail.tendernedUrl,
    savedAt: new Date().toISOString(),
    syncStatus: isNeonConfigured() ? 'pending' : 'local',
  }

  saveTendersLocally([saved])
  return saved
}

export async function syncPendingTendersToNeon(): Promise<{ synced: number; message: string }> {
  const config = getApiConfig()
  if (!isNeonConfigured()) {
    return { synced: 0, message: 'Configureer Neon in /admin om te synchroniseren.' }
  }

  const tenders = getSavedTenders().filter((item) => item.syncStatus !== 'synced')
  if (!tenders.length) {
    return { synced: 0, message: 'Geen openstaande aanbestedingen om te syncen.' }
  }

  // Frontend kan niet direct naar PostgreSQL schrijven; payload klaarzetten voor backend/Neon.
  const payload = {
    connectionHint: config.neon.connectionString.replace(/:[^:@/]+@/, ':***@'),
    records: tenders.map((item) => ({
      publicatie_id: item.publicatieId,
      kenmerk: item.kenmerk,
      titel: item.aanbestedingNaam,
      opdrachtgever: item.opdrachtgeverNaam,
      sluitings_datum: item.sluitingsDatum,
      cpv_codes: item.cpvCodes,
      document_tekst: item.documentText.slice(0, 50000),
      bron_url: item.tendernedUrl,
      opgeslagen_op: item.savedAt,
    })),
  }

  localStorage.setItem('bid-agent-neon-sync-queue', JSON.stringify(payload))

  const updated = getSavedTenders().map((item) =>
    item.syncStatus === 'pending' ? { ...item, syncStatus: 'synced' as const } : item,
  )
  saveStored(STORAGE_KEY, updated)

  return {
    synced: tenders.length,
    message: `${tenders.length} aanbesteding(en) klaargezet voor Neon (${config.neon.connectionString.split('@').pop()}). Backend-endpoint volgt voor echte insert.`,
  }
}
