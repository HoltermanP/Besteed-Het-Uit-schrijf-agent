import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.goto('/')
})

test('laadt de werkplek met concept en bronnen', async ({ page }) => {
  await expect(page.locator('.topbar h1')).toHaveText('Winnende inschrijving dienstverlening')
  await expect(page.locator('.proposal-doc .kicker')).toContainText('Brons versie')
  await expect(page.getByText('Inschrijving voor Publieke opdrachtgever')).toBeVisible()
  await expect(page.getByText('Programma van Eisen')).toBeVisible()
})

test('genereert concept en voert AI-review uit', async ({ page }) => {
  await page.getByRole('button', { name: 'Genereer' }).click()
  await expect(page.getByText('Concept lokaal opgeslagen')).toBeVisible()
  await page.getByRole('button', { name: 'Review uitvoeren' }).click()
  await expect(page.locator('.finding').first()).toBeVisible()
})

test('importeert TenderNed dossier', async ({ page }) => {
  await page.getByRole('button', { name: 'Importeer TenderNed dossier' }).click()
  await expect(page.locator('.workspace-status')).toContainText('TenderNed dossier')
  await expect(page.getByText(/TenderNed import TN-2026-00421/)).toBeVisible()
})

test('verwerkt menselijke opmerkingen via AI', async ({ page }) => {
  await page.getByPlaceholder('Plaats opmerking of wijzigingsinstructie...').fill('Maak de intro korter.')
  await page.getByRole('button', { name: 'Opmerking plaatsen' }).click()
  await expect(page.getByText('Maak de intro korter.')).toBeVisible()
  await page.getByRole('button', { name: 'Verwerk opmerkingen' }).click()
  await expect(page.getByText('AI-verwerking review')).toBeVisible()
})
