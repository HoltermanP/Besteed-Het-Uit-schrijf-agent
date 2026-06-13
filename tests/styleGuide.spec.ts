import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
})

test('schrijfstijlpagina laadt en toont upload', async ({ page }) => {
  await page.goto('/schrijfstijl')
  await expect(page.getByRole('heading', { name: 'Stijlbibliotheek' })).toBeVisible()
  await expect(page.getByText('Ondersteund: PDF, Word, PowerPoint, Excel')).toBeVisible()
})

test('navigatie vanuit werkplek naar schrijfstijl', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Schrijfstijl & kwaliteit' }).click()
  await expect(page).toHaveURL(/\/schrijfstijl/)
})

test('upload stijldocument slaat tekst op in bibliotheek', async ({ page }) => {
  await page.goto('/schrijfstijl')
  await page.getByPlaceholder('Bijv. HU Schrijfwijzer 2025').fill('Schrijfwijzer')
  await page.setInputFiles('input[type="file"]', {
    name: 'schrijfwijzer.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Schrijf concreet, toetsbaar en zonder promotionele taal.'),
  })

  await expect(
    page.locator('.style-guide-list li').filter({ hasText: 'Schrijfwijzer' }).first(),
  ).toBeVisible()
})
