import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { saveAs } from 'file-saver'
import proposalDocumentCss from '../styles/proposalDocument.css?raw'

const A4_WIDTH_PT = 595.28
const A4_HEIGHT_PT = 841.89
const PAGE_MARGIN_PT = 40

/** Breedte (px) van het render-canvas voor de PDF; proposal-doc (max. 860px) centreert hierin. */
const RENDER_WIDTH_PX = 956

/**
 * Zelfstandig HTML-document met uitsluitend de proposal-opmaak. Bewust GEEN
 * Tailwind/thema-CSS (die gebruikt oklch-kleuren waar html2canvas op crasht),
 * zodat de PDF-render in een geïsoleerde iframe betrouwbaar werkt.
 */
export function buildStandaloneDocument(html: string, title: string) {
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>${proposalDocumentCss}
    html, body { margin: 0; }
    body {
      padding: 40px 48px;
      background: #ffffff;
      color: #172033;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
  </style>
</head>
<body>${html}</body>
</html>`
}

/** Word-document (.doc als HTML). A4-paginaopmaak en Word-vriendelijke basistypografie. */
export function buildWordDocument(html: string, title: string) {
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    @page { size: A4 portrait; margin: 2cm; }
    ${proposalDocumentCss}
    html, body { margin: 0; }
    body {
      padding: 0;
      background: #ffffff;
      color: #172033;
      font-family: 'Segoe UI', Calibri, Arial, sans-serif;
    }
    /* Volle paginabreedte in Word i.p.v. de scherm-/editorcentrering. */
    .proposal-doc { max-width: none; margin: 0; width: 100%; }
    .proposal-doc table { width: 100%; table-layout: auto; }
    /* Laat secties over pagina's breken; houd alleen tabellen/modellen bijeen. */
    .proposal-doc .doc-section { page-break-inside: auto; }
    .proposal-doc .table-wrap,
    .proposal-doc .doc-model { page-break-inside: avoid; }
  </style>
</head>
<body>${html}</body>
</html>`
}

/** Tekststijlen die Word betrouwbaar uit inline-styles overneemt (font-family bewust niet:
 *  laten we vallen op de Word-basistypografie uit buildWordDocument). */
const WORD_TEXT_PROPS = [
  'color',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'text-align',
  'text-transform',
  'letter-spacing',
  'vertical-align',
  'white-space',
]

const BOX_SIDES = ['top', 'right', 'bottom', 'left'] as const

function isTransparent(color: string): boolean {
  return !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)'
}

function rgbToHex(rgb: string): string {
  const parts = rgb.match(/\d+/g)
  if (!parts || parts.length < 3) return ''
  const [r, g, b] = parts.slice(0, 3).map((n) => Math.max(0, Math.min(255, parseInt(n, 10))))
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

/** Zet de berekende stijlen van elk element om naar inline-styles + table-attributen,
 *  zodat Word de opmaak overneemt (Word negeert grotendeels class-CSS in <style>). */
function inlineComputedStyles(doc: Document, win: Window) {
  doc.querySelectorAll<HTMLElement>('.proposal-doc, .proposal-doc *').forEach((el) => {
    const cs = win.getComputedStyle(el)
    const tag = el.tagName.toLowerCase()
    const parts: string[] = []

    for (const prop of WORD_TEXT_PROPS) {
      const value = cs.getPropertyValue(prop)
      if (value) parts.push(`${prop}: ${value}`)
    }

    // Block/inline-block expliciet meegeven zodat o.a. de model-spans (titel/detail)
    // in Word stapelen. Grid/flex bewust NIET (Word kan daar niet mee overweg).
    const display = cs.getPropertyValue('display')
    if (display === 'block' || display === 'inline-block') {
      parts.push(`display: ${display}`)
    }

    const background = cs.getPropertyValue('background-color')
    if (!isTransparent(background)) {
      parts.push(`background-color: ${background}`)
      if (tag === 'th' || tag === 'td') {
        const hex = rgbToHex(background)
        if (hex) el.setAttribute('bgcolor', hex)
      }
    }

    for (const box of ['padding', 'margin'] as const) {
      for (const side of BOX_SIDES) {
        const value = cs.getPropertyValue(`${box}-${side}`)
        if (value && value !== '0px') parts.push(`${box}-${side}: ${value}`)
      }
    }

    for (const side of BOX_SIDES) {
      const width = cs.getPropertyValue(`border-${side}-width`)
      const style = cs.getPropertyValue(`border-${side}-style`)
      const color = cs.getPropertyValue(`border-${side}-color`)
      if (style && style !== 'none' && parseFloat(width) > 0) {
        parts.push(`border-${side}: ${width} ${style} ${color}`)
      }
    }

    const radius = cs.getPropertyValue('border-radius')
    if (radius && radius !== '0px') parts.push(`border-radius: ${radius}`)

    // Relatieve breedtes i.p.v. de berekende pixels: een A4 in Word is smaller dan
    // de render-breedte, dus vaste px-breedtes liepen buiten de pagina. Geen vaste
    // celbreedtes zodat Word de kolommen zelf over de paginabreedte verdeelt.
    if (tag === 'table') {
      parts.push('width: 100%', 'border-collapse: collapse', 'table-layout: auto')
    }
    if (el.classList.contains('proposal-doc')) {
      parts.push('max-width: none', 'width: 100%')
    }
    if (tag === 'img') {
      parts.push('max-width: 100%', 'height: auto')
    }

    el.setAttribute('style', parts.join('; '))
  })
}

/** Converteer de doc-meta (CSS grid — door Word genegeerd) naar een compacte
 *  label/waarde-tabel (één rij per veld). Bewust geen .doc-meta-class, zodat het
 *  niet de gebokste grid-opmaak overneemt. */
function convertDocMetaToTable(doc: Document) {
  doc.querySelectorAll<HTMLElement>('dl.doc-meta').forEach((dl) => {
    const items = Array.from(dl.children).filter((child) => child.tagName.toLowerCase() === 'div')
    if (!items.length) return
    const table = doc.createElement('table')
    table.setAttribute('width', '100%')
    table.style.cssText = 'width: 100%; border-collapse: collapse; margin: 0 0 20px;'
    items.forEach((item) => {
      const row = doc.createElement('tr')
      const labelCell = doc.createElement('td')
      labelCell.setAttribute('width', '32%')
      labelCell.style.cssText =
        'padding: 6px 10px; border-bottom: 1px solid #d9e0df; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: #475569; vertical-align: top;'
      labelCell.textContent = item.querySelector('dt')?.textContent ?? ''
      const valueCell = doc.createElement('td')
      valueCell.style.cssText =
        'padding: 6px 10px; border-bottom: 1px solid #d9e0df; font-size: 14px; font-weight: 600; color: #164f4a; vertical-align: top;'
      valueCell.textContent = item.querySelector('dd')?.textContent ?? ''
      row.appendChild(labelCell)
      row.appendChild(valueCell)
      table.appendChild(row)
    })
    dl.replaceWith(table)
  })
}

/** Bouwt Word-klare HTML: rendert in een iframe, neemt berekende stijlen inline over. */
async function buildWordExport(html: string, title: string): Promise<string> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.left = '-10000px'
  iframe.style.top = '0'
  iframe.style.width = `${RENDER_WIDTH_PX}px`
  iframe.style.height = '1000px'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  try {
    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win) return buildWordDocument(html, title)

    doc.open()
    doc.write(buildStandaloneDocument(html, title))
    doc.close()

    if (doc.fonts?.ready) await doc.fonts.ready
    await new Promise((resolve) => setTimeout(resolve, 30))

    convertDocMetaToTable(doc)
    inlineComputedStyles(doc, win)

    const root = doc.querySelector('.proposal-doc')
    return buildWordDocument(root ? root.outerHTML : doc.body.innerHTML, title)
  } finally {
    document.body.removeChild(iframe)
  }
}

