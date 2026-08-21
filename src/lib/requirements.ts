import type {
  Requirement,
  RequirementCategory,
  RequirementCheck,
  RequirementCheckBy,
  RequirementStatus,
  RequirementStatusEntry,
  RequestedDocument,
  TenderAnalysis,
} from '../types/tenderAnalysis'
import { requestedDocumentId, requestedDocumentKindLabels } from './requestedDocuments'

/**
 * Gedeelde helpers rond het eisenregister: de atomaire, toetsbare eisen waaraan de
 * inschrijving moet voldoen. Gebruikt door de analyse (normaliseren, ontdubbelen,
 * afleiden, koppelen aan stukken), de schrijfagent en reviewer (eisen per stuk) en de
 * werkplek (status per eis). Geen browser- of Node-API's: client en server delen deze code.
 */

export const requirementCategories: RequirementCategory[] = [
  'document',
  'geschiktheid',
  'uitsluiting',
  'inhoud',
  'omvang',
  'vorm',
  'opmaak',
  'indiening',
  'proces',
  'contract',
  'overig',
]

export const requirementCategoryLabels: Record<RequirementCategory, string> = {
  document: 'In te dienen stukken',
  geschiktheid: 'Geschiktheid',
  uitsluiting: 'Uitsluitingsgronden',
  inhoud: 'Inhoud',
  omvang: 'Omvang',
  vorm: 'Vorm',
  opmaak: 'Opmaak',
  indiening: 'Indiening',
  proces: 'Procedure',
  contract: 'Contractvoorwaarden',
  overig: 'Overig',
}

export const requirementStatusLabels: Record<RequirementStatus, string> = {
  open: 'Open',
  voldaan: 'Voldaan',
  aandacht: 'Aandacht',
  nvt: 'N.v.t.',
}

/** Eisen die de inschrijver zelf moet afdekken (buiten de tekst van een schrijfstuk). */
const USER_CHECK_CATEGORIES = new Set<RequirementCategory>([
  'document',
  'geschiktheid',
  'uitsluiting',
  'indiening',
  'proces',
  'contract',
])

const USER_CHECK_HINT =
  /\b(pdf|bestand|upload|onderteken\w*|tenderned|negometrix|mercell|kvk|uittreksel|certificaat|certificer\w*|verklaring|polis|referentie\w*|uea|inschrijfbiljet|prijsblad|prijzenblad|formulier|bankgarantie|verzeker\w*|akkoord)\b/i

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokens(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((part) => part.length > 3)
}

/** Stabiele sleutel uit categorie + de eerste woorden van de eis: "req-document-referentielijst-indienen". */
export function requirementId(category: RequirementCategory, text: string): string {
  const slug = normalizeText(text).split(' ').filter(Boolean).slice(0, 8).join('-').slice(0, 60)
  return `req-${category}-${slug || 'eis'}`
}

export function normalizeRequirementCategory(value: unknown): RequirementCategory {
  const v = str(value).toLowerCase()
  if ((requirementCategories as string[]).includes(v)) return v as RequirementCategory
  if (/geschikt|referent|omzet|certif|verzeker|kerncompet|ervaring|financ|bekwaam/.test(v)) return 'geschiktheid'
  if (/uitsluit|gedrag|uea|integriteit/.test(v)) return 'uitsluiting'
  if (/document|bijlage|bewijs|formulier|stuk/.test(v)) return 'document'
  if (/inhoud|content|onderwerp|vraag|thema/.test(v)) return 'inhoud'
  if (/omvang|woord|pagina|karakter|lengte|limiet/.test(v)) return 'omvang'
  if (/vorm|taal|anonim|bestand|pdf/.test(v)) return 'vorm'
  if (/opmaak|letter|marge|lay/.test(v)) return 'opmaak'
  if (/indien|deadline|onderteken|tenderned|kanaal|termijn/.test(v)) return 'indiening'
  if (/proces|procedure|inlichting|planning/.test(v)) return 'proces'
  if (/contract|overeenkomst|voorwaarden|akkoord/.test(v)) return 'contract'
  return 'overig'
}

