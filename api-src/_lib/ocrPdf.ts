// OCR-fallback voor gescande PDF's zonder tekstlaag: stuur de PDF als document
// naar de Anthropic API (Claude leest gescande pagina's via vision) en vraag de
// volledige tekst letterlijk terug. Geeft null terug als er geen server-side
// Anthropic-sleutel is geconfigureerd.

type AnthropicContentBlock = { type: string; text?: string }

export async function tryOcrPdf(buffer: Buffer): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return null

  const baseUrl = (process.env.ANTHROPIC_BASE_URL?.trim() || 'https://api.anthropic.com').replace(/\/$/, '')
  const model = process.env.WRITER_MODEL?.trim() || 'claude-opus-4-8'

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 50_000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: buffer.toString('base64'),
              },
            },
            {
              type: 'text',
              text: 'Dit is een (mogelijk gescand) aanbestedingsdocument. Geef de volledige tekstinhoud letterlijk en compleet terug, in leesvolgorde. Geen samenvatting, geen commentaar, geen markdown-opmaak — alleen de tekst zelf. Bevat het document geen leesbare tekst, antwoord dan met exact één woord: GEEN_TEKST',
            },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`OCR via AI mislukt (HTTP ${response.status}). ${detail.slice(0, 200)}`)
  }

  const payload = (await response.json()) as { content?: AnthropicContentBlock[] }
  const text = (payload.content ?? [])
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text)
    .join('\n')
    .trim()
  // Marker voor "geen leesbare tekst": als leeg behandelen, zodat er geen
  // AI-commentaar als brontekst in het dossier belandt.
  return text.includes('GEEN_TEKST') ? '' : text
}
