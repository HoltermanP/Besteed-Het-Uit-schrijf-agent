/**
 * Twee versies van een stuk naast elkaar leggen. De HTML wordt opgeknipt in blokken
 * (koppen, alinea's, lijsten, tabellen) die op tekst worden uitgelijnd; per regel zie je
 * of een blok gelijk is, gewijzigd, toegevoegd of verwijderd. Zo blijft de vergelijking
 * leesbaar als een document en niet als een reeks tags.
 */

export type DiffStatus = 'gelijk' | 'gewijzigd' | 'toegevoegd' | 'verwijderd'

export type DiffRow = {
  id: string
  status: DiffStatus
  /** HTML van het blok in versie A; ontbreekt als het blok daar niet stond. */
  left: string | null
  /** HTML van het blok in versie B; ontbreekt als het blok daar is verdwenen. */
  right: string | null
  addedWords: number
  removedWords: number
}

export type DraftDiff = {
  rows: DiffRow[]
  changed: number
  added: number
  removed: number
  identical: boolean
}

type Block = { html: string; text: string }

// Elementen die als los blok in de vergelijking komen.
const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'TABLE', 'BLOCKQUOTE', 'PRE', 'FIGURE', 'DL', 'HR', 'IMG',
])

// Omhulsels die we openbreken om bij de losse blokken te komen.
const CONTAINER_TAGS = new Set(['ARTICLE', 'SECTION', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'DIV'])

const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim()

function collectBlocks(parent: ParentNode, blocks: Block[]) {
  parent.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = normalizeText(node.textContent ?? '')
      if (text) blocks.push({ html: `<p>${text}</p>`, text })
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as HTMLElement
    const tag = element.tagName
    const hasElementChildren = element.children.length > 0
    if (CONTAINER_TAGS.has(tag) && hasElementChildren && !BLOCK_TAGS.has(tag)) {
      collectBlocks(element, blocks)
      return
    }
    if (tag === 'DIV' && hasElementChildren) {
      collectBlocks(element, blocks)
      return
    }
    blocks.push({ html: element.outerHTML, text: normalizeText(element.textContent ?? '') })
  })
}

/** Knip een concept in vergelijkbare blokken. Zonder DOM (server) blijft het één blok. */
export function splitBlocks(html: string): Block[] {
  const source = (html ?? '').trim()
  if (!source) return []
  if (typeof document === 'undefined') return [{ html: source, text: normalizeText(source.replace(/<[^>]+>/g, ' ')) }]
  const template = document.createElement('template')
  template.innerHTML = source
  const blocks: Block[] = []
  collectBlocks(template.content, blocks)
  return blocks.length ? blocks : [{ html: source, text: normalizeText(source.replace(/<[^>]+>/g, ' ')) }]
}

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []

/** Lengte van de langste gemeenschappelijke deelrij; begrensd zodat grote stukken snel blijven. */
function lcsLength(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  let previous = new Array<number>(b.length + 1).fill(0)
  let current = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1])
    }
    const swap = previous
    previous = current
    current = swap
    current.fill(0)
  }
  return previous[b.length]
}

const WORD_DIFF_LIMIT = 400

/** Hoeveel woorden er in dit blok bij kwamen en verdwenen. */
function wordDelta(leftText: string, rightText: string): { addedWords: number; removedWords: number } {
  const left = words(leftText)
  const right = words(rightText)
  if (left.length > WORD_DIFF_LIMIT || right.length > WORD_DIFF_LIMIT) {
    // Te lang voor een exacte vergelijking: benader met het verschil in aantal woorden.
    const delta = right.length - left.length
    return { addedWords: Math.max(delta, 0), removedWords: Math.max(-delta, 0) }
  }
  const common = lcsLength(left, right)
  return { addedWords: right.length - common, removedWords: left.length - common }
}

type Op = { left: number | null; right: number | null; equal: boolean }

/** Uitlijning van twee blokreeksen op basis van de langste gemeenschappelijke deelrij. */
function alignBlocks(left: Block[], right: Block[]): Op[] {
  const ops: Op[] = []
  // Te groot voor de DP-tabel: val terug op een positionele vergelijking.
  if (left.length * right.length > 250_000) {
    const max = Math.max(left.length, right.length)
    for (let i = 0; i < max; i += 1) {
      ops.push({
        left: i < left.length ? i : null,
        right: i < right.length ? i : null,
        equal: i < left.length && i < right.length && left[i].text === right[i].text,
      })
    }
    return ops
  }

  const table: number[][] = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0))
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        left[i].text === right[j].text && left[i].text
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }

  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    if (left[i].text === right[j].text && left[i].text) {
      ops.push({ left: i, right: j, equal: true })
      i += 1
      j += 1
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ left: i, right: null, equal: false })
      i += 1
    } else {
      ops.push({ left: null, right: j, equal: false })
      j += 1
    }
  }
  while (i < left.length) ops.push({ left: i++, right: null, equal: false })
  while (j < right.length) ops.push({ left: null, right: j++, equal: false })
  return ops
}

/**
 * Vergelijk twee versies. Blokken die alleen links staan en blokken die alleen rechts
 * staan, worden binnen dezelfde onderbreking op volgorde aan elkaar gekoppeld: dat leest
 * als "dit stuk is herschreven" in plaats van als een verwijdering plus een toevoeging.
 */
export function diffDraftHtml(leftHtml: string, rightHtml: string): DraftDiff {
  const left = splitBlocks(leftHtml)
  const right = splitBlocks(rightHtml)
  const ops = alignBlocks(left, right)

  const rows: DiffRow[] = []
  let index = 0
  let cursor = 0
  while (cursor < ops.length) {
    const op = ops[cursor]
    if (op.equal) {
      rows.push({
        id: `row-${index++}`,
        status: 'gelijk',
        left: left[op.left!].html,
        right: right[op.right!].html,
        addedWords: 0,
        removedWords: 0,
      })
      cursor += 1
      continue
    }

    // Verzamel de hele onderbreking (alles tot de volgende gelijke regel).
    const removed: number[] = []
    const added: number[] = []
    while (cursor < ops.length && !ops[cursor].equal) {
      if (ops[cursor].left !== null) removed.push(ops[cursor].left!)
      if (ops[cursor].right !== null) added.push(ops[cursor].right!)
      cursor += 1
    }
    const pairs = Math.min(removed.length, added.length)
    for (let pair = 0; pair < pairs; pair += 1) {
      const leftBlock = left[removed[pair]]
      const rightBlock = right[added[pair]]
      rows.push({
        id: `row-${index++}`,
        status: 'gewijzigd',
        left: leftBlock.html,
        right: rightBlock.html,
        ...wordDelta(leftBlock.text, rightBlock.text),
      })
    }
    for (let extra = pairs; extra < removed.length; extra += 1) {
      const block = left[removed[extra]]
      rows.push({
        id: `row-${index++}`,
        status: 'verwijderd',
        left: block.html,
        right: null,
        addedWords: 0,
        removedWords: words(block.text).length,
      })
    }
    for (let extra = pairs; extra < added.length; extra += 1) {
      const block = right[added[extra]]
      rows.push({
        id: `row-${index++}`,
        status: 'toegevoegd',
        left: null,
        right: block.html,
        addedWords: words(block.text).length,
        removedWords: 0,
      })
    }
  }

  const changed = rows.filter((row) => row.status === 'gewijzigd').length
  const added = rows.filter((row) => row.status === 'toegevoegd').length
  const removed = rows.filter((row) => row.status === 'verwijderd').length
  return { rows, changed, added, removed, identical: !changed && !added && !removed }
}
