import type { AiProvider } from '../../src/types/apiConfig'

export type AiRuntimeConfig = {
  provider: AiProvider
  baseUrl: string
  apiKey: string
  model: string
  /**
   * Testmodus vanuit API-beheer: alle Anthropic-taken draaien op het
   * goedkoopste model, ongeacht tier of geconfigureerd model.
   */
  testMode?: boolean
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
  /** Adaptive thinking verbruikt output-budget; standaard uit voor lange teksten. */
  useThinking?: boolean
  /**
   * Prompt caching (alleen Anthropic). Zet dit aan bij aanroepen waarvan de
   * prefix aantoonbaar wordt herlezen (vervolg-passes, herhaalde generaties);
   * een cache-write kost 1,25× input, dus bij eenmalige calls is het verlies.
   */
  cachePrompt?: boolean
  /**
   * Levensduur van de cache-entry. '1h' (write kost 2× i.p.v. 1,25×) loont
   * wanneer hergebruik buiten het 5-minutenvenster valt, zoals tussen de
   * stadia brons/zilver/goud waar een menselijke reviewronde tussen zit.
   */
  cacheTtl?: '5m' | '1h'
  /**
   * Aantal user-berichten (vanaf het begin) dat als cache-grens wordt gemarkeerd
   * (standaard 1). De schrijfagent zet 2: bronnenblok én taakcontext blijven
   * gelijk over alle sectie-aanroepen van één generatie. Maximaal 3 (Anthropic
   * staat 4 markers toe, inclusief de system prompt).
   */
  cacheUserMessages?: number
  /** Taaknaam voor de verbruikslog, zodat tokengebruik per taak meetbaar is. */
  label?: string
}

/**
 * Kostenklasse van de taak. Alleen het daadwerkelijke schrijfwerk ('writer')
 * draait op het topmodel; analyse- en selectietaken draaien op goedkopere
 * modellen zonder merkbaar kwaliteitsverlies voor het eindresultaat.
 */
export type AiTaskTier = 'writer' | 'analysis' | 'light'

// Alleen van toepassing op Anthropic; bij OpenAI-compatibele endpoints kennen
// we het beschikbare modelaanbod niet en blijft het geconfigureerde model staan.
const ANTHROPIC_TIER_MODELS: Record<AiTaskTier, string> = {
  writer: 'claude-opus-4-8',
  analysis: 'claude-sonnet-4-6',
  light: 'claude-haiku-4-5',
}

// Goedkoopste Anthropic-model ($1/$5 per miljoen tokens): wordt in testmodus
// gebruikt voor analyse- en lichte taken, waar modelkwaliteit nauwelijks
// merkbaar is in het eindresultaat.
const ANTHROPIC_TEST_MODEL = 'claude-haiku-4-5'

// Het schrijfwerk moet in testmodus lange, complex opgemaakte HTML-secties
// (tabellen, managementmodellen) volhouden over een hele generatie — Haiku
// verliest daarbij de opmaak vanaf een paar secties. Sonnet is duidelijk
// goedkoper dan het productiemodel maar houdt de opmaakinstructies wel vol.
const ANTHROPIC_TEST_MODEL_WRITER = 'claude-sonnet-4-6'

const ANTHROPIC_VERSION = '2023-06-01'

const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'

function normalizeBaseUrl(value: string | undefined | null, fallback: string): string {
  const trimmed = value?.trim()
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return fallback
  return trimmed
}