/** Wie de eis kan toetsen als de bron dat niet zegt: categorie eerst, daarna trefwoorden in de tekst. */
export function inferCheckBy(category: RequirementCategory, text: string): RequirementCheckBy {
  if (USER_CHECK_CATEGORIES.has(category)) return 'gebruiker'
  if (USER_CHECK_HINT.test(text)) return 'gebruiker'
  return 'agent'
}

/** Zet ruwe AI-JSON om naar gevalideerde eisen (ongeldige items vervallen). */
export function normalizeRequirements(value: unknown, source: string): Requirement[] {
  return dedupeRequirements(
    asArray<Record<string, unknown>>(value)
      .map((item): Requirement | null => {
        const text = str(item.text) || str(item.requirement) || str(item.eis)
        if (!text) return null
        const category = normalizeRequirementCategory(item.category)
        const checkByRaw = str(item.checkBy).toLowerCase()
        const checkBy: RequirementCheckBy =
          checkByRaw === 'agent' || checkByRaw === 'gebruiker' ? checkByRaw : inferCheckBy(category, text)
        const question = str(item.question)
        return {
          id: requirementId(category, text),
          category,
          text,
          mandatory: item.mandatory !== false,
          source: str(item.source) || source,
          reference: str(item.reference) || undefined,
          documentTitle: str(item.documentTitle) || undefined,
          checkBy,
          question: checkBy === 'gebruiker' && question ? question : undefined,
          origin: 'ai',
        }
      })
      .filter((item): item is Requirement => item !== null),
  )
}

/** Ontdubbel op id én op genormaliseerde tekst; de eerste vermelding wint, latere vullen lege velden aan. */
export function dedupeRequirements(list: Requirement[]): Requirement[] {
  const byKey = new Map<string, Requirement>()
  const idToKey = new Map<string, string>()

  for (const req of list) {
    const textKey = normalizeText(req.text)
    if (!textKey) continue
    const id = req.id || requirementId(req.category, req.text)
    const key = byKey.has(textKey) ? textKey : (idToKey.get(id) ?? textKey)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, { ...req, id })
      idToKey.set(id, key)
      continue
    }
    byKey.set(key, {
      ...existing,
      mandatory: existing.mandatory || req.mandatory,
      reference: existing.reference || req.reference,
      documentTitle: existing.documentTitle || req.documentTitle,
      documentId: existing.documentId || req.documentId,
      question: existing.question || req.question,
      // Een gebruikerscheck wint: dan is er iets buiten de tekst nodig.
      checkBy: existing.checkBy === 'gebruiker' || req.checkBy === 'gebruiker' ? 'gebruiker' : 'agent',
    })
  }
  return [...byKey.values()]
}

/** Vind het op te stellen stuk waar een (vrij geformuleerde) titel naar verwijst. */
export function matchRequestedDocument(title: string, docs: RequestedDocument[]): RequestedDocument | undefined {
  const t = title.trim()
  if (!t || !docs.length) return undefined
  const id = requestedDocumentId(t)
  const exact = docs.find((doc) => doc.id === id)
  if (exact) return exact

  const a = normalizeText(t)
  const contains = docs.find((doc) => {
    const b = normalizeText(doc.title)
    return Boolean(a) && Boolean(b) && (a.includes(b) || b.includes(a))
  })
  if (contains) return contains

  const at = tokens(t)
  let best: RequestedDocument | undefined
  let bestScore = 0
  for (const doc of docs) {
    const bt = tokens(doc.title)
    if (!at.length || !bt.length) continue
    const overlap = at.filter((token) => bt.includes(token)).length
    const needed = Math.min(2, Math.min(at.length, bt.length))
    if (overlap >= needed && overlap > bestScore) {
      best = doc
      bestScore = overlap
    }
  }
  return best
}

/** Koppel eisen via documentTitle aan het bijbehorende RequestedDocument (documentId). */
export function linkRequirementsToDocuments(requirements: Requirement[], docs: RequestedDocument[]): Requirement[] {
  const ids = new Set(docs.map((doc) => doc.id))
  return requirements.map((req) => {
    if (req.documentId && ids.has(req.documentId)) return req
    const match = req.documentTitle ? matchRequestedDocument(req.documentTitle, docs) : undefined
    return match ? { ...req, documentId: match.id } : { ...req, documentId: undefined }
  })
}

