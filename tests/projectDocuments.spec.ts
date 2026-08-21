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
  await page.locator('input[type="file"]:not(#project-document-upload)').first().setInputFiles({
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

test('verwijdert een TenderNed-document inclusief zijn tekst uit de aanbestedingsbron', async ({ page }) => {
  // Dossier met twee TenderNed-documenten en de bijbehorende gecombineerde bron seeden
  // (zoals /api/tender-documents die oplevert: één sectie "## <naam> — <categorie>" per document).
  const leidraad = 'Aanbestedingsleidraad. Inschrijvingen uiterlijk 1 oktober. Gunning op beste prijs-kwaliteitverhouding.'
  const nvi = 'Nota van inlichtingen. Vraag: mag een combinatie inschrijven? Antwoord: ja, met hoofdelijke aansprakelijkheid.'
  await page.request.put('/api/state', {
    data: {
      set: {
        'bid-agent-dossier-987654': JSON.stringify({
          project: { title: 'Seeded tender', tendernedId: 'TN-1', buyer: 'Gemeente Test', deadline: '' },
          documents: [
            {
              id: 'src1',
              name: 'Seeded tender',
              type: 'tender',
              content: `## leidraad.pdf — Aanbestedingsleidraad\n${leidraad}\n\n## nvi-1.pdf — Nota van inlichtingen\n${nvi}`,
              importedAt: '01-01-2026, 10:00',
            },
          ],
          tenderDocuments: [
            { naam: 'leidraad.pdf', type: 'pdf', categorie: 'LEI', categorieOmschrijving: 'Aanbestedingsleidraad', grootte: 1000, chars: leidraad.length, status: 'ok' },
            { naam: 'nvi-1.pdf', type: 'pdf', categorie: 'NVI', categorieOmschrijving: 'Nota van inlichtingen', grootte: 800, chars: nvi.length, status: 'ok' },
          ],
          comments: [],
          stage: 'brons',
          draft: '',
          analysis: null,
          updatedAt: '2026-01-01T10:00:00.000Z',
        }),
      },
    },
  })
  await page.goto('/projecten/987654')
  await expect(page.getByRole('heading', { name: 'Seeded tender', level: 1 }).first()).toBeVisible()

  const row = page.locator('li', { hasText: 'nvi-1.pdf' })
  await expect(row.getByText('TenderNed')).toBeVisible()
  await row.getByRole('button', { name: 'Verwijder nvi-1.pdf' }).click()

  await expect(page.getByText('"nvi-1.pdf" verwijderd uit dit project; de tekst is uit de aanbestedingsbron gehaald.')).toBeVisible()
  await expect(row).toHaveCount(0)
  await expect(page.locator('li', { hasText: 'leidraad.pdf' })).toBeVisible()
  // De bron bestaat nog, maar zonder de NvI-tekst.
  await page.getByRole('button', { name: 'Bekijken' }).first().click()
  const viewer = page.locator('pre')
  await expect(viewer).toContainText('Aanbestedingsleidraad')
  await expect(viewer).not.toContainText('hoofdelijke aansprakelijkheid')
})
