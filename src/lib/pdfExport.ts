import { jsPDF } from 'jspdf'

/**
 * PDF-export met échte tekst (selecteerbaar, doorzoekbaar) en nette paginaovergangen.
 *
 * De eerdere export rasterde het concept via html2canvas en sneed die afbeelding op
 * vaste hoogte door: geen tekstlaag (inschrijfplatforms weigeren zo'n PDF) en regels
 * die halverwege werden afgebroken. Deze bouwer loopt zelf door de HTML van het
 * concept (dezelfde structuur als de Word-export in docxExport.ts), zet de tekst
 * regel voor regel met jsPDF en bewaakt de paginaovergangen:
 *   - een regel wordt nooit doormidden gesneden;
 *   - alinea's laten minimaal twee regels onder- en bovenaan een pagina staan;
 *   - koppen blijven bij de tekst die erop volgt;
 *   - tabellen breken tussen rijen en herhalen de kopregel op de volgende pagina;
 *   - figuren (procesflow, tijdlijn, organogram, matrix, modelraster) en het
 *     metadata-blok blijven waar mogelijk op één pagina;
 *   - elke pagina krijgt een voettekst met titel en "Pagina X van Y".
 *
 * Gebruikt het ingebouwde Helvetica-lettertype (WinAnsi-codering: alle Nederlandse
 * tekens, euroteken, gedachtestreepjes en aanhalingstekens), zodat er geen lettertype
 * hoeft te worden meegebundeld en de tekstlaag gegarandeerd is.
 */

type Rgb = [number, number, number]

// Merkkleuren, afgeleid van proposalDocument.css.
const TEAL: Rgb = [22, 79, 74]
const ORANGE: Rgb = [179, 84, 30]
const DARK: Rgb = [23, 32, 51]
const GRAY: Rgb = [71, 85, 105]
const SLATE: Rgb = [51, 65, 85]
const WHITE: Rgb = [255, 255, 255]
const GREEN: Rgb = [47, 143, 107]
const LIGHT_BG: Rgb = [248, 251, 251]
const WARM_BG: Rgb = [255, 248, 242]
const WARM_BORDER: Rgb = [240, 211, 188]
const WARM_TEXT: Rgb = [124, 58, 18]
const LINE: Rgb = [217, 224, 223]
const BORDER: Rgb = [203, 213, 225]
const CARD_BORDER: Rgb = [207, 224, 221]
const CAPTION_BG: Rgb = [238, 243, 242]

// A4 in punten.
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN_X = 56
const MARGIN_TOP = 56
const MARGIN_BOTTOM = 64
const CONTENT_W = PAGE_W - MARGIN_X * 2
const CONTENT_H = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM
const FOOTER_Y = PAGE_H - 34

type TextStyle = {
  size: number
  color: Rgb
  bold?: boolean
  italic?: boolean
  caps?: boolean
  /** Regelhoogte als factor van de lettergrootte (standaard 1.5). */
  lineHeight?: number
}

const st = (size: number, color: Rgb, extra: Partial<TextStyle> = {}): TextStyle => ({ size, color, ...extra })

const STYLE = {
  body: st(10.5, DARK),
  lead: st(12, SLATE),
  kicker: st(8, ORANGE, { bold: true, caps: true, lineHeight: 1.2 }),
  subtitle: st(10, GRAY, { bold: true }),
  h1: st(23, DARK, { bold: true, lineHeight: 1.15 }),
  h2: st(15, TEAL, { bold: true, lineHeight: 1.25 }),
  h3: st(12, TEAL, { bold: true, lineHeight: 1.3 }),
  h4: st(11, DARK, { bold: true, lineHeight: 1.3 }),
  sectionSubtitle: st(9.5, GRAY, { italic: true }),
  quote: st(10, GRAY),
  notice: st(10, WARM_TEXT),
  noticeTitle: st(11, ORANGE, { bold: true }),
  cell: st(9.5, DARK, { lineHeight: 1.4 }),
  cellHead: st(9.5, WHITE, { bold: true, lineHeight: 1.4 }),
  cellSmall: st(9, DARK, { lineHeight: 1.4 }),
  caption: st(9.5, TEAL, { bold: true, caps: true, lineHeight: 1.3 }),
  tableCaption: st(9.5, TEAL, { bold: true, lineHeight: 1.3 }),
  metaLabel: st(7.5, GRAY, { bold: true, caps: true, lineHeight: 1.3 }),
  metaValue: st(10, TEAL, { bold: true, lineHeight: 1.35 }),
  stepNo: st(9, WHITE, { bold: true, lineHeight: 1 }),
  stepTitle: st(10, DARK, { bold: true, lineHeight: 1.3 }),
  stepDetail: st(8.5, GRAY, { lineHeight: 1.4 }),
  arrow: st(18, ORANGE, { bold: true, lineHeight: 1 }),
  tlWhen: st(9.5, TEAL, { bold: true, lineHeight: 1.4 }),
  tlTitle: st(10, DARK, { bold: true, lineHeight: 1.3 }),
  tlDetail: st(9, GRAY, { lineHeight: 1.4 }),
  orgRole: st(8, TEAL, { bold: true, caps: true, lineHeight: 1.4 }),
  orgName: st(10, DARK, { bold: true, lineHeight: 1.3 }),
  axis: st(8.5, TEAL, { bold: true, caps: true, lineHeight: 1.4 }),
  mxLabel: st(9.5, DARK, { bold: true, lineHeight: 1.4 }),
  gridLabel: st(9.5, TEAL, { bold: true, lineHeight: 1.4 }),
  gridBody: st(9, SLATE, { lineHeight: 1.45 }),
  footer: st(8, GRAY),
}

type Run = { text: string; style: TextStyle }
type Piece = { text: string; x: number; style: TextStyle }
type Line = {
  pieces: Piece[]
  width: number
  height: number
  maxSize: number
  /** Inspringing vanaf de linkerkant van het tekstvak. */
  x0: number
  marker?: Piece
  gapAfter: number
  align?: 'left' | 'center' | 'right'
}
type Para = {
  runs: Run[]
  indent: number
  marker?: { text: string; style: TextStyle; width: number }
  gapAfter: number
  align?: Line['align']
}

const NEWLINE = '\n'

/* ---------- Tekst: WinAnsi-compatibel maken ---------- */

const CHAR_MAP: Record<string, string> = {
  '→': '->', // →
  '←': '<-', // ←
  '↔': '<->', // ↔
  '⇒': '=>', // ⇒
  '✓': 'v', // ✓
  '✔': 'v', // ✔
  '✗': 'x', // ✗
  '✘': 'x', // ✘
  '≥': '>=', // ≥
  '≤': '<=', // ≤
  '≠': '<>', // ≠
  '−': '-', // minusteken
  '‑': '-', // vast koppelteken
  '′': "'", // ′
  '″': '"', // ″
  ' ': ' ', // vaste spatie
  ' ': ' ', // smalle spatie
  ' ': ' ', // smalle vaste spatie
  '​': '', // zero-width space
  ' ': ' ',
  ' ': ' ',
}

const WIN_ANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018,
  0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
])

