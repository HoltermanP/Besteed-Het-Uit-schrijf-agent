import type { AwardFormat, AwardLot, ParsedAward } from '../../src/types/buyerHistory'

/**
 * Leest de gunningsgegevens uit de tekst van een "Aankondiging gegunde opdracht".
 *
 * TenderNed publiceert die aankondiging als PDF in twee formaten: eForms (vanaf
 * ongeveer 2023, met genummerde secties 6.1.x) en het oudere TED-formulier (met
 * romeinse secties V.2.x). Beide zetten de gegevens als "label: waarde" neer, maar
 * de PDF-tekstextractie breekt een lang label over twee of drie regels af en zet de
 * waarde soms pas ná een losse dubbele punt op de volgende regel — en een paginakop
 * kan daar dwars doorheen vallen. De reflow hieronder plakt die stukken weer aan
 * elkaar; zonder dat herkent geen enkele regel zich als het label dat het is.
 */

/** Genummerde sectiekop: zowel "6.1.2" (eForms) als "V.2.3)" (TED). */
const SECTION = /^(\d+(\.\d+)*|[IVXLC]+(\.\d+)*)[.)]?(\s|$)/
/** Pagina-opmaak die middenin een afgebroken label kan vallen. */
const PAGE_FURNITURE = /^(--\s|Pagina\s|-{2,}$|Publicatie$)/

type Pair = {
  label: string
  value: string
  /** Regel zonder dubbele punt: een kop of een losse waarde. */
  bare: boolean
}

