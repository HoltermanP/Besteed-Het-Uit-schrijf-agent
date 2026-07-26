// Kopieert de pdfjs-worker naar public/ zodat de browser PDF's lokaal kan uitlezen
// (client-side extractie — geen uploadlimiet). Draait via postinstall.
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const source = path.join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs')
const target = path.join(root, 'public', 'pdf.worker.min.mjs')

await mkdir(path.dirname(target), { recursive: true })
await copyFile(source, target)
console.log('pdfjs-worker gekopieerd naar public/pdf.worker.min.mjs')