function normalizeAnthropicBaseUrl(baseUrl: string): string {
  return normalizeBaseUrl(baseUrl, DEFAULT_ANTHROPIC_BASE_URL)
    .replace(/\/$/, '')
    .replace(/\/v1$/, '')
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

type AnthropicTextBlock = {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral'; ttl?: '1h' }
}

type AnthropicUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

// Verbruikslog per aanroep (zichtbaar in de serverlogs): maakt meetbaar waar
// tokens heengaan en of prompt caching daadwerkelijk hits oplevert.
function logUsage(label: string | undefined, model: string, usage: AnthropicUsage | undefined) {
  if (!usage) return
  console.log(
    '[ai-verbruik]',
    JSON.stringify({
      taak: label ?? 'onbekend',
      model,
      input: usage.input_tokens ?? 0,
      output: usage.output_tokens ?? 0,
      cacheWrite: usage.cache_creation_input_tokens ?? 0,
      cacheRead: usage.cache_read_input_tokens ?? 0,
    }),
  )
}

/**
 * Prompt caching: markeer het einde van de stabiele prefix — de system prompt en
 * het eerste user-bericht (waar de grote documentblokken zitten), optioneel ook
 * de volgende user-berichten (cacheUserMessages). Sectie-aanroepen van de
 * schrijfagent en herhaalde aanroepen met dezelfde bronnen lezen die prefix
 * dan uit cache tegen ~10% van de reguliere inputprijs.
 */
function buildAnthropicPayload(messages: AiMessage[], options: AiCompletionOptions) {
  const { system, chatMessages } = splitMessages(messages)

  if (!options.cachePrompt) {
    return {
      systemBlocks: system ? [{ type: 'text', text: system } satisfies AnthropicTextBlock] : undefined,
      anthropicMessages: chatMessages,
    }
  }

  const cacheControl: AnthropicTextBlock['cache_control'] =
    options.cacheTtl === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' }

  const systemBlocks: AnthropicTextBlock[] | undefined = system
    ? [{ type: 'text', text: system, cache_control: cacheControl }]
    : undefined

  const markCount = Math.min(3, Math.max(1, options.cacheUserMessages ?? 1))
  let marked = 0
  const anthropicMessages = chatMessages.map((message) => {
    if (message.role === 'user' && marked < markCount) {
      marked += 1
      const block: AnthropicTextBlock = {
        type: 'text',
        text: message.content,
        cache_control: cacheControl,
      }
      return { role: message.role, content: [block] }
    }
    return message
  })

  return { systemBlocks, anthropicMessages }
}

async function completeAnthropic(
  ai: AiRuntimeConfig,
  messages: AiMessage[],
  options: AiCompletionOptions,
): Promise<string> {
  const { systemBlocks, anthropicMessages } = buildAnthropicPayload(messages, options)
  const body: Record<string, unknown> = {
    model: ai.model,
    max_tokens: options.maxTokens ?? 16_000,
    messages: anthropicMessages,
  }

  if (systemBlocks) body.system = systemBlocks
  // effort staat los van thinking: ook zonder adaptive thinking bepaalt dit de
  // denkdiepte/inspanning van het model, dus altijd meesturen wanneer gezet.
  if (options.useThinking && usesAdaptiveThinking(ai.model)) {
    body.thinking = { type: 'adaptive' }
  }
  if (options.effort) {
    body.output_config = { effort: options.effort }
  }

  const baseUrl = normalizeAnthropicBaseUrl(normalizeBaseUrl(ai.baseUrl, DEFAULT_ANTHROPIC_BASE_URL))
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
    usage?: AnthropicUsage
  }
  logUsage(options.label, ai.model, payload.usage)
  const text = payload.content
    ?.filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')
    .trim()

  if (!text) throw new Error('Anthropic gaf geen tekst terug.')
  return text
}

async function* streamAnthropic(
  ai: AiRuntimeConfig,
  messages: AiMessage[],
  options: AiCompletionOptions,
): AsyncGenerator<string> {
  const { systemBlocks, anthropicMessages } = buildAnthropicPayload(messages, options)
  const body: Record<string, unknown> = {
    model: ai.model,
    max_tokens: options.maxTokens ?? 16_000,
    messages: anthropicMessages,
    stream: true,
  }

  if (systemBlocks) body.system = systemBlocks
  // effort staat los van thinking: ook zonder adaptive thinking bepaalt dit de
  // denkdiepte/inspanning van het model, dus altijd meesturen wanneer gezet.
  if (options.useThinking && usesAdaptiveThinking(ai.model)) {
    body.thinking = { type: 'adaptive' }
  }
  if (options.effort) {
    body.output_config = { effort: options.effort }
  }

  const baseUrl = normalizeAnthropicBaseUrl(normalizeBaseUrl(ai.baseUrl, DEFAULT_ANTHROPIC_BASE_URL))
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': ai.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 180_000),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Anthropic API mislukt (${response.status}): ${detail.slice(0, 280)}`)
  }

  if (!response.body) throw new Error('Anthropic streaming mislukt: geen response body.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  // Verbruik komt bij streaming verspreid binnen: input/cache in message_start,
  // output cumulatief in message_delta. Verzamelen en aan het einde loggen.
  const usageTotals: AnthropicUsage = {}
  const mergeUsage = (usage?: AnthropicUsage) => {
    if (!usage) return
    if (usage.input_tokens != null) usageTotals.input_tokens = usage.input_tokens
    if (usage.output_tokens != null) usageTotals.output_tokens = usage.output_tokens
    if (usage.cache_creation_input_tokens != null) usageTotals.cache_creation_input_tokens = usage.cache_creation_input_tokens
    if (usage.cache_read_input_tokens != null) usageTotals.cache_read_input_tokens = usage.cache_read_input_tokens
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const event = JSON.parse(payload) as {
          type?: string
          delta?: { type?: string; text?: string }
          message?: { usage?: AnthropicUsage }
          usage?: AnthropicUsage
        }
        if (event.type === 'message_start') mergeUsage(event.message?.usage)
        if (event.type === 'message_delta') mergeUsage(event.usage)
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const text = event.delta.text
          if (text) yield text
        }
      } catch {
        // onvolledige SSE-regel overslaan
      }
    }
  }

  if (buffer.trim()) {
    for (const line of buffer.split('\n')) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const event = JSON.parse(payload) as {
          type?: string
          delta?: { type?: string; text?: string }
          message?: { usage?: AnthropicUsage }
          usage?: AnthropicUsage
        }
        if (event.type === 'message_start') mergeUsage(event.message?.usage)
        if (event.type === 'message_delta') mergeUsage(event.usage)
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const text = event.delta.text
          if (text) yield text
        }
      } catch {
        // onvolledige SSE-regel overslaan
      }
    }
  }

  if (Object.keys(usageTotals).length) logUsage(options.label, ai.model, usageTotals)
}