/** Helvetica in jsPDF kent alleen WinAnsi; vervang of strip tekens daarbuiten. */
function sanitize(text: string): string {
  let out = ''
  for (const ch of text) {
    const mapped = CHAR_MAP[ch]
    if (mapped !== undefined) {
      out += mapped
      continue
    }
    const code = ch.codePointAt(0) ?? 0
    if (code < 0x100 || WIN_ANSI_EXTRA.has(code)) {
      out += ch
      continue
    }
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (base && (base.codePointAt(0) ?? 0) < 0x100) {
      out += base
    } else if (code < 0x2190) {
      out += '?'
    }
    // Pijlen, symbolen en emoji buiten de kaart vallen weg.
  }
  return out
}

function styleKey(s: TextStyle) {
  return `${s.size}|${s.bold ? 1 : 0}${s.italic ? 1 : 0}|${s.color.join(',')}`
}

function lineHeightOf(s: TextStyle) {
  return s.size * (s.lineHeight ?? 1.5)
}

/* ---------- DOM → runs/paragrafen ---------- */

const BLOCK_SPAN_STYLES: Record<string, TextStyle> = {
  'step-no': STYLE.stepNo,
  'step-title': STYLE.stepTitle,
  'step-detail': STYLE.stepDetail,
  'grid-label': STYLE.gridLabel,
  'grid-body': STYLE.gridBody,
  'mx-label': STYLE.mxLabel,
  'org-role': STYLE.orgRole,
  'org-name': STYLE.orgName,
  'tl-when': STYLE.tlWhen,
  'tl-title': STYLE.tlTitle,
  'tl-detail': STYLE.tlDetail,
}

function blockSpanStyle(el: Element): TextStyle | null {
  for (const cls of Object.keys(BLOCK_SPAN_STYLES)) {
    if (el.classList.contains(cls)) return BLOCK_SPAN_STYLES[cls]
  }
  return null
}

function pushText(out: Run[], raw: string, style: TextStyle) {
  let text = sanitize(raw.replace(/\s+/g, ' '))
  if (!text) return
  if (style.caps) text = text.toUpperCase()
  out.push({ text, style })
}

const SKIP_INLINE = new Set(['ul', 'ol', 'table', 'figure', 'script', 'style'])

/** Inline-inhoud van een element → runs (verwerkt strong/em/a/br en geneste spans). */
function inlineRuns(node: Node, style: TextStyle, out: Run[] = []): Run[] {
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      pushText(out, child.textContent ?? '', style)
      return
    }
    if (child.nodeType !== 1) return
    const el = child as Element
    const tag = el.tagName.toLowerCase()
    if (SKIP_INLINE.has(tag)) return
    const spanStyle = tag === 'span' ? blockSpanStyle(el) : null
    if (tag === 'br') {
      out.push({ text: NEWLINE, style })
    } else if (tag === 'strong' || tag === 'b') {
      inlineRuns(el, { ...style, bold: true }, out)
    } else if (tag === 'em' || tag === 'i') {
      inlineRuns(el, { ...style, italic: true }, out)
    } else if (tag === 'a') {
      inlineRuns(el, { ...style, color: TEAL }, out)
    } else if (tag === 'p' || tag === 'div' || tag === 'li') {
      inlineRuns(el, style, out)
      out.push({ text: NEWLINE, style })
    } else if (spanStyle) {
      if (out.length) out.push({ text: NEWLINE, style })
      inlineRuns(el, spanStyle, out)
      out.push({ text: NEWLINE, style })
    } else {
      inlineRuns(el, style, out)
    }
  })
  return out
}

function hasText(runs: Run[]) {
  return runs.some((run) => run.text !== NEWLINE && run.text.trim() !== '')
}

/**
 * Inhoud van een cel/blok → paragrafen (met opsommingstekens voor lijsten, eigen
 * regels voor blok-spans zoals .step-title, en geneste tabellen platgeslagen).
 */
function cellParagraphs(el: Element, base: TextStyle, indent = 0, out: Para[] = []): Para[] {
  let runs: Run[] = []
  const flush = (gap = 3) => {
    if (hasText(runs)) out.push({ runs, indent, gapAfter: gap })
    runs = []
  }

  el.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      pushText(runs, child.textContent ?? '', base)
      return
    }
    if (child.nodeType !== 1) return
    const node = child as Element
    const tag = node.tagName.toLowerCase()
    const spanStyle = tag === 'span' ? blockSpanStyle(node) : null

    if (tag === 'br') {
      runs.push({ text: NEWLINE, style: base })
    } else if (tag === 'strong' || tag === 'b') {
      inlineRuns(node, { ...base, bold: true }, runs)
    } else if (tag === 'em' || tag === 'i') {
      inlineRuns(node, { ...base, italic: true }, runs)
    } else if (tag === 'a') {
      inlineRuns(node, { ...base, color: TEAL }, runs)
    } else if (spanStyle) {
      flush()
      if (node.querySelector('ul, ol, table')) {
        cellParagraphs(node, spanStyle, indent, out)
      } else {
        const spanRuns = inlineRuns(node, spanStyle)
        if (hasText(spanRuns)) out.push({ runs: spanRuns, indent, gapAfter: 2 })
      }
    } else if (tag === 'span' && node.querySelector('span, ul, ol')) {
      // Container-span (bijv. .org-box) → recursief als blokken.
      flush()
      cellParagraphs(node, base, indent, out)
    } else if (tag === 'span') {
      inlineRuns(node, base, runs)
    } else if (tag === 'ul' || tag === 'ol') {
      flush()
      listParagraphs(node, base, indent, out)
    } else if (tag === 'table') {
      flush()
      node.querySelectorAll('td, th').forEach((cell) => {
        if (cell.closest('table') !== node) return
        cellParagraphs(cell, base, indent, out)
        if (out.length) out[out.length - 1].gapAfter = 6
      })
    } else if (tag === 'p' || tag === 'div' || tag === 'blockquote' || tag === 'section') {
      flush()
      cellParagraphs(node, base, indent, out)
      if (out.length) out[out.length - 1].gapAfter = 6
    } else if (/^h[1-6]$/.test(tag)) {
      flush()
      const heading = inlineRuns(node, { ...base, bold: true })
      if (hasText(heading)) out.push({ runs: heading, indent, gapAfter: 3 })
    } else {
      inlineRuns(node, base, runs)
    }
  })

  flush()
  return out
}

const BULLET = '•'
const LIST_INDENT = 14

function listParagraphs(listEl: Element, base: TextStyle, indent: number, out: Para[]): Para[] {
  const ordered = listEl.tagName.toLowerCase() === 'ol'
  const items = Array.from(listEl.children).filter((li) => li.tagName.toLowerCase() === 'li')
  items.forEach((li, index) => {
    const marker = ordered
      ? { text: `${index + 1}.`, style: { ...base, bold: true, color: TEAL }, width: LIST_INDENT }
      : { text: BULLET, style: { ...base, color: ORANGE }, width: LIST_INDENT }
    const runs = inlineRuns(li, base)
    // Een lege regel aan het eind (door <p> in <li>) mag geen extra witruimte geven.
    while (runs.length && runs[runs.length - 1].text === NEWLINE) runs.pop()
    out.push({ runs: hasText(runs) ? runs : [{ text: '', style: base }], indent: indent + LIST_INDENT, marker, gapAfter: 3 })
    Array.from(li.children)
      .filter((child) => /^(ul|ol)$/i.test(child.tagName))
      .forEach((nested) => listParagraphs(nested, base, indent + LIST_INDENT, out))
  })
  if (out.length) out[out.length - 1].gapAfter = 5
  return out
}

/* ---------- Layout-engine ---------- */

