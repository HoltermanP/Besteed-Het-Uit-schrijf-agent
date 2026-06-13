import type { AiProvider } from '../types/apiConfig'

export const aiProviderDefaults: Record<AiProvider, { baseUrl: string; model: string; hint: string }> = {
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-opus-4-8',
    hint: 'Anthropic Messages API. Aanbevolen model: claude-opus-4-8.',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1',
    hint: 'OpenAI Chat Completions API.',
  },
  custom: {
    baseUrl: '',
    model: '',
    hint: 'OpenAI-compatibel endpoint.',
  },
}