type DerivableAnalysis = Pick<
  TenderAnalysis,
  'wordLimits' | 'contentRequirements' | 'documentRequirements' | 'requestedDocuments' | 'submissionRequirements'
>

/**
 * Gratis eisen uit de bestaande analysevelden (stukken, limieten, inhoudseisen,
 * inschrijvingseisen). Dient als baseline zonder AI en vult de AI-extractie aan.
 */
export function deriveRequirementsFromAnalysis(analysis: DerivableAnalysis): Requirement[] {
  const out: Requirement[] = []
  const docs = analysis.requestedDocuments ?? []
  const add = (req: Omit<Requirement, 'id'>) => out.push({ id: requirementId(req.category, req.text), ...req })

  for (const doc of docs) {
    const writable = doc.kind === 'schrijfstuk'
    add({
      category: 'document',
      text: writable
        ? `${doc.title} opstellen en indienen`
        : `${doc.title} aanleveren (${requestedDocumentKindLabels[doc.kind].toLowerCase()})`,
      mandatory: doc.mandatory,
      source: doc.source,
      documentTitle: doc.title,
      documentId: doc.id,
      checkBy: writable ? 'agent' : 'gebruiker',
      question: writable
        ? undefined
        : `Is "${doc.title}" beschikbaar en ingevuld/ondertekend zoals de leidraad vraagt? Voeg het toe aan de indieningsset.`,
      origin: 'afgeleid',
    })
  }

  for (const req of analysis.documentRequirements ?? []) {
    if (matchRequestedDocument(req.name, docs)) continue
    add({
      category: 'document',
      text: `${req.name} indienen`,
      mandatory: req.mandatory,
      source: req.source,
      documentTitle: req.name,
      checkBy: 'gebruiker',
      question: `Is "${req.name}" beschikbaar om in te dienen?`,
      origin: 'afgeleid',
    })
  }

  for (const limit of analysis.wordLimits ?? []) {
    const unit = limit.unit === 'paginas' ? "pagina's" : limit.unit
    const bounds =
      limit.min && limit.max
        ? `${limit.min}–${limit.max} ${unit}`
        : limit.max
          ? `maximaal ${limit.max} ${unit}`
          : `minimaal ${limit.min} ${unit}`
    add({
      category: 'omvang',
      text: `${limit.section ?? limit.label}: ${bounds}`,
      mandatory: true,
      source: limit.source,
      documentTitle: limit.section,
      checkBy: 'agent',
      origin: 'afgeleid',
    })
  }

  for (const req of (analysis.contentRequirements ?? []).filter((item) => item.mandatory)) {
    add({
      category: 'inhoud',
      text: req.detail && req.detail !== req.topic ? `${req.topic}: ${req.detail}` : req.topic,
      mandatory: true,
      source: req.source,
      checkBy: 'agent',
      origin: 'afgeleid',
    })
  }

  for (const req of analysis.submissionRequirements ?? []) {
    const category = normalizeRequirementCategory(req.category)
    const checkBy = inferCheckBy(category, req.requirement)
    add({
      category,
      text: req.requirement,
      mandatory: req.mandatory,
      source: req.source,
      checkBy,
      question: checkBy === 'gebruiker' ? `Kan het bidteam bevestigen dat hieraan is voldaan: ${req.requirement}` : undefined,
      origin: 'afgeleid',
    })
  }

  return linkRequirementsToDocuments(dedupeRequirements(out), docs)
}

const CATEGORY_RANK = new Map(requirementCategories.map((category, index) => [category, index]))

export function sortRequirements(list: Requirement[]): Requirement[] {
  return [...list].sort((a, b) => {
    if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1
    return (CATEGORY_RANK.get(a.category) ?? 99) - (CATEGORY_RANK.get(b.category) ?? 99)
  })
}

/**
 * Eindregister: de AI-eisen zijn leidend; afgeleide eisen vullen alleen de categorieën aan
 * waarover de AI niets zei. Schrijfstukken staan altijd als document-eis in het register,
 * zodat de voortgang (geschreven/niet geschreven) automatisch wordt afgevinkt.
 */
