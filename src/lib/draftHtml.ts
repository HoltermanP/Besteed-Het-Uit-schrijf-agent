// Browser-hulpfuncties op concept-HTML, gedeeld door de werkplek en het indieningsscherm.

/** Verwijder editor-only annotaties (markeringen, herschrijf-ankers) uit HTML vóór export/AI. */
export function stripCommentMarks(html: string): string {
  if (typeof document === 'undefined') return html
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll('.comment-mark').forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) return
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
  })
  template.content.querySelectorAll('[data-rewrite-of]').forEach((el) => el.removeAttribute('data-rewrite-of'))
  return template.innerHTML
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
