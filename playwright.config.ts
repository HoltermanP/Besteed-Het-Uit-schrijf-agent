import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // De werkruimte-opslag is server-side (in-memory tijdens tests); tests moeten daarom
  // serieel draaien zodat de reset per test geen andere tests raakt.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev -- -H 127.0.0.1 -p 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PLAYWRIGHT: '1',
      NEXT_PUBLIC_ADMIN_PASSWORD: 'test-admin-wachtwoord',
      STYLE_DOCS_MEMORY: '1',
      EVIDENCE_MEMORY: '1',
      STATE_MEMORY: '1',
      DATABASE_URL: '',
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
})
