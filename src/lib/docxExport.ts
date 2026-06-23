import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type IParagraphOptions,
  type ITableCellBorders,
} from 'docx'
import { saveAs } from 'file-saver'

// Merkkleuren (hex zonder #), afgeleid van proposalDocument.css.
const TEAL = '164F4A'
const ORANGE = 'B3541E'
const DARK = '172033'
const GRAY = '475569'
const SLATE = '334155'
const LIGHT_BG = 'F8FBFB'
const WARM_BG = 'FFF8F2'
const LINE = 'D9E0DF'
const BORDER = 'CBD5E1'

type RunOpts = {
  bold?: boolean
  italics?: boolean
  color?: string
  size?: number
  allCaps?: boolean
}

type Ctx = { nextOlRef: () => string }

const BLOCK_SPAN_CLASSES = [
  'step-no',
  'step-title',
  'step-detail',
  'grid-label',
  'grid-body',
  'mx-label',
  'org-role',
  'org-name',
  'tl-when',
  'tl-title',
  'tl-detail',
]

function isBlockSpan(el: Element): boolean {
  return BLOCK_SPAN_CLASSES.some((cls) => el.classList.contains(cls))
}

/** Inline-tekst → TextRuns; verwerkt nesting van <strong>/<em>/<span> en <br>. */
function inlineRuns(node: Node, opts: RunOpts = {}): TextRun[] {
  const runs: TextRun[] = []
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      const text = (child.textContent ?? '').replace(/\s+/g, ' ')
      if (text) runs.push(new TextRun({ text, ...opts }))
      return
    }
    if (child.nodeType !== 1) return
    const el = child as Element
    const tag = el.tagName.toLowerCase()
    if (tag === 'br') {
      runs.push(new TextRun({ text: '', break: 1 }))
    } else if (tag === 'strong' || tag === 'b') {
      runs.push(...inlineRuns(el, { ...opts, bold: true }))
    } else if (tag === 'em' || tag === 'i') {
      runs.push(...inlineRuns(el, { ...opts, italics: true }))
    } else {
      runs.push(...inlineRuns(el, opts))
    }
  })
  return runs
}

function blockSpanStyle(el: Element): RunOpts {
  const cls = el.classList
  if (cls.contains('step-no')) return { bold: true, color: TEAL, size: 20 }
  if (cls.contains('org-role')) return { bold: true, color: TEAL, size: 15, allCaps: true }
  if (cls.contains('tl-when')) return { bold: true, color: TEAL, size: 20 }
  if (
    cls.contains('step-title') ||
    cls.contains('grid-label') ||
    cls.contains('mx-label') ||
    cls.contains('tl-title') ||
    cls.contains('org-name')
  ) {
    return { bold: true, color: DARK, size: 21 }
  }
  return { color: GRAY, size: 20 }
}

/** Inhoud van een tabelcel → docx-blokken (alinea's en evt. geneste tabel). */
function cellBlocks(el: Element, ctx: Ctx, runOpts: RunOpts): (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = []
  let runs: TextRun[] = []
  const flush = () => {
    if (runs.length) {
      blocks.push(new Paragraph({ children: runs, spacing: { after: 40 } }))
      runs = []
    }
  }

  el.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      const text = (child.textContent ?? '').replace(/\s+/g, ' ')
      if (text.trim()) runs.push(new TextRun({ text, ...runOpts }))
      return
    }
    if (child.nodeType !== 1) return
    const node = child as Element
    const tag = node.tagName.toLowerCase()

    if (tag === 'br') {
      runs.push(new TextRun({ text: '', break: 1 }))
    } else if (tag === 'strong' || tag === 'b') {
      runs.push(...inlineRuns(node, { ...runOpts, bold: true }))
    } else if (tag === 'em' || tag === 'i') {
      runs.push(...inlineRuns(node, { ...runOpts, italics: true }))
    } else if (tag === 'span' && isBlockSpan(node)) {
      flush()
      const style = blockSpanStyle(node)
      blocks.push(new Paragraph({ children: inlineRuns(node, style), spacing: { after: 30 } }))
    } else if (tag === 'span' && node.querySelector('span')) {
      // Container-span (bijv. .org-box) → recursief als blokken.
      flush()
      blocks.push(...cellBlocks(node, ctx, runOpts))
    } else if (tag === 'span' || tag === 'a') {
      runs.push(...inlineRuns(node, runOpts))
    } else if (tag === 'ul' || tag === 'ol') {
      flush()
      blocks.push(...listBlocks(node, ctx))
    } else if (tag === 'table') {
      flush()
      blocks.push(...tableBlocks(node, ctx))
    } else if (tag === 'p' || tag === 'div') {
      flush()
      blocks.push(...cellBlocks(node, ctx, runOpts))
    } else {
      runs.push(...inlineRuns(node, runOpts))
    }
  })

  flush()
  if (!blocks.length) blocks.push(new Paragraph({}))
  return blocks
}

