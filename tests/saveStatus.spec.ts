import { expect, test, type Page } from '@playwright/test'
import { addManualSource, createProject, resetWorkspace } from './helpers'

// Opslagstatus in de projectomgeving: de schrijver ziet of het werk écht in de database
// staat ("Niet opgeslagen" → "Opslaan…" → "Opgeslagen 14:32") en krijgt een waarschuwing
// bij het sluiten van het tabblad zolang er werk openstaat.

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page)
  await createProject(page)
})

/** Houd schrijfacties naar de database vast totdat de test ze vrijgeeft. */
function holdSaves(page: Page) {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const routed = page.route(
    (url) => url.pathname === '/api/state',
    async (route) => {
      if (route.request().method() === 'GET') return route.continue()
      await gate
      await route.continue()
    },
  )
  return { routed, release }
}

test('toont niet opgeslagen, bezig en opgeslagen met tijdstip', async ({ page }) => {
  const status = page.getByTestId('save-status')
  // Bij het openen wordt het dossier weggeschreven; daarna staat er een tijdstip.
  await expect(status).toHaveAttribute('data-state', 'saved')
  await expect(status).toHaveText(/Opgeslagen \d{2}:\d{2}/)

  const { routed, release } = holdSaves(page)
  await routed
  await addManualSource(page, 'Leidraad', 'Inschrijvers dienen een plan van aanpak in.')

  // Wijziging staat eerst lokaal klaar, dan gaat ze naar de database …
  await expect(status).toHaveAttribute('data-state', 'dirty')
  await expect(status).toHaveText('Niet opgeslagen')
  await expect(status).toHaveAttribute('data-state', 'saving')
  await expect(status).toHaveText('Opslaan…')

  // … en pas als de server bevestigt, staat er weer "Opgeslagen".
  release()
  await expect(status).toHaveAttribute('data-state', 'saved')
  await expect(status).toHaveText(/Opgeslagen \d{2}:\d{2}/)
})

test('meldt een mislukte schrijfactie en herstelt na opnieuw proberen', async ({ page }) => {
  const status = page.getByTestId('save-status')
  await expect(status).toHaveAttribute('data-state', 'saved')

  let fail = true
  await page.route(
    (url) => url.pathname === '/api/state',
    async (route) => {
      if (route.request().method() === 'GET' || !fail) return route.continue()
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"database weg"}' })
    },
  )
  await addManualSource(page, 'Leidraad', 'Inschrijvers dienen een plan van aanpak in.')
  await expect(status).toHaveAttribute('data-state', 'error')
  await expect(status).toContainText('Opslaan mislukt')

  fail = false
  await status.getByRole('button', { name: 'Opnieuw proberen' }).click()
  await expect(status).toHaveAttribute('data-state', 'saved')
})

test('waarschuwt bij sluiten van het tabblad met openstaand werk', async ({ page }) => {
  const status = page.getByTestId('save-status')
  await expect(status).toHaveAttribute('data-state', 'saved')

  const { routed, release } = holdSaves(page)
  await routed
  await addManualSource(page, 'Leidraad', 'Inschrijvers dienen een plan van aanpak in.')
  await expect(status).not.toHaveAttribute('data-state', 'saved')

  const dialog = page.waitForEvent('dialog')
  void page.close({ runBeforeUnload: true })
  const warning = await dialog
  expect(warning.type()).toBe('beforeunload')
  release()
  await warning.accept()
})

test('sluit zonder waarschuwing als alles is opgeslagen', async ({ page }) => {
  const status = page.getByTestId('save-status')
  await addManualSource(page, 'Leidraad', 'Inschrijvers dienen een plan van aanpak in.')
  await expect(status).toHaveAttribute('data-state', 'saved')

  let dialogs = 0
  page.on('dialog', (dialog) => {
    dialogs += 1
    void dialog.accept()
  })
  await page.close({ runBeforeUnload: true })
  expect(dialogs).toBe(0)
})
