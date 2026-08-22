import {
  evidenceKindLabels,
  type EvidenceBlock,
  type EvidenceKind,
  type EvidenceUsability,
} from '../types/evidenceBlock'

/*
 * Gedeelde regels rond bewijsbouwstenen: welke bouwsteen geciteerd mag worden, onder
 * welke verwijzing, en hoe hij aan de schrijfagent en de reviewer wordt aangeboden.
 * Bewust puur (geen DOM, geen fetch) zodat zowel de werkplek als de server-endpoints
 * er dezelfde uitkomst uit halen.
 */

/**
 * Korte, stabiele verwijzing naar een bouwsteen ("B4F19C"). De schrijfagent zet die in
 * `data-bewijs` bij een geciteerd feit; de reviewer en de werkplek zoeken de bouwsteen
 * er weer mee terug. Afgeleid van het id, dus stabiel over generaties heen.
 */
export function evidenceHandle(id: string): string {
  const clean = id.replace(/[^a-z0-9]/gi, '')
  return `B${clean.slice(-6).toUpperCase()}`
}

/** YYYY-MM-DD van vandaag; als peildatum voor houdbaarheid. */
export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Mag deze bouwsteen geciteerd worden? Zonder vastgelegd bewijs is het een aanname en
 * gaat hij niet naar de schrijfagent; na de houdbaarheidsdatum is het cijfer niet meer
 * hard genoeg voor een inschrijving.
 */
export function evidenceUsability(block: EvidenceBlock, peildatum = today()): EvidenceUsability {
  if (!block.proof.trim()) return 'geen-bewijs'
  if (block.validUntil && block.validUntil < peildatum) return 'verlopen'
  return 'citeerbaar'
}

export function isCitable(block: EvidenceBlock, peildatum = today()): boolean {
  return evidenceUsability(block, peildatum) === 'citeerbaar'
}

/** Cijferwaarde met eenheid ("98%", "12 fte"); leeg als er geen waarde is vastgelegd. */
export function evidenceValueLabel(block: EvidenceBlock): string {
  if (!block.value?.trim()) return ''
  const unit = block.unit?.trim() ?? ''
  if (!unit) return block.value.trim()
  // Tekens als %, € en / plakken aan het getal vast; woorden als "fte" krijgen een spatie.
  return /^[^\p{L}\d]/u.test(unit) ? `${block.value.trim()}${unit}` : `${block.value.trim()} ${unit}`
}

/** Eén regel die zegt wat deze bouwsteen beweert — voor lijsten en voor de AI-selectie. */
export function evidenceSummary(block: EvidenceBlock): string {
  const value = evidenceValueLabel(block)
  const parts = [value ? `${value} — ${block.claim}` : block.claim]
  if (block.result.trim()) parts.push(`Resultaat: ${block.result.trim()}`)
  return parts.join(' ')
}

/** Kop van een bouwsteen in de prompt: handle, soort, klant en periode. */
function evidenceHeading(block: EvidenceBlock): string {
  const meta = [evidenceKindLabels[block.kind], block.client, block.period, block.category]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' · ')
  return `[${evidenceHandle(block.id)}] ${block.title}${meta ? ` (${meta})` : ''}`
}

/**
 * De bouwstenen zoals de schrijfagent ze krijgt: één blok tekst met per bouwsteen de
 * verwijzing waarmee hij geciteerd moet worden. Alleen citeerbare bouwstenen.
 */
export function evidenceToPromptContent(blocks: EvidenceBlock[]): string {
  return blocks
    .map((block) => {
      const lines = [evidenceHeading(block)]
      const value = evidenceValueLabel(block)
      if (value) lines.push(`   Waarde: ${value}`)
      if (block.situation.trim()) lines.push(`   Context: ${block.situation.trim()}`)
      lines.push(`   Feit (letterlijk bruikbaar): ${block.claim.trim()}`)
      if (block.result.trim()) lines.push(`   Resultaat: ${block.result.trim()}`)
      lines.push(`   Bewijs: ${block.proof.trim()}${block.verifiedOn ? ` (geverifieerd ${block.verifiedOn})` : ''}`)
      return lines.join('\n')
    })
    .join('\n\n')
}

/** Compacte lijst voor de reviewer: waartegen hij de claims in het concept mag toetsen. */
export function evidenceForReview(blocks: EvidenceBlock[]): Array<{
  handle: string
  kind: EvidenceKind
  title: string
  summary: string
}> {
  return blocks.map((block) => ({
    handle: evidenceHandle(block.id),
    kind: block.kind,
    title: block.title,
    summary: evidenceSummary(block),
  }))
}

/** De verwijzingen die daadwerkelijk in een concept zijn geciteerd (data-bewijs="…"). */
export function citedHandles(html: string): string[] {
  const found = new Set<string>()
  for (const match of html.matchAll(/data-bewijs="([^"]+)"/gi)) {
    match[1]
      .split(/[\s,]+/)
      .map((handle) => handle.trim().toUpperCase())
      .filter(Boolean)
      .forEach((handle) => found.add(handle))
  }
  return [...found]
}

/** Zoek de bouwsteen bij een verwijzing uit het concept of uit een reviewbevinding. */
export function blockByHandle(blocks: EvidenceBlock[], handle: string): EvidenceBlock | null {
  const wanted = handle.trim().toUpperCase()
  return blocks.find((block) => evidenceHandle(block.id) === wanted) ?? null
}