function cellFill(cell: Element, tableEl: Element, isHeader: boolean): string | null {
  if (isHeader) return TEAL
  const cls = cell.classList
  if (cls.contains('mx-hot')) return WARM_BG
  if (cls.contains('mx-cell') || cls.contains('process-step')) return LIGHT_BG
  if (tableEl.classList.contains('model-grid') && cell.tagName.toLowerCase() === 'td') return LIGHT_BG
  return null
}

function tableBorders(tableEl: Element) {
  if (tableEl.classList.contains('timeline')) {
    const none = { style: BorderStyle.NONE, size: 0, color: 'auto' }
    return { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none }
  }
  const line = { style: BorderStyle.SINGLE, size: 4, color: BORDER }
  return { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line }
}

function renderRow(tr: Element, tableEl: Element, ctx: Ctx): TableRow {
  const isHeaderRow = !!tr.closest('thead')
  const cells = Array.from(tr.children).filter((c) => /^(td|th)$/i.test(c.tagName))
  const tableCells = cells.map((cell) => {
    const isHeader = isHeaderRow || cell.tagName.toLowerCase() === 'th'
    const runOpts: RunOpts = isHeader ? { bold: true, color: 'FFFFFF', size: 20 } : { color: DARK, size: 20 }
    const fill = cellFill(cell, tableEl, isHeader)
    const colSpan = (cell as HTMLTableCellElement).colSpan
    return new TableCell({
      children: cellBlocks(cell, ctx, runOpts) as (Paragraph | Table)[],
      verticalAlign: VerticalAlign.TOP,
      columnSpan: colSpan > 1 ? colSpan : undefined,
      shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
    })
  })
  return new TableRow({ children: tableCells, tableHeader: isHeaderRow })
}

/** <table> → caption-alinea (optioneel) + docx Table. */
function tableBlocks(tableEl: Element, ctx: Ctx): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = []
  const caption = tableEl.querySelector(':scope > caption')
  if (caption?.textContent?.trim()) {
    result.push(
      new Paragraph({
        children: inlineRuns(caption, { bold: true, color: TEAL, size: 18 }),
        spacing: { before: 80, after: 60 },
      }),
    )
  }

  const rows = Array.from(tableEl.querySelectorAll('tr')).filter(
    // Geneste tabellen (org-reports) worden via de cel zelf gerenderd; sla die rijen hier over.
    (tr) => tr.closest('table') === tableEl,
  )
  if (!rows.length) return result

  result.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorders(tableEl),
      rows: rows.map((tr) => renderRow(tr, tableEl, ctx)),
    }),
  )
  return result
}

function listBlocks(listEl: Element, ctx: Ctx): Paragraph[] {
  const ordered = listEl.tagName.toLowerCase() === 'ol'
  const reference = ordered ? ctx.nextOlRef() : null
  const items = Array.from(listEl.children).filter((li) => li.tagName.toLowerCase() === 'li')
  return items.map((li) => {
    const children = inlineRuns(li, { color: DARK, size: 21 })
    if (ordered && reference) {
      return new Paragraph({ children, spacing: { after: 40 }, numbering: { reference, level: 0 } })
    }
    return new Paragraph({ children, spacing: { after: 40 }, bullet: { level: 0 } })
  })
}

function docMetaTable(dl: Element): Table {
  const items = Array.from(dl.children).filter((child) => child.tagName.toLowerCase() === 'div')
  const bottom = { style: BorderStyle.SINGLE, size: 4, color: LINE }
  const none = { style: BorderStyle.NONE, size: 0, color: 'auto' }
  const cellBorders: ITableCellBorders = { top: none, bottom, left: none, right: none }
  const rows = items.map((item) => {
    const label = item.querySelector('dt')?.textContent ?? ''
    const value = item.querySelector('dd')?.textContent ?? ''
    return new TableRow({
      children: [
        new TableCell({
          width: { size: 32, type: WidthType.PERCENTAGE },
          borders: cellBorders,
          margins: { top: 60, bottom: 60, left: 0, right: 100 },
          children: [
            new Paragraph({ children: [new TextRun({ text: label, bold: true, color: GRAY, size: 16, allCaps: true })] }),
          ],
        }),
        new TableCell({
          borders: cellBorders,
          margins: { top: 60, bottom: 60, left: 0, right: 0 },
          children: [new Paragraph({ children: [new TextRun({ text: value, bold: true, color: TEAL, size: 21 })] })],
        }),
      ],
    })
  })
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
}

