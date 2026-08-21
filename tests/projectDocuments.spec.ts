import { expect, test } from '@playwright/test'
import { createProject, resetWorkspace } from './helpers'

// Eigen aanbestedingsdocumenten per project: bestanden die niet van TenderNed komen,
// geüpload in de kaart "Aanbestedingsdocumenten" van de projectomgeving.

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page)
  await createProject(page)
})

test('upload eigen projectdocument als aanbestedingsbron en verwijder het weer', async ({ page }) => {
  await expect(page.getByText('Nog geen documenten bij dit project.')).toBeVisible()

  await page.locator('#project-document-upload').setInputFiles({
    name: 'nota-van-inlichtingen.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Nota van inlichtingen 1. Vraag 1: mag de inschrijving digitaal? Antwoord: ja, via TenderNed. Vraag 2: is de referentie-eis van drie projecten hard? Antwoord: ja, drie vergelijkbare opdrachten in de afgelopen vijf jaar.',
    ),
  })

  await expect(page.getByText('1 document(en) toegevoegd als aanbestedingsbron.')).toBeVisible()
  // Bestand staat in de documentenlijst, gemarkeerd als eigen upload …
  const row = page.locator('li', { hasText: 'nota-van-inlichtingen.txt' })
  await expect(row).toBeVisible()
  await expect(row.getByText('Eigen upload')).toBeVisible()
  // … en de tekst is als aanbestedingsbron opgenomen.
  await expect(page.getByRole('heading', { name: 'Bronnen (1)' })).toBeVisible()
  await expect(page.locator('article', { hasText: 'nota-van-inlichtingen.txt' }).getByText('Aanbesteding')).toBeVisible()

  // Verwijderen haalt bestand én bron weg.
  await row.getByRole('button', { name: 'Verwijder nota-van-inlichtingen.txt' }).click()
  await expect(row).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Bronnen (0)' })).toBeVisible()
  await expect(page.getByText('Nog geen documenten bij dit project.')).toBeVisible()
})

test('upload op het tabblad Aanbesteding verschijnt ook bij de aanbestedingsdocumenten', async ({ page }) => {
  // De bronnen-uploadzone staat standaard op het tabblad Aanbesteding.
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'bijlage-pve.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Programma van eisen. De opdrachtnemer levert binnen vier weken na gunning een implementatieplan op, inclusief planning, risicoanalyse en communicatieaanpak richting de gebruikersorganisatie.',
    ),
  })

  await expect(page.getByText('1 document(en) toegevoegd als aanbestedingsbron.')).toBeVisible()
  await expect(page.locator('li', { hasText: 'bijlage-pve.txt' }).getByText('Eigen upload')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bronnen (1)' })).toBeVisible()
})
