import type { EvidenceBlock } from './evidenceBlock'
import type { LessonLearned } from './lessonLearned'
import type { StyleDocument } from './styleDocument'

// Vorm van de volledige back-up: alles wat de server over de werkruimte weet, in één
// bestand. De server stelt hem samen (api-src/_lib/backup.ts), de browser maakt er een
// zip van met leesbare projectmappen ernaast (src/lib/backup.ts).

export const BACKUP_FORMAT = 'besteed-het-uit-backup'
export const BACKUP_VERSION = 1

/** Bedrijfsbrede bibliotheek: stijldocumenten, leerpunten en bewijsbouwstenen. */
export type BackupCompanyLibrary = {
  companyId: string
  name: string
  styleDocuments: StyleDocument[]
  lessons: LessonLearned[]
  evidenceBlocks: EvidenceBlock[]
}

export type BackupBundle = {
  formaat: typeof BACKUP_FORMAT
  versie: number
  gemaaktOp: string
  /**
   * Alle sleutels uit de werkruimte-opslag (projecten, dossiers met concepten en bronnen,
   * versiegeschiedenis, prullenbak, bedrijfsconfiguratie). API-sleutels en de
   * connection string zijn leeggemaakt, zodat een back-up geen geheimen rondstuurt.
   */
  werkruimte: Record<string, string>
  bibliotheek: BackupCompanyLibrary[]
}
