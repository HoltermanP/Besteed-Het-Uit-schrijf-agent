import { resolveAnthropicFromEnv, resolveOpenAiFromEnv } from './aiClient'

export function getWriterStatusPayload() {
  const anthropic = resolveAnthropicFromEnv()
  const openai = resolveOpenAiFromEnv()
  const active = anthropic ?? openai

  return {
    available: Boolean(active),
    provider: active?.provider ?? null,
    model: active?.model ?? null,
  }
}