async function* streamOpenAiCompatible(
  ai: AiRuntimeConfig,
  messages: AiMessage[],
  options: AiCompletionOptions,
): AsyncGenerator<string> {
  const baseUrl = normalizeBaseUrl(ai.baseUrl, DEFAULT_OPENAI_BASE_URL).replace(/\/$/, '')
  const body: Record<string, unknown> = {
    model: ai.model,
    temperature: 0.2,
    messages,
    max_tokens: options.maxTokens ?? 16_000,
    stream: true,
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ai.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 180_000),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`AI API mislukt (${response.status}): ${detail.slice(0, 280)}`)
  }

  if (!response.body) throw new Error('AI streaming mislukt: geen response body.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const event = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const text = event.choices?.[0]?.delta?.content
        if (text) yield text
      } catch {
        // onvolledige SSE-regel overslaan
      }
    }
  }
}

export async function* streamChat(
  ai: AiRuntimeConfig,
  messages: AiMessage[],
  options: AiCompletionOptions = {},
): AsyncGenerator<string> {
  if (ai.provider === 'anthropic') {
    yield* streamAnthropic(ai, messages, options)
    return
  }
  yield* streamOpenAiCompatible(ai, messages, options)
}

async function completeOpenAiCompatible(
  ai: AiRuntimeConfig,
  messages: AiMessage[],
  options: AiCompletionOptions,
): Promise<string> {
  const baseUrl = normalizeBaseUrl(ai.baseUrl, DEFAULT_OPENAI_BASE_URL).replace(/\/$/, '')
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

export function resolveAnthropicFromEnv(
  modelEnv = 'WRITER_MODEL',
  tier: AiTaskTier = 'writer',
): AiRuntimeConfig | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return null
  return {
    provider: 'anthropic',
    baseUrl: normalizeBaseUrl(process.env.ANTHROPIC_BASE_URL, DEFAULT_ANTHROPIC_BASE_URL),
    apiKey,
    model: process.env[modelEnv]?.trim() || ANTHROPIC_TIER_MODELS[tier],
  }
}

export function resolveOpenAiFromEnv(modelEnv = 'OPENAI_MODEL'): AiRuntimeConfig | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null
  return {
    provider: 'openai',
    baseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL, DEFAULT_OPENAI_BASE_URL),
    apiKey,
    model: process.env[modelEnv]?.trim() || 'gpt-4.1-mini',
  }
}

export function resolveAiFromRequest(
  requestAi: AiRuntimeConfig | undefined,
  envModelKey = 'WRITER_MODEL',
  tier: AiTaskTier = 'writer',
): AiRuntimeConfig {
  if (requestAi?.apiKey?.trim()) {
    if (requestAi.provider === 'anthropic') {
      // Testmodus (ingesteld in API-beheer): analyse- en lichte taken draaien op
      // het goedkoopste model; het schrijfwerk op een middenmodel dat de lange,
      // complexe opmaakinstructies wél kan volhouden (zie ANTHROPIC_TEST_MODEL_WRITER
      // hierboven). Anders geldt het in API-beheer geconfigureerde model alleen
      // voor het schrijfwerk; lichtere taken draaien op het (goedkopere)
      // tier-model, tenzij de omgevingsvariabele van deze taakgroep iets anders
      // afdwingt.
      const model = requestAi.testMode
        ? tier === 'writer'
          ? ANTHROPIC_TEST_MODEL_WRITER
          : ANTHROPIC_TEST_MODEL
        : tier === 'writer'
          ? requestAi.model?.trim() || ANTHROPIC_TIER_MODELS.writer
          : process.env[envModelKey]?.trim() || ANTHROPIC_TIER_MODELS[tier]
      return {
        provider: requestAi.provider,
        baseUrl: normalizeBaseUrl(requestAi.baseUrl, DEFAULT_ANTHROPIC_BASE_URL),
        apiKey: requestAi.apiKey.trim(),
        model,
      }
    }
    return {
      provider: requestAi.provider,
      baseUrl: normalizeBaseUrl(requestAi.baseUrl, DEFAULT_OPENAI_BASE_URL),
      apiKey: requestAi.apiKey.trim(),
      model: requestAi.model?.trim() || 'gpt-4.1-mini',
    }
  }

  const anthropic = resolveAnthropicFromEnv(envModelKey, tier)
  if (anthropic) return anthropic

  const openai = resolveOpenAiFromEnv(envModelKey)
  if (openai) return openai

  throw new Error(
    'Geen AI-configuratie beschikbaar. Stel de schrijfagent in via API-beheer of zet ANTHROPIC_API_KEY in de serveromgeving.',
  )
}