export function buildRequirementRegister(analysis: DerivableAnalysis, aiRequirements: Requirement[]): Requirement[] {
  const docs = analysis.requestedDocuments ?? []
  const ai = linkRequirementsToDocuments(dedupeRequirements(aiRequirements), docs)
  const covered = new Set(ai.map((req) => req.category))
  const writableIds = new Set(docs.filter((doc) => doc.kind === 'schrijfstuk').map((doc) => doc.id))
  const fill = deriveRequirementsFromAnalysis(analysis).filter(
    (req) =>
      !covered.has(req.category) ||
      (req.category === 'document' && req.documentId !== undefined && writableIds.has(req.documentId)),
  )
  return sortRequirements(dedupeRequirements([...ai, ...fill]))
}

/** De eisen die een agent aan de tekst van dít stuk kan toetsen (stukgebonden + inschrijvingsbreed). */
export function requirementsForDocument(analysis: TenderAnalysis, doc?: RequestedDocument): Requirement[] {
  return (analysis.requirements ?? []).filter(
    (req) => req.checkBy === 'agent' && (!doc || !req.documentId || req.documentId === doc.id),
  )
}

export type ResolvedRequirement = Requirement & {
  status: RequirementStatus
  entry?: RequirementStatusEntry
  /** true als de status automatisch is bepaald (agent of voortgang), niet door de gebruiker. */
  auto: boolean
}

/**
 * Bepaal de actuele status per eis: een vastgelegde status wint; anders geldt een
 * schrijfstuk als voldaan zodra er een concept voor is geschreven; de rest staat open.
 */
export function resolveRequirementStatuses(
  requirements: Requirement[],
  statuses: Record<string, RequirementStatusEntry>,
  writtenDocumentIds: Set<string>,
): ResolvedRequirement[] {
  return requirements.map((req) => {
    const entry = statuses[req.id]
    if (entry) return { ...req, status: entry.status, entry, auto: entry.by === 'agent' }
    if (req.category === 'document' && req.documentId && writtenDocumentIds.has(req.documentId)) {
      return { ...req, status: 'voldaan', auto: true }
    }
    return { ...req, status: 'open', auto: false }
  })
}

export function summarizeRequirements(resolved: ResolvedRequirement[]) {
  const relevant = resolved.filter((req) => req.status !== 'nvt')
  const done = relevant.filter((req) => req.status === 'voldaan').length
  const open = relevant.filter((req) => req.status === 'open' || req.status === 'aandacht')
  return {
    total: relevant.length,
    done,
    open: open.length,
    openMandatory: open.filter((req) => req.mandatory).length,
    attention: relevant.filter((req) => req.status === 'aandacht').length,
    questions: open.filter((req) => req.checkBy === 'gebruiker' && req.question).length,
  }
}

/**
 * Verwerk het oordeel van een agent (reviewer) in de statussen. Een 'n.v.t.' van de
 * gebruiker blijft staan; een 'voldaan' van de gebruiker wordt 'aandacht' als de agent
 * het niet terugziet, zodat de tegenspraak zichtbaar wordt in plaats van stil verdwijnt.
 */
export function applyRequirementChecks(
  statuses: Record<string, RequirementStatusEntry>,
  checks: RequirementCheck[],
  requirements: Requirement[],
  now = new Date().toISOString(),
): Record<string, RequirementStatusEntry> {
  const known = new Set(requirements.map((req) => req.id))
  const next = { ...statuses }
  for (const check of checks) {
    if (!known.has(check.id) || check.met === null) continue
    const existing = next[check.id]
    if (existing?.by === 'gebruiker' && existing.status === 'nvt') continue
    next[check.id] = {
      status: check.met ? 'voldaan' : 'aandacht',
      note: check.note?.trim() || undefined,
      by: 'agent',
      updatedAt: now,
    }
  }
  return next
}

/** Zet ruwe agent-output om naar geldige checks voor de gegeven eisen. */
export function normalizeRequirementChecks(value: unknown, requirements: Requirement[]): RequirementCheck[] {
  const known = new Set(requirements.map((req) => req.id))
  const seen = new Set<string>()
  return asArray<Record<string, unknown>>(value)
    .map((item): RequirementCheck | null => {
      const id = str(item.id)
      if (!id || !known.has(id) || seen.has(id)) return null
      seen.add(id)
      const met = item.met === true ? true : item.met === false ? false : null
      return { id, met, note: str(item.note) || undefined }
    })
    .filter((item): item is RequirementCheck => item !== null)
}
