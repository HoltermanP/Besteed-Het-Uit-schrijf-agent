import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.goto('/')
})

test('analyseert leidraad met eisen en schrijfstijl', async ({ page }) => {
  await page.getByRole('button', { name: 'Analyseer dossier' }).click()
  await expect(page.getByText(/Leidraad "Aanbestedingsleidraad"/)).toBeVisible()
  await expect(page.locator('.analysis-panel').getByText(/max\. 3500 woorden/)).toBeVisible()
  await expect(page.getByText('Referentielijst (verplicht)')).toBeVisible()
  await expect(page.locator('.analysis-style-list').getByText(/Inschrijver:/).first()).toBeVisible()
  await expect(page.locator('.analysis-style-list').getByText(/Opdrachtgever:/).first()).toBeVisible()
})

test('genereert concept met leidraadanalyse-sectie', async ({ page }) => {
  await page.getByRole('button', { name: 'Genereer' }).click()
  await expect(page.getByText('0. Leidraadanalyse en schrijfstijl')).toBeVisible()
  await expect(page.getByText('Gevraagde inhoud en onderwerpen')).toBeVisible()
  await expect(page.locator('.metrics').getByText('Ja')).toBeVisible()
})
