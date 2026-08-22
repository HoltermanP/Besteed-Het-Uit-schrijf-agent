import { expect, test, type Page } from '@playwright/test'
import { resetWorkspace } from './helpers'
import { evidenceHandle } from '../src/lib/evidence'

/**
 * Bewijsbibliotheek: referenties, cases en cijfers zijn losse bouwstenen met een bron.
 * Wat bewijs heeft is citeerbaar en gaat mee naar de schrijfagent; wat geen bewijs heeft
 * blijft staan maar wordt niet gebruikt. De review legt elke claim in het concept terug
 * op een bouwsteen en markeert wat zonder bewijs in de tekst staat.
 */

type StoredBlock = { id: string; title: string }

/** Leeg de bibliotheek: de opslag is server-side en blijft tussen tests staan. */
async function clearEvidence(page: Page) {
  const response = await page.request.get('/api/evidence?companyId=default')
  const { blocks } = (await response.json()) as { blocks: StoredBlock[] }
  for (const block of blocks) {
    await page.request.delete(`/api/evidence?id=${block.id}&companyId=default`)
  }
}

async function addBlock(page: Page, data: Record<string, unknown>): Promise<StoredBlock> {
  const response = await page.request.post('/api/evidence', {
    data: { companyId: 'default', ...data },
  })
  expect(response.ok()).toBeTruthy()
  return ((await response.json()) as { block: StoredBlock }).block
}

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page)
  await clearEvidence(page)
})

test('bouwstenen zijn los te beheren en zonder bewijs niet citeerbaar', async ({ page }) => {
  await page.goto('/bewijs')
  await expect(page.getByRole('heading', { name: 'Bewijs als losse bouwstenen' })).toBeVisible()

  // Een cijfer mét bron: citeerbaar, dus bruikbaar voor de schrijfagent.
  await page.getByLabel('Soort bouwsteen').click()
  await page.getByRole('option', { name: 'Cijfer' }).click()
  await page.getByLabel('Titel').fill('Klanttevredenheid inkoopdesk')
  await page.getByLabel('Feit dat geciteerd mag worden').fill(
    'De inkoopdesk scoort een klanttevredenheid van 8,7 op een schaal van 10.',
  )
  await page.getByLabel('Waarde').fill('8,7')
  await page.getByLabel('Eenheid').fill('/10')
  await page.getByLabel('Bewijs').fill('Klanttevredenheidsonderzoek Q4 2025, rapport KTO-2025-04.')
  await page.getByRole('button', { name: 'Bouwsteen opslaan' }).click()

  const eerste = page.getByTestId('evidence-block').first()
  await expect(eerste).toContainText('Klanttevredenheid inkoopdesk')
  await expect(eerste).toContainText('Citeerbaar')
  await expect(eerste).toContainText('8,7/10')

  // Een referentie zonder bron: blijft in de bibliotheek, maar is geen bewijs.
  await page.getByLabel('Titel').fill('Raamovereenkomst provincie')
  await page.getByLabel('Feit dat geciteerd mag worden').fill(
    'Wij voeren sinds 2022 de raamovereenkomst inkoopadvies voor een provincie uit.',
  )
  await page.getByRole('button', { name: 'Bouwsteen opslaan' }).click()

  const zonderBewijs = page.getByTestId('evidence-block').first()
  await expect(zonderBewijs).toContainText('Raamovereenkomst provincie')
  await expect(zonderBewijs).toContainText('Geen bewijs vastgelegd')
  await expect(page.getByTestId('evidence-count')).toContainText('2 van 2 bouwsteen(en) · 1 citeerbaar')

  // Alsnog bewijs vastleggen maakt de bouwsteen citeerbaar.
  await zonderBewijs.getByRole('button', { name: 'Bewerken' }).click()
  await zonderBewijs.getByLabel('Bewijs').fill('Contract 2022-114, verlengd t/m 2027.')
  await zonderBewijs.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByTestId('evidence-count')).toContainText('2 citeerbaar')

  // Zoeken filtert op inhoud, verwijderen haalt de bouwsteen echt weg.
  await page.getByPlaceholder('Zoek in bouwstenen…').fill('klanttevredenheid')
  await expect(page.getByTestId('evidence-block')).toHaveCount(1)
  await page.getByPlaceholder('Zoek in bouwstenen…').fill('')
  await page.getByTestId('evidence-block').first().getByRole('button', { name: 'Verwijderen' }).click()
  await expect(page.getByTestId('evidence-block')).toHaveCount(1)

  await page.reload()
  await expect(page.getByTestId('evidence-block')).toHaveCount(1)
})

