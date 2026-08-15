/**
 * Normaliseert een CPV-code naar het formaat "12345678" of "12345678-9".
 * Retourneert null als de invoer geen geldige CPV-code is.
 */
export function normalizeCpvCode(input: string): string | null {
  const cleaned = input.replace(/\s/g, '')
  if (/^\d{8}(-\d)?$/.test(cleaned)) return cleaned
  return null
}
