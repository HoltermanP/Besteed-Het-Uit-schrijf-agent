import type { AiProvider } from '../src/types/apiConfig'

export type AiRuntimeConfig = {
  provider: AiProvider
  baseUrl: string
  apiKey: string
  model: string
}

export type AiMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AiCompletionOptions = {
  jsonMode?: boolean
  maxTokens?: number
  timeoutMs?: number
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}

const ANTHROPIC_VERSION = '2023-06-01'

function normalizeAnthropicBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, '').replace(/\/v1$/, '')
}

function usesAdaptiveThinking(model: string): boolean {
  return /claude-(opus-4-[678]|sonnet-4-6|fable-5|mythos-5)/i.test(model)
}

function splitMessages(messages: AiMessage[]) {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
  const chatMessages = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }))
  return { system, chatMessages }
}

async function completeAnthropic(
  ai: AiRuntimeConfig,
  messages: AiMessage[],
  options: AiCompletionOptions,
): Promise<string> {
  const { system, chatMessages } = splitMessages(messages)
  const body: Record<string, unknown> = {
    model: ai.model,
    max_tokens: options.maxTokens ?? 16_000,
    messages: chatMessages,
  }

  if (system) body.system = system
  if (usesAdaptiveThinking(ai.model)) {
    body.thinking = { type: 'adaptive' }
    body.output_config = { effort: options.effort ?? 'high' }
  }

  const baseUrl = normalizeAnthropicBaseUrl(ai.baseUrl || 'https://api.anthropic.com')
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': ai.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Anthropic API mislukt (${response.status}): ${detail.slice(0, 280)}`)
  }

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>
  }
  const text = payload.content
    ?.filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')
    .trim()

  if (!text) throw new Error('Anthropic gaf geen tekst terug.')
  return text
}

async function completeOpenAiCompatible(
  ai: AiRuntimeConfig,
  messages: AiMessage[],
  options: AiCompletionOptions,
): Promise<string> {
  const baseUrl = (ai.baseUrl.trim() || 'https://api.openai.com/v1').replace(/\/$/, '')
  const body: Record<string, unknown> = {
    model: ai.model,
    temperature: 0.2,
    messages,
    max_tokens: options.maxTokens ?? 16_000,
  }
  if (options.jsonMode) {
    body.response_format = { type: 'json_object' }
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ai.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`AI API mislukt (${response.status}): ${detail.slice(0, 280)}`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = payload.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('AI gaf geen resultaat terug.')
  return content
}

export async function completeChat(
  ai: AiRuntimeConfig,
  messages: AiMessage[],
  options: AiCompletionOptions = {},
): Promise<string> {
  if (ai.provider === 'anthropic') {
    return completeAnthropic(ai, messages, options)
  }
  return completeOpenAiCompatible(ai, messages, options)
}

export function resolveAnthropicFromEnv(modelEnv = 'WRITER_MODEL'): AiRuntimeConfig | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return null
  return {
    provider: 'anthropic',
    baseUrl: process.env.ANTHROPIC_BASE_URL?.trim() || 'https://api.anthropic.com',
    apiKey,
    model: process.env[modelEnv]?.trim() || 'claude-opus-4-8',
  }
}

export function resolveOpenAiFromEnv(modelEnv = 'OPENAI_MODEL'): AiRuntimeConfig | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null
  return {
    provider: 'openai',
    baseUrl: process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
    apiKey,
    model: process.env[modelEnv]?.trim() || 'gpt-4.1-mini',
  }
}

export function resolveAiFromRequest(
  requestAi: AiRuntimeConfig | undefined,
  envModelKey = 'WRITER_MODEL',
): AiRuntimeConfig {
  if (requestAi?.apiKey?.trim()) {
    const defaults = requestAi.provider === 'anthropic'
      ? { baseUrl: 'https://api.anthropic.com', model: 'claude-opus-4-8' }
      : { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' }
    return {
      provider: requestAi.provider,
      baseUrl: requestAi.baseUrl.trim() || defaults.baseUrl,
      apiKey: requestAi.apiKey.trim(),
      model: requestAi.model.trim() || defaults.model,
    }
  }

  const anthropic = resolveAnthropicFromEnv(envModelKey)
  if (anthropic) return anthropic

  const openai = resolveOpenAiFromEnv(envModelKey)
  if (openai) return openai

  throw new Error(
    'Geen AI-configuratie beschikbaar. Stel de schrijfagent in via API-beheer of zet ANTHROPIC_API_KEY in de serveromgeving.',
  )
}
