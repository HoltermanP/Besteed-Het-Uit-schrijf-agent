import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
})

test('schrijfregelspagina laadt en toont formulier', async ({ page }) => {
  await page.goto('/schrijfregels')
  await expect(page.getByRole('heading', { name: 'Schrijfregel aanmaken' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Regeldocument uploaden' })).toBeVisible()
})

test('navigatie vanuit werkplek naar schrijfregels', async ({ page }) => {
  await page.goto('/')
  await page.locator('.config-nav-link', { hasText: 'Schrijfregels' }).click()
  await expect(page).toHaveURL(/\/schrijfregels/)
})

test('schrijfregel aanmaken en opslaan', async ({ page }) => {
  await page.goto('/schrijfregels')
  await page.getByPlaceholder('Bijv. Verboden formuleringen').fill('Verboden woorden')
  await page.locator('.rules-editor').fill('Gebruik geen superlatieven zonder bewijs.')
  await page.getByRole('button', { name: 'Schrijfregel opslaan' }).click()

  await expect(page.locator('.rules-list li').first()).toContainText('Verboden woorden')
  await expect(page.getByText('Schrijfregel opgeslagen.')).toBeVisible()
})

test('regeldocument uploaden', async ({ page }) => {
  await page.goto('/schrijfregels')
  await page.setInputFiles('input[type="file"]', {
    name: 'kwaliteitsstandaard.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Elke uitspraak moet toetsbaar zijn aan een bewijsstuk.'),
  })

  await expect(page.locator('.rules-list').getByText('kwaliteitsstandaard.txt').first()).toBeVisible()
})