test('de review markeert claims zonder bewijs en herkent een geciteerde bouwsteen', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'één review is genoeg')

  const block = await addBlock(page, {
    kind: 'referentie',
    title: 'Aanbestedingsbegeleiding gemeente Testdorp',
    client: 'Gemeente Testdorp',
    claim: 'In 2024 begeleidden wij 12 aanbestedingen voor gemeente Testdorp.',
    proof: 'Opdrachtbevestiging 2024-07 en referentieverklaring van de inkoopmanager.',
  })
  const handle = evidenceHandle(block.id)

  const draft = `<article class="proposal-doc">
  <section class="doc-section">
    <h2>1. Onze aanpak</h2>
    <p class="section-subtitle">Beoordeeld op: kwaliteit</p>
    <p><span data-bewijs="${handle}">In 2024 begeleidden wij 12 aanbestedingen voor gemeente Testdorp</span>, telkens binnen de gestelde termijn.</p>
    <p>Wij realiseren altijd een besparing van 37% op de inkoopkosten van onze opdrachtgevers.</p>
  </section>
</article>`

  await page.request.put('/api/state', {
    data: {
      set: {
        'bid-agent-dossier-bewijs-1': JSON.stringify({
          project: { title: 'Bewijsproject', tendernedId: 'TN-9', buyer: 'Gemeente Testdorp', deadline: '' },
          documents: [],
          comments: [],
          stage: 'brons',
          draft,
          analysis: {
            analyzedAt: '2026-01-01',
            leidraadFound: true,
            summary: 'Test',
            wordLimits: [],
            contentRequirements: [],
            documentRequirements: [],
            requestedDocuments: [],
            submissionRequirements: [],
            evaluationCriteria: [],
            styleProfile: {
              companyName: 'Test',
              buyerName: 'Gemeente Testdorp',
              companySignals: [],
              buyerSignals: [],
            },
            gaps: [],
          },
          updatedAt: '2026-01-01T10:00:00.000Z',
        }),
      },
    },
  })

  await page.goto('/projecten/bewijs-1')
  await expect(page.getByRole('heading', { name: 'Bewijsproject', level: 1 }).first()).toBeVisible()

  await page.getByRole('button', { name: 'AI-review' }).click()
  await page.getByRole('button', { name: 'Review uitvoeren' }).click()

  const bewijscheck = page.getByTestId('claim-check')
  await expect(bewijscheck).toBeVisible({ timeout: 30000 })

  // De claim met het geciteerde bewijs is herkend als onderbouwd, met de verwijzing erbij.
  const onderbouwd = page.getByTestId('claim-proven')
  await expect(onderbouwd).toHaveCount(1)
  await expect(onderbouwd).toContainText(handle)

  // De losse claim van 37% staat in geen enkele bron: die hoort gemarkeerd te worden.
  const onbewezen = page.getByTestId('claim-unproven')
  await expect(onbewezen).toHaveCount(1)
  await expect(onbewezen).toContainText('37%')
  await expect(onbewezen).toContainText('Onderbouw met een bouwsteen of schrap het getal.')

  // …en ook in de tekst zelf, zodat de schrijver ziet waar het misgaat.
  await page.keyboard.press('Escape')
  const markering = page.locator('.claim-mark')
  await expect(markering).toHaveCount(1)
  await expect(markering).toContainText('37%')
})
