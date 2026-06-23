import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
})

test('TenderNed catalogus laadt publicaties', async ({ page }) => {
  await page.goto('/aanbestedingen')
  await expect(page.getByRole('heading', { name: 'TenderNed catalogus' })).toBeVisible()
  await expect(page.getByText(/publicaties in TenderNed/)).toBeVisible({ timeout: 15000 })
})

test('navigatie vanuit werkplek naar catalogus', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Zoek .* download aanbestedingen/ }).click()
  await expect(page).toHaveURL(/\/aanbestedingen/)
})
