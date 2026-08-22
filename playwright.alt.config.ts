import { defineConfig, devices } from '@playwright/test'

const PORT = 5199
const ROOT = '/Users/patrickholterman/Library/CloudStorage/OneDrive-Persoonlijk/Werk/02_AI-Group/AI-Schrijfagent-Besteed-Het-Uit'

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: `npm run dev -- -H 127.0.0.1 -p ${PORT}`,
    cwd: ROOT,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PLAYWRIGHT: '1',
      NEXT_PUBLIC_ADMIN_PASSWORD: 'test-admin-wachtwoord',
      STYLE_DOCS_MEMORY: '1',
      STATE_MEMORY: '1',
      DATABASE_URL: '',
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
