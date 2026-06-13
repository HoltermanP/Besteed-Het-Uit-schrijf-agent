import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { saveAs } from 'file-saver'
import proposalDocumentCss from '../styles/proposalDocument.css?raw'

const A4_WIDTH_PT = 595.28
const A4_HEIGHT_PT = 841.89
const PAGE_MARGIN_PT = 40

export function buildWordDocument(html: string, title: string) {
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>${proposalDocumentCss}
    body {
      margin: 0;
      padding: 32px 40px;
      background: #ffffff;
    }
  </style>
</head>
<body>${html}</body>
</html>`
}

export function exportWordDocument(html: string, title: string, filename: string) {
  const wordHtml = buildWordDocument(html, title)
  const doc = new Blob([wordHtml], { type: 'application/msword;charset=utf-8' })
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

export async function exportPdfFromHtml(html: string, filename: string) {
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '-10000px'
  host.style.top = '0'
  host.style.width = '860px'
  host.style.background = '#ffffff'
  host.style.padding = '36px 48px'
  host.innerHTML = html

  const style = document.createElement('style')
  style.textContent = proposalDocumentCss
  host.prepend(style)
  document.body.appendChild(host)

  try {
    await exportPdfFromElement(host, filename)
  } finally {
    document.body.removeChild(host)
  }
}
