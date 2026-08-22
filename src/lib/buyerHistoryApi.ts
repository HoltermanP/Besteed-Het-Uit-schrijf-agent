import type { BuyerHistory, BuyerHistoryRequest, BuyerHistoryResponse } from '../types/buyerHistory'

type ApiError = { error: string }

/**
 * Haalt het marktbeeld van een opdrachtgever op: wie er eerder won en met hoeveel
 * inschrijvers. De server scant TenderNed en leest de gunnings-PDF's uit; de eerste
 * keer duurt dat tientallen seconden, daarna komt het uit de cache.
 */
export async function fetchBuyerHistory(request: BuyerHistoryRequest): Promise<BuyerHistory> {
  const response = await fetch('/api/insights?action=buyer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  const data = (await response.json()) as BuyerHistoryResponse | ApiError
  if (!response.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'Opdrachtgeversbeeld ophalen mislukt.')
  }
  return data.history
}
