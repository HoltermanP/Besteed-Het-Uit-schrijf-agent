// De docx-library (en jszip) verwijzen naar Node-globals (global, Buffer, process)
// die in de browserbundel ontbreken — daardoor reageerde de Word-export niet in
// productie. Dit polyfill-moduul levert die globals bundler-onafhankelijk aan.
import { Buffer } from 'buffer'

const globalScope = globalThis as Record<string, unknown>

if (typeof globalScope.Buffer === 'undefined') {
  globalScope.Buffer = Buffer
}
if (typeof globalScope.global === 'undefined') {
  globalScope.global = globalThis
}
if (typeof globalScope.process === 'undefined') {
  globalScope.process = { env: {} }
}

export {}
