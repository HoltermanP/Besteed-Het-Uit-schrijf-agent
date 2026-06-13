export type SourceQuality = 'ok' | 'warning' | 'error'

export type SourceQualityInfo = {
  quality: SourceQuality
  label: string
  words: number
  chars: number
}

export function assessSourceContent(content: string): SourceQualityInfo {
  const trimmed = content.trim()
  const chars = trimmed.length
  const words = trimmed ? trimmed.split(/\s+/).length : 0

  if (!trimmed) {
    return { quality: 'error', label: 'Leeg — geen inhoud', words: 0, chars: 0 }
  }
  if (chars < 80) {
    return { quality: 'warning', label: 'Zeer kort — controleer inhoud', words, chars }
  }
  if (words < 15) {
    return { quality: 'warning', label: 'Weinig tekst — mogelijk incompleet', words, chars }
  }
  return { quality: 'ok', label: 'Geladen', words, chars }
}
