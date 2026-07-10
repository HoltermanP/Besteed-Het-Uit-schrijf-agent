import type { Page } from '@playwright/test'

// Reset de werkruimte: leeg de database-opslag (in de tests een in-memory store via
// STATE_MEMORY=1) en start met een schone pagina. Vervangt het oude localStorage.clear().
export async function resetWorkspace(page: Page) {
  await page.request.delete('/api/state')
  await page.goto('/')
  await page.evaluate(() => {
    sessionStorage.clear()
  })
}
