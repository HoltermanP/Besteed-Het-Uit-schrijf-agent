import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
})

// De losse Stijlbibliotheek-pagina bestaat niet meer: /schrijfstijl is samengevoegd
// in het Schrijfkader op /schrijfregels en moet daarheen redirecten.
test('schrijfstijl redirect naar het schrijfkader', async ({ page }) => {
  await page.goto('/schrijfstijl')
  await expect(page).toHaveURL(/\/schrijfregels/)
  await expect(
    page.getByRole('heading', { name: 'Schrijfregels, schrijfwijze & kwaliteit' }),
  ).toBeVisible()
})

test('schrijfkader toont de vier secties', async ({ page }) => {
  await page.goto('/schrijfregels')
  await expect(
    page.getByTestId('kader-section-richtlijnen').getByRole('heading', { name: 'Schrijfregels' }),
  ).toBeVisible()
  await expect(
    page.getByTestId('kader-section-schrijfstijl').getByRole('heading', { name: 'Schrijfwijze' }),
  ).toBeVisible()
  await expect(
    page.getByTestId('kader-section-kwaliteit').getByRole('heading', { name: 'Kwaliteit' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Eerdere aanbestedingen & achtergrond' }),
  ).toBeVisible()
})
