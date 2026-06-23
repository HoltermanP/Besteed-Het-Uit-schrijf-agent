import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
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
