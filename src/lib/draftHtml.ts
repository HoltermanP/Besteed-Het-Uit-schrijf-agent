// Browser-hulpfuncties op concept-HTML, gedeeld door de werkplek en het indieningsscherm.

/** Haal een element weg maar houd zijn inhoud op dezelfde plek. */
function unwrap(element: Element) {
  const parent = element.parentNode
  if (!parent) return
  while (element.firstChild) parent.insertBefore(element.firstChild, element)
  parent.removeChild(element)
}

/**
 * Verwijder editor-only annotaties (opmerking- en claimmarkeringen, herschrijf-ankers)
 * uit HTML vóór export/AI. De bewijsverwijzingen (`data-bewijs`) blijven staan: die zijn
 * geen annotatie maar de citatie van de schrijfagent, en gaan mee naar de volgende
 * versie en naar de review.
 */
export function stripCommentMarks(html: string): string {
  if (typeof document === 'undefined') return html
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll('.comment-mark, .claim-mark').forEach(unwrap)
  template.content.querySelectorAll('[data-rewrite-of]').forEach((el) => el.removeAttribute('data-rewrite-of'))
  return template.innerHTML
}

/**
 * Haal de bewijsverwijzingen uit de HTML. Ze zijn onzichtbaar op het scherm, maar in een
 * PDF of Word-bestand hoort geen enkel spoor van de interne bewijsvoering te staan.
 */
export function stripEvidenceMarks(html: string): string {
  if (typeof document === 'undefined') return html
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll('[data-bewijs]').forEach((element) => {
    if (element.tagName.toLowerCase() === 'span') unwrap(element)
    else element.removeAttribute('data-bewijs')
  })
  return template.innerHTML
}

/**
 * Markeer de fragmenten die de review als "claim zonder bewijs" aanmerkt, zodat de
 * schrijver in de tekst zelf ziet waar onderbouwing ontbreekt. Best-effort: een fragment
 * dat door opmaak over meerdere elementen loopt, wordt overgeslagen — de bevinding staat
 * dan alleen in het bewijspaneel. Geeft het aantal gemarkeerde fragmenten terug.
 */
export function markUnprovenClaims(root: HTMLElement, claims: Array<{ id: string; fragment: string }>): number {
  clearClaimMarks(root)
  let marked = 0

  for (const claim of claims) {
    const needle = claim.fragment.replace(/…$/, '').trim()
    if (needle.length < 12) continue

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode() as Text | null
    while (node) {
      const index = node.data.indexOf(needle)
      if (index >= 0) {
        const range = document.createRange()
        range.setStart(node, index)
        range.setEnd(node, index + needle.length)
        const mark = document.createElement('span')
        mark.className = 'claim-mark'
        mark.dataset.claimId = claim.id
        mark.title = 'Claim zonder bewijs — onderbouw met een bouwsteen of schrap de claim'
        try {
          range.surroundContents(mark)
          marked += 1
        } catch {
          // Fragment loopt door een element heen; laat de tekst met rust.
        }
        break
      }
      node = walker.nextNode() as Text | null
    }
  }

  return marked
}

/** Haal alle claimmarkeringen weg (nieuwe review, of de schrijver wil schoon werken). */
export function clearClaimMarks(root: HTMLElement) {
  root.querySelectorAll('.claim-mark').forEach(unwrap)
  root.normalize()
}

/** Veilige bestandsnaam uit vrije tekst: "Plan van Aanpak — Kwaliteit" → "plan-van-aanpak-kwaliteit". */
export function slugForFile(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'document'
  )
}
