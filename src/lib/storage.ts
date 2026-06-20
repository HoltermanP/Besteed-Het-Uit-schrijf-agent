export function loadStored<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored ? (JSON.parse(stored) as T) : fallback
  } catch {
    return fallback
  }
}

export function saveStored<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22)) {
      throw new Error('Lokale opslag is vol. Verwijder eerder opgeslagen aanbestedingen of synchroniseer naar Neon.', {
        cause: error,
      })
    }
    throw error
  }
}
