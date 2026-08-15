import { expect, test } from '@playwright/test'
import { createProject, resetWorkspace } from './helpers'

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page)
})

test('projectenoverzicht start leeg en maakt een nieuw project aan', async ({ page }) => {
  await expect(page.getByText('Nog geen projecten.')).toBeVisible()
  await createProject(page, 'Winnende inschrijving dienstverlening')
  await expect(page.getByText('Brons versie')).toBeVisible()
  // Terug op het overzicht staat het project als kaart met open-knop.
  await page.getByRole('link', { name: 'Alle projecten' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Winnende inschrijving dienstverlening')).toBeVisible()
  await page.getByRole('button', { name: 'Openen' }).click()
  await expect(page).toHaveURL(/\/projecten\//)
})

test('genereert concept en voert AI-review uit', async ({ page }) => {
  await createProject(page)
  await page.getByRole('button', { name: 'Genereer' }).click()
  await expect(
    page.getByText(/concept lokaal opgeslagen|Analyse en concept/i),
  ).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Brons versie')).toBeVisible({ timeout: 15000 })
  // De reviewagent zit in een dialog achter de knop "AI-review".
  await page.getByRole('button', { name: 'AI-review', exact: true }).click()
  await page.getByRole('button', { name: 'Review uitvoeren', exact: true }).click()
  // De review-agent toont minstens één bevinding.
  await expect(page.getByTestId('review-finding').first()).toBeVisible({ timeout: 15000 })
})

test('tender ophalen valideert de invoer', async ({ page }) => {
  await createProject(page)
  await page.getByText('Tender ophalen op publicatie-ID of kenmerk').click()
  await page.getByPlaceholder('publicatie-ID of TN-kenmerk').fill('geen-geldig-id')
  await page.getByRole('button', { name: 'Haal de aanbesteding met alle documenten op en koppel die aan dit project' }).click()
  await expect(page.getByText(/Gebruik een TenderNed publicatie-ID/)).toBeVisible()
})

test('verwerkt menselijke opmerkingen via AI', async ({ page }) => {
  await createProject(page)
  // Algemene opmerkingen zitten achter een uitklapbare disclosure in het reviewpaneel.
  await page.getByText('Of plaats een algemene opmerking').click()
  await page.getByPlaceholder('Algemene opmerking (zonder tekstselectie)...').fill('Maak de intro korter.')
  await page.getByRole('button', { name: 'Algemene opmerking plaatsen' }).click()
  await expect(page.getByText('Maak de intro korter.')).toBeVisible()
  await page.getByRole('button', { name: 'Verwerk opmerkingen' }).click()
  await expect(page.getByText('AI-verwerking review')).toBeVisible({ timeout: 15000 })
})
