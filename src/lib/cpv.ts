/**
 * Normaliseert een CPV-code naar het formaat "12345678" of "12345678-9".
 * Retourneert null als de invoer geen geldige CPV-code is.
 */
export function normalizeCpvCode(input: string): string | null {
  const cleaned = input.replace(/\s/g, '')
  if (/^\d{8}(-\d)?$/.test(cleaned)) return cleaned
  return null
}

/**
 * Significante prefix van een CPV-code: het 8-cijferige deel zonder de
 * opvullende nullen aan het einde. CPV is hiërarchisch — "72000000"
 * (IT-diensten) dekt alle "72…"-codes, dus de prefix bepaalt het matchniveau.
 * Minimaal op afdelingsniveau (2 cijfers).
 */
export function cpvSignificantPrefix(code: string): string {
  const base = code.replace(/\s/g, '').slice(0, 8)
  const stripped = base.replace(/0+$/, '')
  return stripped.length >= 2 ? stripped : base.slice(0, 2)
}

/**
 * Matcht de CPV-codes van een tender tegen de bedrijfs-CPV-codes op basis van
 * de CPV-hiërarchie: een tendercode telt als match wanneer die binnen (of
 * gelijk aan) een van de bedrijfscodes valt.
 */
export function matchesCompanyCpv(
  tenderCodes: Array<{ code: string }>,
  companyCodes: Array<{ code: string }>,
): boolean {
  if (!tenderCodes.length || !companyCodes.length) return false
  const prefixes = companyCodes.map((cpv) => cpvSignificantPrefix(cpv.code))
  return tenderCodes.some((cpv) => {
    const clean = cpv.code.replace(/\s/g, '').slice(0, 8)
    return prefixes.some((prefix) => clean.startsWith(prefix))
  })
}

/**
 * Controlecijfer van een CPV-code (8 cijfers): gewogen som met de gewichten
 * 3-7-1-3-7-1-3-7, modulo 10. TenderNed verwacht bij filteren de volledige
 * notatie "12345678-9".
 */
export function cpvCheckDigit(code: string): number | null {
  const digits = code.replace(/\s/g, '').slice(0, 8)
  if (!/^\d{8}$/.test(digits)) return null
  const weights = [3, 7, 1, 3, 7, 1, 3, 7]
  const sum = digits.split('').reduce((total, digit, index) => total + Number(digit) * weights[index], 0)
  return sum % 10
}

/** Geeft de CPV-code in de volledige notatie "12345678-9" (controlecijfer wordt berekend of gecorrigeerd). */
export function cpvWithCheckDigit(code: string): string | null {
  const check = cpvCheckDigit(code)
  if (check == null) return null
  return `${code.replace(/\s/g, '').slice(0, 8)}-${check}`
}
