import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
})

test('schrijfkaderpagina laadt en toont sectie met editor', async ({ page }) => {
  await page.goto('/schrijfregels')
  await expect(
    page.getByRole('heading', { name: 'Schrijfregels, schrijfwijze & kwaliteit' }),
  ).toBeVisible()

  const section = page.getByTestId('kader-section-richtlijnen')
  await expect(section.getByRole('heading', { name: 'Schrijfregels' })).toBeVisible()
  await expect(section.getByText('Regel schrijven')).toBeVisible()
  await expect(section.getByText('Bron uploaden & AI')).toBeVisible()
})

test('navigatie vanuit werkplek naar schrijfkader', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('navigation').getByRole('link', { name: 'Schrijfkader' }).click()
  await expect(page).toHaveURL(/\/schrijfregels/)
})

test('schrijfregel aanmaken en opslaan', async ({ page }, testInfo) => {
  // Unieke naam: beide browserprojecten delen één dev-server (in-memory store).
  // Zonder uniek label matcht de assertie meerdere identieke items (strict-mode).
  const ruleName = `Verboden woorden ${testInfo.project.name}-${Date.now()}`
  await page.goto('/schrijfregels')
  const section = page.getByTestId('kader-section-richtlijnen')

  await section.getByPlaceholder('Bijv. Verboden formuleringen').fill(ruleName)
  await section
    .getByLabel('Inhoud')
    .fill('Gebruik geen superlatieven zonder bewijs.')
  await section.getByRole('button', { name: 'Regel opslaan' }).click()

  await expect(section.getByText('Regel opgeslagen.')).toBeVisible()
  await expect(section.getByRole('listitem').filter({ hasText: ruleName })).toBeVisible()
})

test('regeldocument uploaden', async ({ page }, testInfo) => {
  const fileName = `kwaliteitsstandaard-${testInfo.project.name}-${Date.now()}.txt`
  await page.goto('/schrijfregels')
  const section = page.getByTestId('kader-section-richtlijnen')

  await section.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: 'text/plain',
    buffer: Buffer.from('Elke uitspraak moet toetsbaar zijn aan een bewijsstuk.'),
  })

  await expect(
    section.getByRole('listitem').filter({ hasText: fileName }),
  ).toBeVisible()
})
