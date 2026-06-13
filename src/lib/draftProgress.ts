export async function revealDraftProgressively(
  html: string,
  onUpdate: (partial: string) => void,
  chunkSize = 140,
  delayMs = 18,
): Promise<void> {
  if (!html) {
    onUpdate('')
    return
  }

  onUpdate('')
  for (let index = chunkSize; index < html.length; index += chunkSize) {
    onUpdate(html.slice(0, index))
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  onUpdate(html)
}