type BoxStyle = {
  fill?: Rgb
  stroke?: Rgb
  strokeWidth?: number
  dashed?: boolean
  radius?: number
  accentLeft?: Rgb
  accentTop?: Rgb
  padding: number
}

class PdfWriter {
  readonly doc: jsPDF
  y = MARGIN_TOP
  private widthCache = new Map<string, number>()

  constructor() {
    this.doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true })
  }

  /* --- meten --- */

  private applyStyle(s: TextStyle) {
    const font = s.bold && s.italic ? 'bolditalic' : s.bold ? 'bold' : s.italic ? 'italic' : 'normal'
    this.doc.setFont('helvetica', font)
    this.doc.setFontSize(s.size)
  }

  measure(text: string, style: TextStyle): number {
    const key = `${styleKey(style)}|${text}`
    const cached = this.widthCache.get(key)
    if (cached !== undefined) return cached
    this.applyStyle(style)
    const width = this.doc.getTextWidth(text)
    this.widthCache.set(key, width)
    return width
  }

  /** Breek runs af op woordgrenzen binnen `width`; geeft regels met x-posities per stuk. */
  wrap(runs: Run[], width: number, fallback: TextStyle, x0 = 0): Line[] {
    const lines: Line[] = []
    const avail = Math.max(20, width - x0)
    let cur: Piece[] = []
    let curW = 0
    let pendingSpace = 0

    const finish = () => {
      const maxSize = Math.max(fallback.size, ...cur.map((p) => p.style.size))
      const height = Math.max(lineHeightOf(fallback), ...cur.map((p) => lineHeightOf(p.style)))
      lines.push({ pieces: this.mergePieces(cur), width: curW, height, maxSize, x0, gapAfter: 0 })
      cur = []
      curW = 0
      pendingSpace = 0
    }

    for (const run of runs) {
      if (run.text === NEWLINE) {
        if (cur.length) finish()
        else lines.push({ pieces: [], width: 0, height: lineHeightOf(run.style), maxSize: run.style.size, x0, gapAfter: 0 })
        continue
      }
      for (let token of run.text.split(/(\s+)/)) {
        if (!token) continue
        if (/^\s+$/.test(token)) {
          if (cur.length) pendingSpace = this.measure(' ', run.style)
          continue
        }
        let w = this.measure(token, run.style)
        if (cur.length && curW + pendingSpace + w > avail) finish()
        // Woord langer dan de regel (bijv. URL): hard afbreken.
        while (w > avail && token.length > 1) {
          let cut = token.length - 1
          while (cut > 1 && this.measure(token.slice(0, cut), run.style) > avail) cut -= 1
          cur.push({ text: token.slice(0, cut), x: 0, style: run.style })
          curW = this.measure(token.slice(0, cut), run.style)
          finish()
          token = token.slice(cut)
          w = this.measure(token, run.style)
        }
        const x = cur.length ? curW + pendingSpace : 0
        cur.push({ text: token, x, style: run.style })
        curW = x + w
        pendingSpace = 0
      }
    }
    if (cur.length || !lines.length) finish()
    return lines
  }

  /** Opeenvolgende woorden met dezelfde stijl samenvoegen tot één tekstoperatie (betere selectie/kopieerbaarheid). */
  private mergePieces(pieces: Piece[]): Piece[] {
    const merged: Piece[] = []
    for (const piece of pieces) {
      const last = merged[merged.length - 1]
      if (last && styleKey(last.style) === styleKey(piece.style)) {
        last.text += ` ${piece.text}`
      } else {
        merged.push({ ...piece })
      }
    }
    return merged
  }

  layoutParas(paras: Para[], width: number): Line[] {
    const lines: Line[] = []
    for (const para of paras) {
      const fallback = para.runs[0]?.style ?? STYLE.body
      const paraLines = this.wrap(para.runs, width, fallback, para.indent)
      if (para.marker) {
        paraLines[0].marker = { text: para.marker.text, x: para.indent - para.marker.width, style: para.marker.style }
      }
      if (para.align) paraLines.forEach((line) => (line.align = para.align))
      paraLines[paraLines.length - 1].gapAfter = para.gapAfter
      lines.push(...paraLines)
    }
    return lines
  }

  static linesHeight(lines: Line[]): number {
    let total = 0
    lines.forEach((line, index) => {
      total += line.height
      if (index < lines.length - 1) total += line.gapAfter
    })
    return total
  }

  /* --- pagina's --- */

  remaining() {
    return PAGE_H - MARGIN_BOTTOM - this.y
  }

  atTop() {
    return this.y <= MARGIN_TOP + 0.01
  }

  newPage() {
    this.doc.addPage()
    this.y = MARGIN_TOP
  }

  /** Zorg dat `height` punten beschikbaar zijn; anders nieuwe pagina (tenzij al bovenaan). */
  ensure(height: number) {
    if (height > this.remaining() && !this.atTop()) this.newPage()
  }

  /** Witruimte, behalve bovenaan een pagina. */
  space(height: number) {
    if (!this.atTop()) this.y += height
  }

  /* --- tekenen --- */

  private setText(style: TextStyle) {
    this.applyStyle(style)
    this.doc.setTextColor(style.color[0], style.color[1], style.color[2])
  }

  drawLine(line: Line, x: number, y: number, width: number) {
    const baseline = y + line.height / 2 + line.maxSize * 0.26
    const shift =
      line.align === 'center' ? (width - line.x0 - line.width) / 2 : line.align === 'right' ? width - line.x0 - line.width : 0
    if (line.marker) {
      this.setText(line.marker.style)
      this.doc.text(line.marker.text, x + line.marker.x + shift, baseline)
    }
    for (const piece of line.pieces) {
      if (!piece.text) continue
      this.setText(piece.style)
      this.doc.text(piece.text, x + line.x0 + shift + piece.x, baseline)
    }
  }

  drawLinesAt(lines: Line[], x: number, y: number, width: number): number {
    let cursor = y
    lines.forEach((line, index) => {
      this.drawLine(line, x, cursor, width)
      cursor += line.height
      if (index < lines.length - 1) cursor += line.gapAfter
    })
    return cursor
  }

  /**
   * Regels in de tekststroom zetten met paginaovergangen tussen regels. `minFirst`
   * en `minLast` voorkomen wezen en weduwen (losse regels onder- of bovenaan).
   */
  flow(lines: Line[], x: number, width: number, opts: { minFirst?: number; minLast?: number; box?: BoxStyle } = {}) {
    const minFirst = opts.minFirst ?? 2
    const minLast = opts.minLast ?? 2
    const pad = opts.box ? opts.box.padding : 0
    let i = 0
    while (i < lines.length) {
      const avail = this.remaining() - pad * 2
      let h = 0
      let n = 0
      while (i + n < lines.length) {
        const extra = lines[i + n].height + (n > 0 ? lines[i + n - 1].gapAfter : 0)
        if (h + extra > avail) break
        h += extra
        n += 1
      }
      const rest = lines.length - i
      if (n < rest) {
        if (n < Math.min(minFirst, rest) && !this.atTop()) {
          this.newPage()
          continue
        }
        if (rest - n < minLast && n > minLast) n -= minLast - (rest - n)
        if (n <= 0) {
          if (!this.atTop()) {
            this.newPage()
            continue
          }
          n = 1
        }
      }
      const segment = lines.slice(i, i + n)
      const segH = PdfWriter.linesHeight(segment)
      if (opts.box) this.drawBox(x, this.y, width, segH + pad * 2, opts.box)
      this.drawLinesAt(segment, x + pad, this.y + pad, width - pad * 2)
      this.y += segH + pad * 2
      i += n
      if (i < lines.length) this.newPage()
    }
  }

  drawBox(x: number, y: number, w: number, h: number, box: BoxStyle) {
    const doc = this.doc
    const radius = box.radius ?? 6
    if (box.dashed) doc.setLineDashPattern([3, 2], 0)
    doc.setLineWidth(box.strokeWidth ?? 0.75)
    if (box.fill) doc.setFillColor(box.fill[0], box.fill[1], box.fill[2])
    if (box.stroke) doc.setDrawColor(box.stroke[0], box.stroke[1], box.stroke[2])
    const mode = box.fill && box.stroke ? 'FD' : box.fill ? 'F' : box.stroke ? 'S' : null
    if (mode) doc.roundedRect(x, y, w, h, radius, radius, mode)
    if (box.dashed) doc.setLineDashPattern([], 0)
    if (box.accentLeft) {
      doc.setFillColor(box.accentLeft[0], box.accentLeft[1], box.accentLeft[2])
      doc.rect(x, y, 3, h, 'F')
    }
    if (box.accentTop) {
      doc.setFillColor(box.accentTop[0], box.accentTop[1], box.accentTop[2])
      doc.rect(x + radius / 2, y, w - radius, 2, 'F')
    }
  }

  rule(color: Rgb, width: number, x = MARGIN_X, w = CONTENT_W) {
    this.doc.setDrawColor(color[0], color[1], color[2])
    this.doc.setLineWidth(width)
    this.doc.line(x, this.y, x + w, this.y)
  }

  footer(title: string) {
    const doc = this.doc
    const total = doc.getNumberOfPages()
    let label = sanitize(title)
    while (label.length > 4 && this.measure(label, STYLE.footer) > CONTENT_W * 0.7) label = `${label.slice(0, -2).trimEnd()}…`
    for (let page = 1; page <= total; page += 1) {
      doc.setPage(page)
      doc.setDrawColor(LINE[0], LINE[1], LINE[2])
      doc.setLineWidth(0.5)
      doc.line(MARGIN_X, FOOTER_Y - 10, PAGE_W - MARGIN_X, FOOTER_Y - 10)
      this.setText(STYLE.footer)
      doc.text(label, MARGIN_X, FOOTER_Y)
      doc.text(`Pagina ${page} van ${total}`, PAGE_W - MARGIN_X, FOOTER_Y, { align: 'right' })
    }
  }
}

