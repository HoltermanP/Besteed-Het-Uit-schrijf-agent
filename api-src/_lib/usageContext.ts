import { AsyncLocalStorage } from 'node:async_hooks'

/*
 * Waar hoort een AI-aanroep bij?
 *
 * De verbruikslog wil per bedrijf, project en stuk kunnen optellen, maar de AI-aanroepen
 * zitten diep in analyse- en schrijffuncties die daar niets van weten. Dat door elke
 * functiesignatuur heen slepen zou tientallen bestanden raken voor iets wat met het werk
 * zelf niets te maken heeft.
 *
 * Daarom staat de herkomst in een AsyncLocalStorage: de route zet hem één keer aan het
 * begin van het verzoek, en aiClient leest hem op het moment van de aanroep. Alles wat
 * ertussen zit blijft ongewijzigd. De browser stuurt de herkomst mee als kopregels (zie
 * src/lib/usageScope.ts); voor achtergrondopdrachten komt hij uit de opdracht zelf.
 */

export type UsageContext = {
  companyId: string
  projectId?: string
  projectTitle?: string
  draftId?: string
  draftTitle?: string
}

export const DEFAULT_COMPANY_ID = 'default'

const storage = new AsyncLocalStorage<UsageContext>()

export function runWithUsageContext<T>(context: UsageContext, fn: () => T): T {
  return storage.run(context, fn)
}

export function currentUsageContext(): UsageContext | undefined {
  return storage.getStore()
}

const HEADER_COMPANY = 'x-bedrijf-id'
const HEADER_PROJECT = 'x-project-id'
const HEADER_PROJECT_TITLE = 'x-project-titel'
const HEADER_DRAFT = 'x-stuk-id'
const HEADER_DRAFT_TITLE = 'x-stuk-titel'

/**
 * Titels gaan als kopregel mee en kopregels mogen alleen ASCII bevatten; de browser
 * codeert ze daarom (zie usageScope.ts). Mislukt het decoderen, dan is een lelijke titel
 * beter dan een mislukte AI-aanroep.
 */
function decodeHeader(value: string | null): string | undefined {
  const raw = value?.trim()
  if (!raw) return undefined
  try {
    return decodeURIComponent(raw).slice(0, 200) || undefined
  } catch {
    return raw.slice(0, 200)
  }
}

/** Leest de herkomst uit de kopregels van een verzoek uit de werkplek. */
export function usageContextFromRequest(request: Request): UsageContext {
  const headers = request.headers
  return {
    companyId: decodeHeader(headers.get(HEADER_COMPANY)) || DEFAULT_COMPANY_ID,
    projectId: decodeHeader(headers.get(HEADER_PROJECT)),
    projectTitle: decodeHeader(headers.get(HEADER_PROJECT_TITLE)),
    draftId: decodeHeader(headers.get(HEADER_DRAFT)),
    draftTitle: decodeHeader(headers.get(HEADER_DRAFT_TITLE)),
  }
}

/**
 * Voert een route-afhandeling uit met de herkomst uit het verzoek. Zo hoeft een route
 * alleen zijn bestaande aanroep te omhullen om het verbruik toe te rekenen.
 */
export function withUsageContext<T>(request: Request, fn: () => T): T {
  return runWithUsageContext(usageContextFromRequest(request), fn)
}
