import { expect, test } from '@playwright/test'

const ADMIN_PASSWORD = 'test-admin-wachtwoord'

async function resetStorage(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
}

test('admin vereist inloggen', async ({ page }) => {
  await resetStorage(page)
  await page.goto('/admin')
  await expect(page.getByText('Admin toegang')).toBeVisible()
  await expect(page.getByText('TenderNed API')).not.toBeVisible()
})

test('admin login en API-config opslaan', async ({ page }) => {
  await resetStorage(page)
  await page.goto('/admin')
  await expect(page.getByText('Admin toegang')).toBeVisible()
  await page.getByPlaceholder('Admin wachtwoord').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Inloggen' }).click()

  await expect(page.getByText('TenderNed API')).toBeVisible()
  await page.getByRole('switch', { name: 'Neon-sync actief' }).click()
  await page.getByTestId('neon-connection').fill('postgresql://demo@neon.tech/bid')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByText('Instellingen opgeslagen in deze browser.')).toBeVisible()

  await page.goto('/')
  await page.getByText('Handmatig kenmerk invoeren').click()
  await page.getByRole('button', { name: 'Importeer TenderNed dossier' }).click()
  await expect(page.getByText(/Neon-sync/)).toBeVisible()
})

test('verkeerd admin wachtwoord wordt geweigerd', async ({ page }) => {
  await resetStorage(page)
  await page.goto('/admin')
  await page.getByPlaceholder('Admin wachtwoord').fill('fout-wachtwoord')
  await page.getByRole('button', { name: 'Inloggen' }).click()
  await expect(page.getByText('Onjuist wachtwoord.')).toBeVisible()
})