/* ---------- Tabellen ---------- */

type TableVariant = 'data' | 'grid' | 'matrix'

type CellLayout = {
  lines: Line[]
  contentHeight: number
  colStart: number
  colSpan: number
  box?: BoxStyle
  padX: number
  padY: number
  vAlign: 'top' | 'middle'
}
type RowLayout = { cells: CellLayout[]; height: number; header: boolean }

function cellStyleFor(variant: TableVariant, cell: Element, isHeader: boolean): TextStyle {
  if (variant === 'data') {
    if (isHeader && cell.closest('thead')) return STYLE.cellHead
    if (isHeader) return { ...STYLE.cell, bold: true }
    return STYLE.cell
  }
  if (variant === 'matrix') {
    if (cell.classList.contains('mx-axis-x') || cell.classList.contains('mx-axis-y')) return STYLE.axis
    return STYLE.cellSmall
  }
  return STYLE.gridBody
}

function cellBoxFor(variant: TableVariant, cell: Element, isHeader: boolean, zebra: boolean): BoxStyle | undefined {
  const cls = cell.classList
  if (variant === 'data') {
    if (isHeader && cell.closest('thead')) return { fill: TEAL, padding: 0, radius: 0 }
    if (isHeader || zebra) return { fill: LIGHT_BG, padding: 0, radius: 0 }
    return undefined
  }
  if (variant === 'matrix') {
    if (cls.contains('mx-corner') || cls.contains('mx-axis-x') || cls.contains('mx-axis-y')) return undefined
    if (cls.contains('mx-hot')) return { fill: WARM_BG, stroke: WARM_BORDER, padding: 0, radius: 5 }
    return { fill: LIGHT_BG, stroke: LINE, padding: 0, radius: 5 }
  }
  const accent = cls.contains('tone-positive') ? GREEN : cls.contains('tone-negative') ? ORANGE : TEAL
  return { fill: LIGHT_BG, stroke: CARD_BORDER, accentTop: accent, padding: 0, radius: 6 }
}

function tableVariant(tableEl: Element): TableVariant {
  if (tableEl.classList.contains('model-grid')) return 'grid'
  if (tableEl.classList.contains('matrix-2x2')) return 'matrix'
  return 'data'
}

function ownRows(tableEl: Element): Element[] {
  return Array.from(tableEl.querySelectorAll('tr')).filter((tr) => tr.closest('table') === tableEl)
}

function rowCells(tr: Element): Element[] {
  return Array.from(tr.children).filter((c) => /^(td|th)$/i.test(c.tagName))
}

function spanOf(cell: Element) {
  const span = Number.parseInt(cell.getAttribute('colspan') ?? '1', 10)
  return Number.isFinite(span) && span > 0 ? span : 1
}

/** Kolombreedtes: vaste verdeling voor modellen, op inhoud gewogen voor gegevenstabellen. */
function columnWidths(rows: Element[], colCount: number, variant: TableVariant, gap: number): number[] {
  const inner = CONTENT_W - gap * (colCount - 1)
  if (variant === 'matrix' && colCount > 1) {
    const axisW = 60
    const rest = (inner - axisW) / (colCount - 1)
    return [axisW, ...Array.from({ length: colCount - 1 }, () => rest)]
  }
  if (variant !== 'data') return Array.from({ length: colCount }, () => inner / colCount)

  const weights = Array.from({ length: colCount }, () => 8)
  for (const tr of rows) {
    let col = 0
    for (const cell of rowCells(tr)) {
      const span = spanOf(cell)
      if (span === 1 && col < colCount) {
        const len = (cell.textContent ?? '').trim().length
        weights[col] = Math.max(weights[col], Math.min(48, len))
      }
      col += span
    }
  }
  const sum = weights.reduce((a, b) => a + b, 0)
  let widths = weights.map((w) => (inner * w) / sum)
  const MIN = 54
  const narrow = widths.filter((w) => w < MIN).length
  if (narrow && narrow < colCount) {
    const reserved = narrow * MIN
    const wideSum = widths.filter((w) => w >= MIN).reduce((a, b) => a + b, 0)
    widths = widths.map((w) => (w < MIN ? MIN : ((inner - reserved) * w) / wideSum))
  }
  return widths
}

type Lead = { height: number; draw: () => void }

class TableRenderer {
  private readonly gap: number
  private readonly padX: number
  private readonly padY: number
  private widths: number[] = []
  private rows: RowLayout[] = []
  private colX: number[] = []

  constructor(
    private readonly writer: PdfWriter,
    private readonly tableEl: Element,
    private readonly variant: TableVariant,
  ) {
    this.gap = variant === 'data' ? 0 : variant === 'matrix' ? 6 : 8
    this.padX = variant === 'data' ? 8 : 10
    this.padY = variant === 'data' ? 6 : 9
  }

