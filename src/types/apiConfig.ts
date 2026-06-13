export type AiProvider = 'openai' | 'anthropic' | 'custom'

export type ApiConfig = {
  tenderned: {
    baseUrl: string
    apiKey: string
    enabled: boolean
  }
  neon: {
    connectionString: string
    enabled: boolean
  }
  writer: {
    provider: AiProvider
    baseUrl: string
    apiKey: string
    model: string
    enabled: boolean
  }
  review: {
    provider: AiProvider
    baseUrl: string
    apiKey: string
    model: string
    enabled: boolean
  }
}

export const defaultApiConfig: ApiConfig = {
  tenderned: {
    baseUrl: '/api/tenderned',
    apiKey: '',
    enabled: true,
  },
  neon: {
    connectionString: '',
    enabled: false,
  },
  writer: {
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKey: '',
    model: 'claude-opus-4-8',
    enabled: false,
  },
  review: {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4.1',
    enabled: false,
  },
}
