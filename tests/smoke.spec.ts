import { expect, test } from '@playwright/test'
import { resetWorkspace } from './helpers'

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page)
})

test('laadt de werkplek met concept en bronnen', async ({ page }) => {
  await expect(
    page.getByRole('heading', { name: 'Winnende inschrijving dienstverlening', level: 1 }).first(),
  ).toBeVisible()
  await expect(page.getByText('Brons versie')).toBeVisible()
  await expect(page.getByText('Inschrijving voor Publieke opdrachtgever')).toBeVisible()
  await expect(page.getByText('Programma van Eisen').first()).toBeVisible()
})

test('genereert concept en voert AI-review uit', async ({ page }) => {
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

test('importeert TenderNed dossier', async ({ page }) => {
  await page.getByText('Handmatig kenmerk invoeren').click()
  await page.getByRole('button', { name: 'Importeer TenderNed dossier' }).click()
  await expect(page.getByText(/TenderNed dossier geïmporteerd/)).toBeVisible()
  await expect(page.getByText(/TenderNed import TN-2026-00421/).first()).toBeVisible()
})

test('verwerkt menselijke opmerkingen via AI', async ({ page }) => {
  // Algemene opmerkingen zitten achter een uitklapbare disclosure in het reviewpaneel.
  await page.getByText('Of plaats een algemene opmerking').click()
  await page.getByPlaceholder('Algemene opmerking (zonder tekstselectie)...').fill('Maak de intro korter.')
  await page.getByRole('button', { name: 'Algemene opmerking plaatsen' }).click()
  await expect(page.getByText('Maak de intro korter.')).toBeVisible()
  await page.getByRole('button', { name: 'Verwerk opmerkingen' }).click()
  await expect(page.getByText('AI-verwerking review')).toBeVisible({ timeout: 15000 })
})