  /** Meet alle cellen; geeft de totale hoogte (zonder paginaovergangen). */
  layout(): number {
    const rows = ownRows(this.tableEl)
    const colCount = Math.max(1, ...rows.map((tr) => rowCells(tr).reduce((sum, cell) => sum + spanOf(cell), 0)))
    this.widths = columnWidths(rows, colCount, this.variant, this.gap)
    this.colX = [MARGIN_X]
    for (let i = 0; i < colCount; i += 1) this.colX.push(this.colX[i] + this.widths[i] + this.gap)

    let bodyIndex = 0
    this.rows = rows.map((tr) => {
      const cellsEl = rowCells(tr)
      const header = !!tr.closest('thead') || (cellsEl.length > 0 && cellsEl.every((cell) => cell.tagName.toLowerCase() === 'th'))
      const zebra = this.variant === 'data' && !header && bodyIndex++ % 2 === 1
      let col = 0
      const cells = cellsEl.map((cell) => {
        const isHeader = header || cell.tagName.toLowerCase() === 'th'
        const span = spanOf(cell)
        const width = this.cellWidth(col, span)
        const paras = cellParagraphs(cell, cellStyleFor(this.variant, cell, isHeader))
        const cls = cell.classList
        const centered =
          this.variant === 'matrix' && (cls.contains('mx-axis-x') || cls.contains('mx-axis-y') || cls.contains('mx-corner'))
        if (centered) paras.forEach((p) => (p.align = 'center'))
        const lines = this.writer.layoutParas(paras, width - this.padX * 2)
        const layout: CellLayout = {
          lines,
          contentHeight: PdfWriter.linesHeight(lines),
          colStart: col,
          colSpan: span,
          box: cellBoxFor(this.variant, cell, isHeader, zebra),
          padX: this.padX,
          padY: this.padY,
          vAlign: cls.contains('mx-axis-y') ? 'middle' : 'top',
        }
        col += span
        return layout
      })
      const height = Math.max(0, ...cells.map((c) => c.contentHeight + c.padY * 2))
      return { cells, height, header }
    })
    return this.rows.reduce((sum, row) => sum + row.height, 0) + this.gap * Math.max(0, this.rows.length - 1)
  }

  private cellWidth(col: number, span: number) {
    const last = Math.min(col + span, this.widths.length)
    let width = 0
    for (let i = col; i < last; i += 1) width += this.widths[i]
    return width + this.gap * Math.max(0, last - col - 1)
  }

  /**
   * Teken de tabel vanaf de huidige cursor. Breekt tussen rijen, herhaalt kopregels
   * op een nieuwe pagina en splitst alleen rijen die groter zijn dan een pagina.
   * `lead` (bijv. een bijschrift) wordt vlak vóór de tabel getekend en blijft erbij.
   */
  draw(lead?: Lead) {
    const writer = this.writer
    const headers = this.rows.filter((row) => row.header)
    const body = this.rows.filter((row) => !row.header)
    const headerH = headers.reduce((sum, row) => sum + row.height, 0)
    const firstBody = body[0]?.height ?? 0
    writer.ensure((lead?.height ?? 0) + headerH + Math.min(firstBody, CONTENT_H / 3))
    lead?.draw()

    let segmentTop = writer.y
    /** Waar: op deze pagina staat nog niets van de tabel behalve kopregels. */
    let fresh = writer.atTop()
    const closeSegment = () => {
      if (this.variant === 'data' && writer.y > segmentTop) {
        writer.doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2])
        writer.doc.setLineWidth(0.75)
        writer.doc.rect(MARGIN_X, segmentTop, CONTENT_W, writer.y - segmentTop, 'S')
      }
    }
    const nextPage = () => {
      closeSegment()
      writer.newPage()
      segmentTop = writer.y
      fresh = true
      headers.forEach((row) => this.drawRow(row, row.height, false))
    }

    headers.forEach((row) => this.drawRow(row, row.height, false))
    let drawnRows = 0
    for (const row of body) {
      let pending: RowLayout | null = row
      while (pending) {
        const gapNow = drawnRows > 0 && !fresh ? this.gap : 0
        if (pending.height + gapNow <= writer.remaining()) {
          writer.y += gapNow
          this.drawRow(pending, pending.height, drawnRows > 0 || headers.length > 0)
          drawnRows += 1
          fresh = false
          pending = null
        } else if (!fresh) {
          nextPage()
        } else {
          // Rij hoger dan de resterende (lege) pagina: splits de cellen op regelniveau.
          const [head, tail] = this.splitRow(pending, writer.remaining())
          if (!head) {
            this.drawRow(pending, pending.height, drawnRows > 0 || headers.length > 0)
            drawnRows += 1
            pending = null
            continue
          }
          this.drawRow(head, head.height, drawnRows > 0 || headers.length > 0)
          drawnRows += 1
          pending = tail
          if (pending) nextPage()
        }
      }
    }
    closeSegment()
  }

  private splitRow(row: RowLayout, avail: number): [RowLayout | null, RowLayout | null] {
    const headCells: CellLayout[] = []
    const tailCells: CellLayout[] = []
    let any = false
    for (const cell of row.cells) {
      const limit = avail - cell.padY * 2
      let h = 0
      let n = 0
      while (n < cell.lines.length) {
        const extra = cell.lines[n].height + (n > 0 ? cell.lines[n - 1].gapAfter : 0)
        if (h + extra > limit) break
        h += extra
        n += 1
      }
      if (n > 0) any = true
      const head = cell.lines.slice(0, n)
      const tail = cell.lines.slice(n)
      headCells.push({ ...cell, lines: head, contentHeight: PdfWriter.linesHeight(head) })
      tailCells.push({ ...cell, lines: tail, contentHeight: PdfWriter.linesHeight(tail) })
    }
    if (!any) return [null, row]
    const headRow: RowLayout = { ...row, cells: headCells, height: avail }
    const tailRow: RowLayout | null = tailCells.some((cell) => cell.lines.length)
      ? { ...row, cells: tailCells, height: Math.max(...tailCells.map((c) => c.contentHeight + c.padY * 2)) }
      : null
    return [headRow, tailRow]
  }

  private drawRow(row: RowLayout, height: number, separatorAbove: boolean) {
    const writer = this.writer
    const doc = writer.doc
    const y = writer.y
    for (const cell of row.cells) {
      const x = this.colX[cell.colStart] ?? MARGIN_X
      const w = this.cellWidth(cell.colStart, cell.colSpan)
      if (cell.box) writer.drawBox(x, y, w, height, cell.box)
      const offset = cell.vAlign === 'middle' ? Math.max(0, (height - cell.padY * 2 - cell.contentHeight) / 2) : 0
      writer.drawLinesAt(cell.lines, x + cell.padX, y + cell.padY + offset, w - cell.padX * 2)
    }
    if (this.variant === 'data' && separatorAbove && !row.header) {
      doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2])
      doc.setLineWidth(0.5)
      doc.line(MARGIN_X, y, MARGIN_X + CONTENT_W, y)
    }
    writer.y = y + height
  }
}

/* ---------- Document-renderer ---------- */

type Model = { height: number; draw: () => void }

class ProposalRenderer {
  constructor(private readonly w: PdfWriter) {}

  render(root: Element) {
    this.container(root)
  }

  private container(el: Element) {
    el.childNodes.forEach((child) => {
      if (child.nodeType === 1) {
        this.block(child as Element)
      } else if (child.nodeType === 3 && (child.textContent ?? '').trim()) {
        const runs: Run[] = []
        pushText(runs, child.textContent ?? '', STYLE.body)
        this.paragraph(runs, STYLE.body, 9)
      }
    })
  }