function toPairs(text: string): Pair[] {
  const lines = text
    .split('\n')
    .map((line) => line.replace(/\t/g, ' ').trim())
    .filter((line) => line && !PAGE_FURNITURE.test(line))

  const pairs: Pair[] = []
  // De laatste kale regels, als mogelijk begin van een afgebroken label.
  let carry: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const colon = line.indexOf(':')

    if (colon < 0) {
      pairs.push({ label: line, value: '', bare: true })
      // Een kop of een afgeronde zin hoort nooit bij het volgende label.
      carry = SECTION.test(line) || /[.!?]$/.test(line) || line.length > 70 ? [] : [...carry, line].slice(-3)
      continue
    }

    const head = line.slice(0, colon).trim()
    let value = line.slice(colon + 1).trim()

    if (!value) {
      const next = lines[index + 1]
      const after = lines[index + 2]
      const usable = next && !next.includes(':')
      // Staat er alléén een dubbele punt, dan stond het label volledig op de regels
      // ervoor en is wat volgt altijd de waarde. Staat er wel een label vóór de
      // dubbele punt, dan is de kale regel pas een waarde als daarna een nieuw
      // label of een kop begint — anders is het het vervolg van het label zelf.
      if (usable && (!head || !after || after.includes(':') || SECTION.test(after))) {
        value = next.trim()
        index += 1
      }
    }

    const label = head && (SECTION.test(head) || !carry.length) ? head : [...carry, head].filter(Boolean).join(' ')
    pairs.push({ label: label.replace(/\s+/g, ' ').trim(), value, bare: false })
    carry = []
  }

  return pairs
}

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function toCount(value: string): number | null {
  const digits = value.replace(/\D/g, '')
  if (!digits) return null
  const parsed = Number(digits)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/** Bedragen staan als "167 400 Euro" of "1.234.567,89 EUR" in de aankondiging. */
function toAmount(value: string): number | null {
  const cleaned = value.replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(/\s/g, '')
  const normalized = cleaned.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
}

/** "29/06/2026" → "2026-06-29"; andere notaties blijven ongemoeid. */
function toIsoDate(value: string): string | null {
  const match = value.match(/(\d{2})[/-](\d{2})[/-](\d{4})/)
  if (!match) return null
  return `${match[3]}-${match[2]}-${match[1]}`
}

function emptyLot(lot: string | null): AwardLot {
  return {
    lot,
    title: null,
    awarded: false,
    winners: [],
    losers: [],
    tenderCount: null,
    lowValue: null,
    highValue: null,
    contractDate: null,
  }
}

function addName(list: string[], name: string) {
  const trimmed = name.trim()
  if (trimmed && !list.includes(trimmed)) list.push(trimmed)
}

/**
 * eForms noemt in sectie 8 elke betrokken organisatie met haar rollen, waaronder
 * "Winnaar van deze percelen: LOT-0001". Sommige aankondigingen laten sectie 6.1.2
 * weg maar vullen die rol wel in; dan is dit de enige plek waar de winnaar staat.
 */
function winnersFromOrganisations(pairs: Pair[]): Map<string, string[]> {
  const byLot = new Map<string, string[]>()
  let name: string | null = null

  for (const { label, value } of pairs) {
    const key = normalizeLabel(label)
    if (/^8\.1\b/.test(key)) {
      name = null
      continue
    }
    if (/officiele naam$/.test(key) && value) {
      name = value
      continue
    }
    if (/winnaar van deze percelen$/.test(key) && name) {
      const lots = value.split(/[,;]/).map((lot) => lot.trim()).filter(Boolean)
      for (const lot of lots.length ? lots : ['']) {
        const list = byLot.get(lot) ?? []
        if (!list.includes(name)) list.push(name)
        byLot.set(lot, list)
      }
    }
  }

  return byLot
}

function parseEforms(pairs: Pair[]): AwardLot[] {
  const lots: AwardLot[] = []
  let current: AwardLot | null = null
  let section: 'winners' | 'losers' | null = null

  for (const { label, value } of pairs) {
    const key = normalizeLabel(label)

    if (/^6\.1 id resultaat perceel$/.test(key)) {
      if (current) lots.push(current)
      current = emptyLot(value || null)
      section = null
      continue
    }
    if (!current) continue

    if (/ten minste een winnaar (is )?gekozen/.test(key)) {
      current.awarded = true
      continue
    }
    if (/geen winnaar (is )?gekozen/.test(key)) {
      current.awarded = false
      continue
    }
    if (/^6\.1\.2 informatie over winnaars$/.test(key)) {
      section = 'winners'
      continue
    }
    if (/^6\.1\.3 niet-winnende inschrijvers$/.test(key)) {
      section = 'losers'
      continue
    }
    // Vanaf de statistiek en de organisatielijst horen namen niet meer bij een perceel.
    if (/^6\.1\.[4-9]/.test(key) || /^[78]\./.test(key)) section = null

    if (/officiele naam$/.test(key) && value) {
      if (section === 'winners') addName(current.winners, value)
      else if (section === 'losers') addName(current.losers, value)
      continue
    }
    if (/aantal ontvangen inschrijvingen of verzoeken tot deelname$/.test(key)) {
      const count = toCount(value)
      if (count) current.tenderCount = Math.max(current.tenderCount ?? 0, count)
      continue
    }
    if (/waarde van de laagste ontvankelijke inschrijving$/.test(key)) {
      current.lowValue = toAmount(value)
      continue
    }
    if (/waarde van de hoogste ontvankelijke inschrijving$/.test(key)) {
      current.highValue = toAmount(value)
      continue
    }
    if (/^titel$/.test(key) && value && !current.title) current.title = value
    if (/datum van sluiting van het contract$/.test(key) && value) current.contractDate = toIsoDate(value)
  }

  if (current) lots.push(current)
  return lots
}

function parseTed(pairs: Pair[]): AwardLot[] {
  const lots: AwardLot[] = []
  let current: AwardLot | null = null
  // Het TED-formulier zet de naam van de contractant onder een aparte kop; die
  // naam staat soms inline achter het label en soms op de volgende kale regel.
  let expecting: 'label' | 'value' | null = null

  for (const { label, value, bare } of pairs) {
    const key = normalizeLabel(label)

    if (/^opdracht nr\.?$/.test(key)) {
      if (current) lots.push(current)
      current = emptyLot(value && value !== '-' ? value : null)
      expecting = null
      continue
    }
    if (!current) continue

    if (/een opdracht\/perceel wordt gegund$/.test(key)) {
      current.awarded = /^ja\b/.test(normalizeLabel(value))
      continue
    }
    if (/^benaming$/.test(key) && value && value !== '-' && !current.title) {
      current.title = value
      continue
    }
    if (/^aantal (langs elektronische weg ontvangen )?inschrijvingen$/.test(key)) {
      const count = toCount(value)
      if (count) current.tenderCount = Math.max(current.tenderCount ?? 0, count)
      continue
    }
    if (/naam en adres van de (contractant|onderneming)/.test(key)) {
      expecting = 'label'
      continue
    }
    if (expecting === 'label' && /officiele (benaming|naam)$/.test(key)) {
      if (value) {
        addName(current.winners, value)
        expecting = null
      } else {
        expecting = 'value'
      }
      continue
    }
    if (expecting === 'value' && bare && label) {
      addName(current.winners, label)
      expecting = null
      continue
    }
    if (/laagste offerte$/.test(key)) {
      current.lowValue = toAmount(value)
      continue
    }
    if (/hoogste offerte$/.test(key)) {
      current.highValue = toAmount(value)
      continue
    }
    if (/datum van de sluiting van de overeenkomst$/.test(key)) {
      current.contractDate = value ? toIsoDate(value) : null
      continue
    }
    if (!current.contractDate && bare && /^\d{2}\/\d{2}\/\d{4}$/.test(label)) {
      current.contractDate = toIsoDate(label)
    }
  }

  if (current) lots.push(current)
  return lots
}

/** Herkent het formaat aan de sectienummering; eForms nummert de resultaten als 6.1. */
function detectFormat(text: string): AwardFormat {
  return /6\.1\s+ID resultaat perceel/i.test(text) ? 'eforms' : 'ted'
}

export function parseAwardNotice(text: string): ParsedAward {
  const format = detectFormat(text)
  const pairs = toPairs(text)
  const lots = format === 'eforms' ? parseEforms(pairs) : parseTed(pairs)

  if (format === 'eforms') {
    // Vul winnaars aan uit de organisatierollen wanneer sectie 6.1.2 ontbreekt.
    const byLot = winnersFromOrganisations(pairs)
    if (byLot.size) {
      for (const lot of lots) {
        if (lot.winners.length) continue
        const names = byLot.get(lot.lot ?? '') ?? (lots.length === 1 ? [...byLot.values()].flat() : [])
        names.forEach((name) => addName(lot.winners, name))
        if (lot.winners.length) lot.awarded = true
      }
    }
  }

  // Een aankondiging van vrijwillige transparantie noemt wél een contractant maar
  // geen gunningsregel. Een naam met een contract erachter is een gunning.
  for (const lot of lots) {
    if (!lot.awarded && lot.winners.length) lot.awarded = true
  }

  return { format, lots }
}