export async function exportWordDocument(html: string, title: string, filename: string) {
  const wordHtml = await buildWordExport(html, title)
  // De BOM helpt Word de UTF-8-codering correct te herkennen.
  const doc = new Blob(['﻿', wordHtml], { type: 'application/msword;charset=utf-8' })
  saveAs(doc, filename)
}

export async function exportPdfFromElement(source: HTMLElement, filename: string) {
  const canvas = await html2canvas(source, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: source.scrollWidth,
  })

  const contentWidth = A4_WIDTH_PT - PAGE_MARGIN_PT * 2
  const contentHeight = (canvas.height * contentWidth) / canvas.width
  const pageContentHeight = A4_HEIGHT_PT - PAGE_MARGIN_PT * 2

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
  let renderedHeight = 0
  let pageIndex = 0

  while (renderedHeight < contentHeight) {
    if (pageIndex > 0) pdf.addPage()

    const sliceHeight = Math.min(pageContentHeight, contentHeight - renderedHeight)
    const sliceCanvas = document.createElement('canvas')
    sliceCanvas.width = canvas.width
    sliceCanvas.height = (sliceHeight * canvas.width) / contentWidth

    const context = sliceCanvas.getContext('2d')
    if (!context) throw new Error('Kon PDF-pagina niet renderen.')

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height)
    context.drawImage(
      canvas,
      0,
      (renderedHeight * canvas.width) / contentWidth,
      canvas.width,
      sliceCanvas.height,
      0,
      0,
      canvas.width,
      sliceCanvas.height,
    )

    pdf.addImage(
      sliceCanvas.toDataURL('image/png'),
      'PNG',
      PAGE_MARGIN_PT,
      PAGE_MARGIN_PT,
      contentWidth,
      sliceHeight,
    )

    renderedHeight += sliceHeight
    pageIndex += 1
  }

  pdf.save(filename)
}

/**
 * Rendert het concept naar PDF via een geïsoleerde iframe. De iframe bevat een
 * schoon document met alleen de proposal-CSS, zodat de oklch-thema-kleuren van
 * de hoofdpagina html2canvas niet laten crashen en de HTML-opmaak behouden blijft.
 */
export async function exportPdfFromHtml(html: string, filename: string) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.left = '-10000px'
  iframe.style.top = '0'
  iframe.style.width = `${RENDER_WIDTH_PX}px`
  iframe.style.height = '1000px'
  iframe.style.border = '0'
  iframe.style.background = '#ffffff'
  document.body.appendChild(iframe)

  try {
    const doc = iframe.contentDocument
    if (!doc) throw new Error('Kon het PDF-document niet voorbereiden.')

    doc.open()
    doc.write(buildStandaloneDocument(html, 'PDF-export'))
    doc.close()

    // Wacht tot fonts en lay-out klaar zijn voor een scherpe render.
    if (doc.fonts?.ready) {
      await doc.fonts.ready
    }
    await new Promise((resolve) => setTimeout(resolve, 60))

    const body = doc.body
    iframe.style.height = `${body.scrollHeight + 40}px`
    await exportPdfFromElement(body, filename)
  } finally {
    document.body.removeChild(iframe)
  }
}