  private block(el: Element) {
    const tag = el.tagName.toLowerCase()
    const cls = el.classList
    switch (tag) {
      case 'h1':
        return this.heading(el, STYLE.h1, { before: 0, after: 12 })
      case 'h2':
        return this.heading(el, STYLE.h2, { before: 14, after: 8, underline: true })
      case 'h3':
        return this.heading(el, STYLE.h3, { before: 10, after: 5 })
      case 'h4':
      case 'h5':
      case 'h6':
        return this.heading(el, STYLE.h4, { before: 8, after: 4 })
      case 'p':
        return this.paragraphEl(el)
      case 'ul':
      case 'ol':
        return this.list(el)
      case 'dl':
        return cls.contains('doc-meta') ? this.docMeta(el) : this.container(el)
      case 'blockquote':
        return this.box(el, STYLE.quote, { fill: WARM_BG, accentLeft: ORANGE, radius: 4, padding: 10 }, 6, 10)
      case 'figure':
        return this.figure(el)
      case 'figcaption':
        return this.paragraph(inlineRuns(el, STYLE.caption), STYLE.caption, 8)
      case 'table':
        return this.table(el)
      case 'header':
        this.container(el)
        if (cls.contains('doc-header')) {
          this.w.space(6)
          this.w.rule(TEAL, 1.5)
          this.w.y += 20
        }
        return
      case 'section':
        this.container(el)
        if (cls.contains('doc-section')) this.w.space(10)
        return
      case 'div':
        if (cls.contains('start-notice')) {
          return this.box(el, STYLE.notice, { fill: WARM_BG, stroke: ORANGE, dashed: true, strokeWidth: 1.2, radius: 8, padding: 11 }, 0, 16)
        }
        if (cls.contains('review-block')) {
          return this.box(el, STYLE.body, { fill: WARM_BG, stroke: WARM_BORDER, radius: 6, padding: 10 }, 6, 10)
        }
        return this.container(el)
      case 'hr':
        this.w.space(6)
        this.w.rule(LINE, 0.75)
        this.w.y += 12
        return
      case 'br':
        this.w.y += lineHeightOf(STYLE.body)
        return
      case 'img':
      case 'script':
      case 'style':
      case 'svg':
        return
      default:
        return this.container(el)
    }
  }

  private heading(el: Element, style: TextStyle, opts: { before: number; after: number; underline?: boolean }) {
    const runs = inlineRuns(el, style)
    if (!hasText(runs)) return
    const lines = this.w.wrap(runs, CONTENT_W, style)
    const height = PdfWriter.linesHeight(lines)
    // Kop blijft bij de tekst erna: eis ruimte voor de kop plus twee broodtekstregels.
    this.w.ensure(opts.before + height + (opts.underline ? 12 : 0) + opts.after + lineHeightOf(STYLE.body) * 2)
    this.w.space(opts.before)
    this.w.flow(lines, MARGIN_X, CONTENT_W, { minFirst: lines.length })
    if (opts.underline) {
      this.w.y += 5
      this.w.rule(LINE, 0.75)
      this.w.y += 1
    }
    this.w.y += opts.after
  }

  private paragraphEl(el: Element) {
    const cls = el.classList
    if (cls.contains('kicker')) return this.kicker(el)
    if (cls.contains('doc-subtitle')) return this.paragraph(inlineRuns(el, STYLE.subtitle), STYLE.subtitle, 6)
    if (cls.contains('lead')) return this.paragraph(inlineRuns(el, STYLE.lead), STYLE.lead, 12)
    if (cls.contains('section-subtitle')) return this.paragraph(inlineRuns(el, STYLE.sectionSubtitle), STYLE.sectionSubtitle, 10)
    if (el.querySelector('ul, ol, table')) return this.container(el)
    return this.paragraph(inlineRuns(el, STYLE.body), STYLE.body, 9)
  }

  private paragraph(runs: Run[], style: TextStyle, after: number) {
    if (!hasText(runs)) return
    const lines = this.w.wrap(runs, CONTENT_W, style)
    this.w.flow(lines, MARGIN_X, CONTENT_W)
    this.w.y += after
  }

  private kicker(el: Element) {
    const runs = inlineRuns(el, STYLE.kicker)
    if (!hasText(runs)) return
    const text = runs.map((run) => (run.text === NEWLINE ? ' ' : run.text)).join('').replace(/\s+/g, ' ').trim()
    const textW = Math.min(this.w.measure(text, STYLE.kicker), CONTENT_W - 16)
    const height = 15
    this.w.ensure(height + 60)
    this.w.drawBox(MARGIN_X, this.w.y, textW + 16, height, { fill: WARM_BG, radius: height / 2, padding: 0 })
    const line: Line = { pieces: [{ text, x: 0, style: STYLE.kicker }], width: textW, height, maxSize: STYLE.kicker.size, x0: 0, gapAfter: 0 }
    this.w.drawLine(line, MARGIN_X + 8, this.w.y, textW)
    this.w.y += height + 8
  }

  private list(el: Element) {
    const paras = listParagraphs(el, STYLE.body, 0, [])
    if (!paras.length) return
    const lines = this.w.layoutParas(paras, CONTENT_W)
    this.w.flow(lines, MARGIN_X, CONTENT_W)
    this.w.y += 6
  }

  private box(el: Element, style: TextStyle, box: BoxStyle, before: number, after: number) {
    const paras = el.classList.contains('start-notice') ? this.noticeParagraphs(el) : cellParagraphs(el, style)
    if (!paras.length) return
    const lines = this.w.layoutParas(paras, CONTENT_W - box.padding * 2)
    const height = PdfWriter.linesHeight(lines) + box.padding * 2
    this.w.space(before)
    this.w.ensure(Math.min(height, CONTENT_H / 2))
    this.w.flow(lines, MARGIN_X, CONTENT_W, { box })
    this.w.y += after
  }

