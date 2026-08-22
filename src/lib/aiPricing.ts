/*
 * Wat een AI-aanroep kost.
 *
 * Anthropic factureert per miljoen tokens in dollars; dat is hier de bron van waarheid.
 * De omrekening naar euro's gebeurt pas bij het tonen (met de koers uit het bedrijfsbudget),
 * zodat een gewijzigde koers meteen op álle historie doorwerkt en er geen bedragen
 * "vastroesten" in de database.
 *
 * Kosten worden opgeslagen in micro-dollars (bedrag × 1.000.000, afgerond). Zo blijft het
 * optellen exact — bij centen of floats loopt een lange reeks kleine aanroepen scheef.
 */

export type ModelPrice = {
  /** Dollar per miljoen invoertokens. */
  input: number
  /** Dollar per miljoen uitvoertokens. */
  output: number
}

/**
 * Tarieven per miljoen tokens (Anthropic, stand augustus 2026). Alleen modellen die deze
 * app daadwerkelijk kan aanroepen. Een model dat hier niet in staat, wordt wél geteld in
 * tokens maar krijgt geen bedrag — de verbruikspagina meldt dat dan als "tarief onbekend"
 * in plaats van een verzonnen bedrag te tonen.
 */
const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-fable-5': { input: 10, output: 50 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
}

/**
 * Prompt caching verrekent invoertokens tegen een afwijkend tarief:
 * wegschrijven kost extra, terugvinden kost bijna niets. Dat verschil is precies wat
 * de verbruikspagina zichtbaar maakt.
 */
export const CACHE_MULTIPLIERS = {
  /** Cache-entry wegschrijven met de standaard levensduur van 5 minuten. */
  write5m: 1.25,
  /** Cache-entry wegschrijven met een levensduur van 1 uur. */
  write1h: 2,
  /** Uit de cache gelezen invoer: een tiende van het gewone invoertarief. */
  read: 0.1,
} as const

/** Modelnamen dragen soms een datumsuffix (claude-opus-4-8-20260101); die hoort niet bij het tarief. */
function normalizeModel(model: string): string {
  return model.trim().toLowerCase().replace(/-\d{8}$/, '')
}

export function priceForModel(model: string): ModelPrice | null {
  return MODEL_PRICES[normalizeModel(model)] ?? null
}

export type UsageTokens = {
  inputTokens: number
  outputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
}

/**
 * Kosten van één aanroep in micro-dollars, of null als het tarief van dit model
 * niet bekend is. `cacheTtl` bepaalt het tarief van de cache-schrijfactie.
 */
export function costUsdMicros(
  model: string,
  usage: UsageTokens,
  cacheTtl: '5m' | '1h' = '5m',
): number | null {
  const price = priceForModel(model)
  if (!price) return null

  const writeMultiplier = cacheTtl === '1h' ? CACHE_MULTIPLIERS.write1h : CACHE_MULTIPLIERS.write5m
  const billableInput =
    usage.inputTokens +
    usage.cacheWriteTokens * writeMultiplier +
    usage.cacheReadTokens * CACHE_MULTIPLIERS.read

  const dollars = (billableInput * price.input + usage.outputTokens * price.output) / 1_000_000
  return Math.round(dollars * 1_000_000)
}

/**
 * Wat dezelfde aanroep zónder caching had gekost. Het verschil met de werkelijke kosten
 * is de besparing die prompt caching oplevert — de cijfers waarmee een beheerder kan zien
 * of caching daadwerkelijk werkt.
 */
export function costUsdMicrosWithoutCache(model: string, usage: UsageTokens): number | null {
  const price = priceForModel(model)
  if (!price) return null

  const allInput = usage.inputTokens + usage.cacheWriteTokens + usage.cacheReadTokens
  const dollars = (allInput * price.input + usage.outputTokens * price.output) / 1_000_000
  return Math.round(dollars * 1_000_000)
}

/** Micro-dollars omrekenen naar euro's met de ingestelde koers. */
export function microsToEur(micros: number, usdToEur: number): number {
  return (micros / 1_000_000) * usdToEur
}

/** Standaardkoers als er nog niets is ingesteld (dollar naar euro). */
export const DEFAULT_USD_TO_EUR = 0.92

const euroFormat = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Onder een euro zijn twee decimalen te grof: een losse analysetaak kost een paar cent en
 * elk stuk zou dan hetzelfde "€ 0,02" tonen, waarmee juist het onderscheid wegvalt waar
 * deze pagina voor bedoeld is. Vanaf een euro is afronden op centen wél het duidelijkst.
 */
const euroFormatPrecise = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})

export function formatEur(amount: number): string {
  if (amount > 0 && amount < 1) return euroFormatPrecise.format(amount)
  return euroFormat.format(amount)
}

const tokenFormat = new Intl.NumberFormat('nl-NL')

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${tokenFormat.format(Math.round(tokens / 100_000) / 10)} mln`
  if (tokens >= 10_000) return `${tokenFormat.format(Math.round(tokens / 1_000))}k`
  return tokenFormat.format(tokens)
}
