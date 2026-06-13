export function applyDevApiEnv(env: Record<string, string>) {
  const previous = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
    WRITER_MODEL: process.env.WRITER_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    COMPANY_ENRICH_MODEL: process.env.COMPANY_ENRICH_MODEL,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
  }

  if (process.env.PLAYWRIGHT === '1') {
    process.env.ANTHROPIC_API_KEY = ''
    process.env.ANTHROPIC_BASE_URL = ''
    process.env.WRITER_MODEL = ''
    process.env.OPENAI_API_KEY = ''
    process.env.OPENAI_BASE_URL = ''
    process.env.COMPANY_ENRICH_MODEL = ''
    process.env.OPENAI_MODEL = ''
  } else {
    process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY ?? previous.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_BASE_URL = env.ANTHROPIC_BASE_URL ?? previous.ANTHROPIC_BASE_URL
    process.env.WRITER_MODEL = env.WRITER_MODEL ?? previous.WRITER_MODEL
    process.env.OPENAI_API_KEY = env.OPENAI_API_KEY ?? previous.OPENAI_API_KEY
    process.env.OPENAI_BASE_URL = env.OPENAI_BASE_URL ?? previous.OPENAI_BASE_URL
    process.env.COMPANY_ENRICH_MODEL = env.COMPANY_ENRICH_MODEL ?? previous.COMPANY_ENRICH_MODEL
    process.env.OPENAI_MODEL = env.OPENAI_MODEL ?? previous.OPENAI_MODEL
  }

  return () => {
    process.env.ANTHROPIC_API_KEY = previous.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_BASE_URL = previous.ANTHROPIC_BASE_URL
    process.env.WRITER_MODEL = previous.WRITER_MODEL
    process.env.OPENAI_API_KEY = previous.OPENAI_API_KEY
    process.env.OPENAI_BASE_URL = previous.OPENAI_BASE_URL
    process.env.COMPANY_ENRICH_MODEL = previous.COMPANY_ENRICH_MODEL
    process.env.OPENAI_MODEL = previous.OPENAI_MODEL
  }
}