  /** Startmelding: <strong> op een eigen regel (display: block), <em> vet. */
  private noticeParagraphs(el: Element): Para[] {
    const paras: Para[] = []
    let runs: Run[] = []
    const flush = () => {
      if (hasText(runs)) paras.push({ runs, indent: 0, gapAfter: 3 })
      runs = []
    }
    el.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        pushText(runs, child.textContent ?? '', STYLE.notice)
        return
      }
      if (child.nodeType !== 1) return
      const node = child as Element
      const tag = node.tagName.toLowerCase()
      if (tag === 'strong') {
        flush()
        const title = inlineRuns(node, STYLE.noticeTitle)
        if (hasText(title)) paras.push({ runs: title, indent: 0, gapAfter: 3 })
      } else if (tag === 'em') {
        inlineRuns(node, { ...STYLE.notice, bold: true }, runs)
      } else if (tag === 'br') {
        runs.push({ text: NEWLINE, style: STYLE.notice })
      } else if (tag === 'p' || tag === 'div') {
        flush()
        cellParagraphs(node, STYLE.notice, 0, paras)
      } else {
        inlineRuns(node, STYLE.notice, runs)
      }
    })
    flush()
    return paras
  }

  private docMeta(dl: Element) {
    const items = Array.from(dl.children).filter((child) => child.tagName.toLowerCase() === 'div')
    if (!items.length) return
    const pad = 11
    const gap = 10
    const cols = Math.min(3, items.length)
    const colW = (CONTENT_W - pad * 2 - gap * (cols - 1)) / cols
    const laid = items.map((item) => {
      const label = inlineRuns(item.querySelector('dt') ?? item, STYLE.metaLabel)
      const value = inlineRuns(item.querySelector('dd') ?? item, STYLE.metaValue)
      const lines = [
        ...this.w.wrap(label, colW, STYLE.metaLabel).map((line) => ({ ...line, gapAfter: 2 })),
        ...this.w.wrap(hasText(value) ? value : [{ text: '—', style: STYLE.metaValue }], colW, STYLE.metaValue),
      ]
      return { lines, height: PdfWriter.linesHeight(lines) }
    })
    const rows: (typeof laid)[] = []
    for (let i = 0; i < laid.length; i += cols) rows.push(laid.slice(i, i + cols))
    const rowHeights = rows.map((row) => Math.max(...row.map((c) => c.height)))
    const total = pad * 2 + rowHeights.reduce((a, b) => a + b, 0) + gap * (rows.length - 1)

    this.w.ensure(Math.min(total, CONTENT_H))
    this.w.drawBox(MARGIN_X, this.w.y, CONTENT_W, total, { fill: LIGHT_BG, stroke: LINE, radius: 6, padding: 0 })
    let y = this.w.y + pad
    rows.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        this.w.drawLinesAt(cell.lines, MARGIN_X + pad + colIndex * (colW + gap), y, colW)
      })
      y += rowHeights[rowIndex] + gap
    })
    this.w.y += total + 14
  }

  /** Losse tabel (meestal in <div class="table-wrap"> met <caption>). */
  private table(tableEl: Element) {
    const model = this.modelFor(tableEl)
    if (model) {
      this.w.space(8)
      this.w.ensure(Math.min(model.height, CONTENT_H))
      model.draw()
      this.w.y += 8
      return
    }

    const renderer = new TableRenderer(this.w, tableEl, tableVariant(tableEl))
    const height = renderer.layout()
    const caption = tableEl.querySelector(':scope > caption')
    const captionRuns = caption ? inlineRuns(caption, STYLE.tableCaption) : []
    const captionLines = hasText(captionRuns) ? this.w.wrap(captionRuns, CONTENT_W - 20, STYLE.tableCaption) : []
    const captionH = captionLines.length ? PdfWriter.linesHeight(captionLines) + 12 : 0

    this.w.space(8)
    if (tableVariant(tableEl) !== 'data') this.w.ensure(Math.min(captionH + height, CONTENT_H * 0.8))
    renderer.draw({
      height: captionH,
      draw: () => {
        if (!captionLines.length) return
        this.w.doc.setFillColor(CAPTION_BG[0], CAPTION_BG[1], CAPTION_BG[2])
        this.w.doc.rect(MARGIN_X, this.w.y, CONTENT_W, captionH, 'F')
        this.w.drawLinesAt(captionLines, MARGIN_X + 10, this.w.y + 6, CONTENT_W - 20)
        this.w.y += captionH
      },
    })
    this.w.y += 10
  }

  /** <figure class="doc-model">: bijschrift + visueel model; blijft waar mogelijk op één pagina. */
  private figure(figure: Element) {
    const caption = figure.querySelector(':scope > figcaption')
    const captionRuns = caption ? inlineRuns(caption, STYLE.caption) : []
    const captionLines = hasText(captionRuns) ? this.w.wrap(captionRuns, CONTENT_W, STYLE.caption) : []
    const captionH = captionLines.length ? PdfWriter.linesHeight(captionLines) + 8 : 0
    const drawCaption = () => {
      if (!captionLines.length) return
      this.w.drawLinesAt(captionLines, MARGIN_X, this.w.y, CONTENT_W)
      this.w.y += captionH
    }
    const table = figure.querySelector(':scope > table')

    this.w.space(10)
    if (!table) {
      drawCaption()
      Array.from(figure.children)
        .filter((child) => child.tagName.toLowerCase() !== 'figcaption')
        .forEach((child) => this.block(child))
      return
    }

    const model = this.modelFor(table)
    if (model) {
      this.w.ensure(Math.min(captionH + model.height, CONTENT_H))
      drawCaption()
      model.draw()
    } else {
      // Matrix, modelraster of gewone tabel in een figuur.
      const renderer = new TableRenderer(this.w, table, tableVariant(table))
      const height = renderer.layout()
      this.w.ensure(Math.min(captionH + height, CONTENT_H))
      renderer.draw({ height: captionH, draw: drawCaption })
    }
    this.w.y += 8
  }

  private modelFor(table: Element): Model | null {
    const cls = table.classList
    if (cls.contains('process-flow')) return this.processFlow(table)
    if (cls.contains('timeline')) return this.timeline(table)
    if (cls.contains('org-chart')) return this.orgChart(table)
    return null
  }

  /* --- Processchema: stappen als kaarten naast elkaar met pijlen ertussen --- */

  private processFlow(table: Element): Model {
    const steps = Array.from(table.querySelectorAll('td.process-step'))
    if (!steps.length) return this.tableModel(table)
    const arrowW = 18
    const pad = 10
    const circle = 18
    const stepW = (CONTENT_W - arrowW * (steps.length - 1)) / steps.length
    const laid = steps.map((step) => {
      const no = sanitize((step.querySelector('.step-no')?.textContent ?? '').trim())
      const paras = cellParagraphs(step, STYLE.stepDetail).filter((p) => p.runs[0]?.style !== STYLE.stepNo)
      const lines = this.w.layoutParas(paras, stepW - pad * 2)
      return { no, lines, height: PdfWriter.linesHeight(lines) }
    })
    const hasNumbers = laid.some((s) => s.no)
    const contentH = Math.max(0, ...laid.map((s) => s.height))
    const boxH = pad + 2 + (hasNumbers ? circle + 6 : 0) + contentH + pad
    return {
      height: boxH,
      draw: () => {
        const y = this.w.y
        laid.forEach((step, index) => {
          const x = MARGIN_X + index * (stepW + arrowW)
          this.w.drawBox(x, y, stepW, boxH, { fill: LIGHT_BG, stroke: CARD_BORDER, accentTop: TEAL, radius: 7, padding: 0 })
          let cy = y + pad + 2
          if (hasNumbers) {
            if (step.no) {
              this.w.doc.setFillColor(TEAL[0], TEAL[1], TEAL[2])
              this.w.doc.circle(x + pad + circle / 2, cy + circle / 2, circle / 2, 'F')
              this.w.drawLine(this.singleLine(step.no, STYLE.stepNo, circle, 'center'), x + pad, cy, circle)
            }
            cy += circle + 6
          }
          this.w.drawLinesAt(step.lines, x + pad, cy, stepW - pad * 2)
          if (index < laid.length - 1) {
            this.w.drawLine(this.singleLine('›', STYLE.arrow, 18, 'center'), x + stepW, y + boxH / 2 - 9, arrowW)
          }
        })
        this.w.y = y + boxH
      },
    }
  }

  private singleLine(text: string, style: TextStyle, height: number, align: Line['align']): Line {
    return { pieces: [{ text, x: 0, style }], width: this.w.measure(text, style), height, maxSize: style.size, x0: 0, gapAfter: 0, align }
  }

  private tableModel(table: Element): Model {
    const renderer = new TableRenderer(this.w, table, 'grid')
    const height = renderer.layout()
    return { height, draw: () => renderer.draw() }
  }

  /* --- Tijdlijn: mijlpalen onder elkaar langs een verticale lijn; breekt tussen mijlpalen --- */

  private timeline(table: Element): Model {
    const whenW = 84
    const markerW = 22
    const gapW = 12
    const whatW = CONTENT_W - whenW - gapW - markerW
    const rows = ownRows(table).map((tr) => {
      const whenEl = tr.querySelector('td.tl-when')
      const whatEl = tr.querySelector('td.tl-what')
      const whenLines = whenEl ? this.w.wrap(inlineRuns(whenEl, STYLE.tlWhen), whenW, STYLE.tlWhen) : []
      whenLines.forEach((line) => (line.align = 'right'))
      const whatLines = this.w.layoutParas(cellParagraphs(whatEl ?? tr, STYLE.tlDetail), whatW)
      const height = Math.max(PdfWriter.linesHeight(whenLines), PdfWriter.linesHeight(whatLines)) + 12
      return { whenLines, whatLines, height }
    })
    return {
      height: rows.reduce((sum, row) => sum + row.height, 0),
      draw: () => {
        const doc = this.w.doc
        rows.forEach((row, index) => {
          this.w.ensure(Math.min(row.height, CONTENT_H))
          const y = this.w.y
          const lineX = MARGIN_X + whenW + gapW + 2
          const dotY = y + 7
          doc.setDrawColor(CARD_BORDER[0], CARD_BORDER[1], CARD_BORDER[2])
          doc.setLineWidth(1.5)
          doc.line(lineX, y, lineX, index === rows.length - 1 ? dotY : y + row.height)
          doc.setFillColor(ORANGE[0], ORANGE[1], ORANGE[2])
          doc.setDrawColor(WHITE[0], WHITE[1], WHITE[2])
          doc.setLineWidth(1.2)
          doc.circle(lineX, dotY, 4, 'FD')
          this.w.drawLinesAt(row.whenLines, MARGIN_X, y, whenW)
          this.w.drawLinesAt(row.whatLines, MARGIN_X + whenW + gapW + markerW, y, whatW)
          this.w.y = y + row.height
        })
      },
    }
  }

  /* --- Organogram: hoofdrol boven, verbindingslijnen, rollen eronder --- */

  private orgChart(table: Element): Model {
    const top = table.querySelector('td.org-top .org-box') ?? table.querySelector('td.org-top')
    const reports = Array.from(table.querySelectorAll('table.org-reports td'))
      .map((td) => td.querySelector('.org-box') ?? td)
      .filter((box) => (box.textContent ?? '').trim())
    const pad = 9
    const gap = 10
    const connector = 16
    const n = Math.max(1, reports.length)
    const reportW = (CONTENT_W - gap * (n - 1)) / n
    const layoutBox = (el: Element, width: number) => {
      const paras = cellParagraphs(el, STYLE.orgName)
      paras.forEach((p) => (p.align = 'center'))
      const lines = this.w.layoutParas(paras, width - pad * 2)
      return { lines, height: PdfWriter.linesHeight(lines) + pad * 2 }
    }
    const topW = Math.min(CONTENT_W, Math.max(150, reportW))
    const topBox = top ? layoutBox(top, topW) : null
    const reportBoxes = reports.map((box) => layoutBox(box, reportW))
    const reportH = reportBoxes.length ? Math.max(...reportBoxes.map((b) => b.height)) : 0
    const height = (topBox?.height ?? 0) + (topBox && reportBoxes.length ? connector * 2 : 0) + reportH

    return {
      height,
      draw: () => {
        const doc = this.w.doc
        let y = this.w.y
        const centerX = MARGIN_X + CONTENT_W / 2
        if (topBox) {
          const x = centerX - topW / 2
          this.w.drawBox(x, y, topW, topBox.height, { fill: WARM_BG, stroke: CARD_BORDER, accentTop: ORANGE, radius: 7, padding: 0 })
          this.w.drawLinesAt(topBox.lines, x + pad, y + pad, topW - pad * 2)
          y += topBox.height
        }
        if (topBox && reportBoxes.length) {
          doc.setDrawColor(CARD_BORDER[0], CARD_BORDER[1], CARD_BORDER[2])
          doc.setLineWidth(1.5)
          doc.line(centerX, y, centerX, y + connector)
          const firstC = MARGIN_X + reportW / 2
          const lastC = MARGIN_X + (n - 1) * (reportW + gap) + reportW / 2
          doc.line(Math.min(firstC, centerX), y + connector, Math.max(lastC, centerX), y + connector)
          reportBoxes.forEach((_box, index) => {
            const cx = MARGIN_X + index * (reportW + gap) + reportW / 2
            doc.line(cx, y + connector, cx, y + connector * 2)
          })
          y += connector * 2
        }
        reportBoxes.forEach((box, index) => {
          const x = MARGIN_X + index * (reportW + gap)
          this.w.drawBox(x, y, reportW, reportH, { fill: LIGHT_BG, stroke: CARD_BORDER, accentTop: TEAL, radius: 7, padding: 0 })
          this.w.drawLinesAt(box.lines, x + pad, y + pad, reportW - pad * 2)
        })
        this.w.y = y + reportH
      },
    }
  }
}