function paragraphForP(p: Element): Paragraph {
  const cls = p.classList
  let opts: RunOpts = { color: DARK, size: 21 }
  let spacing: IParagraphOptions['spacing'] = { after: 140 }
  if (cls.contains('kicker')) {
    opts = { bold: true, color: ORANGE, size: 16, allCaps: true }
    spacing = { after: 60 }
  } else if (cls.contains('doc-subtitle')) {
    opts = { bold: true, color: GRAY, size: 20 }
    spacing = { after: 60 }
  } else if (cls.contains('lead')) {
    opts = { color: SLATE, size: 24 }
    spacing = { before: 80, after: 160 }
  } else if (cls.contains('section-subtitle')) {
    opts = { italics: true, color: GRAY, size: 18 }
    spacing = { after: 120 }
  }
  return new Paragraph({ children: inlineRuns(p, opts), spacing })
}

function headingParagraph(el: Element, size: number, withBorder: boolean): Paragraph {
  return new Paragraph({
    heading: size >= 40 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    children: inlineRuns(el, { bold: true, color: size >= 40 ? DARK : TEAL, size }),
    spacing: { before: size >= 40 ? 0 : 220, after: size >= 40 ? 200 : 100 },
    border: withBorder
      ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 6 } }
      : undefined,
  })
}

function blockToElements(el: Element, ctx: Ctx): (Paragraph | Table)[] {
  const tag = el.tagName.toLowerCase()
  const cls = el.classList

  switch (tag) {
    case 'h1':
      return [headingParagraph(el, 46, false)]
    case 'h2':
      return [headingParagraph(el, 30, true)]
    case 'h3':
      return [headingParagraph(el, 24, false)]
    case 'h4':
      return [headingParagraph(el, 22, false)]
    case 'p':
      return [paragraphForP(el)]
    case 'blockquote':
      return [
        new Paragraph({
          children: inlineRuns(el, { italics: true, color: GRAY, size: 20 }),
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: WARM_BG },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: ORANGE, space: 10 } },
          indent: { left: 220 },
          spacing: { before: 80, after: 140 },
        }),
      ]
    case 'ul':
    case 'ol':
      return listBlocks(el, ctx)
    case 'dl':
      return cls.contains('doc-meta') ? [docMetaTable(el)] : containerBlocks(el, ctx)
    case 'figure':
      return containerBlocks(el, ctx)
    case 'figcaption':
      return [
        new Paragraph({
          children: inlineRuns(el, { bold: true, color: TEAL, size: 18, allCaps: true }),
          spacing: { before: 80, after: 80 },
        }),
      ]
    case 'table':
      return tableBlocks(el, ctx)
    case 'div':
      return containerBlocks(el, ctx)
    case 'header':
    case 'section':
    case 'article':
      return containerBlocks(el, ctx)
    default:
      return containerBlocks(el, ctx)
  }
}

/** Itereer kindelementen van een container en map ze naar blokken. */
function containerBlocks(el: Element, ctx: Ctx): (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = []
  el.childNodes.forEach((child) => {
    if (child.nodeType === 1) {
      blocks.push(...blockToElements(child as Element, ctx))
    } else if (child.nodeType === 3 && (child.textContent ?? '').trim()) {
      blocks.push(new Paragraph({ children: [new TextRun({ text: child.textContent!.trim(), color: DARK, size: 21 })] }))
    }
  })
  return blocks
}

export async function exportDocxDocument(html: string, _title: string, filename: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const root = parsed.querySelector('.proposal-doc') ?? parsed.body

  let olCounter = 0
  const ctx: Ctx = { nextOlRef: () => `ol-${olCounter++}` }

  const children = containerBlocks(root, ctx)

  const olCount = root.querySelectorAll('ol').length
  const numberingConfig = Array.from({ length: olCount }, (_value, index) => ({
    reference: `ol-${index}`,
    levels: [
      {
        level: 0,
        format: LevelFormat.DECIMAL,
        text: '%1.',
        alignment: AlignmentType.START,
        style: { paragraph: { indent: { left: 460, hanging: 280 } } },
      },
    ],
  }))

  const doc = new Document({
    numbering: { config: numberingConfig },
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 21, color: DARK } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
          },
        },
        children,
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, filename)
}
