import { expect, test } from '@playwright/test'
import { LEIDRAAD_TEKST, PVE_TEKST, addManualSource, createProject, resetWorkspace } from './helpers'

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page)
  await createProject(page)
  await addManualSource(page, 'Aanbestedingsleidraad', LEIDRAAD_TEKST)
  await addManualSource(page, 'Programma van Eisen', PVE_TEKST)
})

test('analyseert leidraad met eisen en schrijfstijl', async ({ page }) => {
  // De analyse zit in een dialog achter de knop "Leidraadanalyse".
  await page.getByRole('button', { name: 'Leidraadanalyse' }).click()
  await page.getByRole('button', { name: 'Analyseer dossier' }).click()

  await expect(page.getByText(/Leidraad "Aanbestedingsleidraad"/)).toBeVisible()
  await expect(page.getByText(/max\. 3500 woorden/)).toBeVisible()
  await expect(page.getByText('Referentielijst (verplicht)')).toBeVisible()
  await expect(page.getByText(/Inschrijver:/).first()).toBeVisible()
  await expect(page.getByText(/Opdrachtgever:/).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Vraag achter de vraag' })).toBeVisible()
  await expect(page.getByText(/Expliciet gevraagd:/)).toBeVisible()
})

test('genereert concept met leidraadanalyse-sectie', async ({ page }) => {
  await page.getByRole('button', { name: 'Start schrijfagent' }).first().click()
  await expect(page.getByText('0. Leidraadanalyse en schrijfstijl')).toBeVisible()
  await expect(page.getByText('Gevraagde inhoud en onderwerpen')).toBeVisible()
  await expect(page.getByText('Vraag achter de vraag (intern — niet indienen)')).toBeVisible()

  // Statistiekkaart "Leidraad" toont "Ja" zodra de analyse de leidraad heeft gevonden.
  await expect(page.getByText('Ja', { exact: true })).toBeVisible()
})