/* ---------- Publieke API ---------- */

function renderProposal(html: string, title?: string): PdfWriter {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const root = parsed.querySelector('.proposal-doc') ?? parsed.body
  const docTitle = title?.trim() || root.querySelector('h1')?.textContent?.trim() || parsed.title?.trim() || 'Document'

  const writer = new PdfWriter()
  writer.doc.setProperties({ title: docTitle, creator: 'AI-Schrijfagent Besteed Het Uit' })
  writer.doc.setLanguage('nl')

  new ProposalRenderer(writer).render(root)
  writer.footer(docTitle)
  return writer
}

/** Bouw de PDF (jsPDF-instantie) uit de HTML van het concept. */
export function buildProposalPdf(html: string, title?: string): jsPDF {
  return renderProposal(html, title).doc
}

export type ProposalPdfMeasure = {
  /** Aantal A4 dat de export aflevert — dit telt voor een paginalimiet. */
  pages: number
  /**
   * Hoe vol het stuk staat, als gebroken getal: 2,4 betekent twee volle pagina's plus
   * een pagina die voor 40% is gevuld. Nodig om te weten hoeveel woorden er in één A4
   * passen; het hele paginagetal alleen zou die dichtheid stelselmatig onderschatten.
   */
  filled: number
}

/**
 * Meet wat de PDF-export van dit concept oplevert — exact, want het is dezelfde bouwer
 * als de export zelf.
 */
export function measureProposalPdf(html: string): ProposalPdfMeasure {
  if (!html.trim()) return { pages: 0, filled: 0 }
  const writer = renderProposal(html)
  const pages = writer.doc.getNumberOfPages()
  const lastPage = Math.min(1, Math.max(0, (writer.y - MARGIN_TOP) / CONTENT_H))
  return { pages, filled: Math.max(0, pages - 1) + lastPage }
}

/** Aantal A4-pagina's dat de PDF-export van dit concept oplevert. */
export function countProposalPdfPages(html: string): number {
  return measureProposalPdf(html).pages
}

/** Exporteer het concept als tekst-PDF en start de download. */
export async function exportPdfFromHtml(html: string, filename: string, title?: string) {
  buildProposalPdf(html, title).save(filename)
}
