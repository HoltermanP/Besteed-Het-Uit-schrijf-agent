import { expect, test, type Page } from '@playwright/test'
import { resetWorkspace } from './helpers'

// Indieningsscherm ("laatste dag"): alle stukken, bijlagen en eisen aan het bidteam op
// één scherm met status en bestand, plus de countdown naar de deadline.

const PROJECT_ID = 'tn-indiening'

function isoDate(daysFromNow: number) {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const planVanAanpak = {
  id: 'doc-plan-van-aanpak',
  title: 'Plan van aanpak',
  kind: 'schrijfstuk',
  question: 'Beschrijf de aanpak van de dienstverlening.',
  criteria: ['Kwaliteit 70%'],
  topics: ['Aanpak', 'Planning'],
  wordLimits: [{ label: 'Plan van aanpak', max: 3500, unit: 'woorden', source: 'leidraad.pdf' }],
  mandatory: true,
  source: 'leidraad.pdf',
}

async function seedProject(page: Page, options: { deadline: string; deadlineTime?: string }) {
  await page.request.put('/api/state', {
    data: {
      set: {
        [`bid-agent-dossier-${PROJECT_ID}`]: JSON.stringify({
          project: {
            title: 'Inschrijving schoonmaak',
            tendernedId: 'TN-1',
            buyer: 'Gemeente Test',
            deadline: options.deadline,
            deadlineTime: options.deadlineTime,
          },
          documents: [],
          tenderDocuments: [],
          drafts: [
            {
              id: planVanAanpak.id,
              title: planVanAanpak.title,
              source: 'analyse',
              requested: planVanAanpak,
              stage: 'zilver',
              html: '<div class="proposal-doc"><h1>Plan van aanpak</h1><p>Onze aanpak in drie stappen.</p></div>',
              comments: [],
              updatedAt: '2026-01-01T10:00:00.000Z',
            },
          ],
          activeDraftId: planVanAanpak.id,
          comments: [],
          stage: 'zilver',
          draft: '<div class="proposal-doc"><h1>Plan van aanpak</h1><p>Onze aanpak in drie stappen.</p></div>',
          analysis: {
            analyzedAt: '2026-01-01T10:00:00.000Z',
            leidraadFound: true,
            leidraadSource: 'leidraad.pdf',
            summary: 'Testanalyse',
            wordLimits: [],
            contentRequirements: [],
            documentRequirements: [{ name: 'Verklaring bankgarantie', mandatory: true, source: 'leidraad.pdf' }],
            requestedDocuments: [
              planVanAanpak,
              {
                id: 'doc-uea',
                title: 'UEA',
                kind: 'formulier',
                question: 'Ingevuld en ondertekend Uniform Europees Aanbestedingsdocument.',
                criteria: [],
                topics: [],
                wordLimits: [],
                mandatory: true,
                source: 'leidraad.pdf',
              },
              {
                id: 'doc-referenties',
                title: 'Referenties',
                kind: 'bewijsstuk',
                question: 'Drie referenties van vergelijkbare opdrachten.',
                criteria: [],
                topics: [],
                wordLimits: [],
                mandatory: true,
                source: 'leidraad.pdf',
              },
            ],
            submissionRequirements: [],
            requirements: [
              {
                id: 'req-indiening-inschrijving-rechtsgeldig-ondertekenen',
                category: 'indiening',
                text: 'Inschrijving rechtsgeldig ondertekenen',
                mandatory: true,
                source: 'leidraad.pdf',
                reference: '§ 4.2',
                checkBy: 'gebruiker',
                question: 'Wie tekent namens de inschrijver?',
              },
              {
                id: 'req-document-uea-aanleveren',
                category: 'document',
                text: 'UEA aanleveren (formulier)',
                mandatory: true,
                source: 'leidraad.pdf',
                documentTitle: 'UEA',
                documentId: 'doc-uea',
                checkBy: 'gebruiker',
              },
              {
                id: 'req-inhoud-planning-opnemen',
                category: 'inhoud',
                text: 'Planning opnemen in het plan van aanpak',
                mandatory: true,
                source: 'leidraad.pdf',
                checkBy: 'agent',
              },
            ],
            evaluationCriteria: ['Kwaliteit 70%', 'Prijs 30%'],
            styleProfile: { companyName: 'Test BV', buyerName: 'Gemeente Test', companySignals: [], buyerSignals: [], blendedGuidance: '' },
            gaps: [],
          },
          updatedAt: '2026-01-01T10:00:00.000Z',
        }),
      },
    },
  })
}

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page)
})

test('toont stukken, bijlagen en eisen met status en bestand, en telt af naar de deadline', async ({ page }) => {
  await seedProject(page, { deadline: isoDate(3), deadlineTime: '12:00' })
  await page.goto(`/projecten/${PROJECT_ID}/indiening`)
  await expect(page.getByRole('heading', { name: 'Inschrijving schoonmaak', level: 1 })).toBeVisible()

  // Countdown: over ruim twee dagen, dus "nog N dagen en N uur".
  await expect(page.getByTestId('countdown-label')).toHaveText(/^nog \d+ dag(en)? en \d+ uur$/)

  // Schrijfstuk in zilver telt als "bezig"; bijlagen uit de analyse en losse documenteisen staan open.
  const stuk = page.getByTestId('submission-item').filter({ hasText: 'Plan van aanpak' })
  await expect(stuk).toHaveAttribute('data-status', 'bezig')
  await expect(stuk.getByText('Zilver')).toBeVisible()
  await expect(stuk.getByText(/max\. 3\.500 woorden/)).toBeVisible()
  const uea = page.getByTestId('submission-item').filter({ hasText: 'UEA' })
  await expect(uea).toHaveAttribute('data-status', 'open')
  await expect(uea).toHaveAttribute('data-section', 'bijlage')
  await expect(page.getByTestId('submission-item').filter({ hasText: 'Referenties' })).toHaveAttribute('data-section', 'bijlage')
  await expect(page.getByTestId('submission-item').filter({ hasText: 'Verklaring bankgarantie' })).toHaveAttribute('data-section', 'bijlage')
  // De eis over het UEA wordt niet dubbel getoond; de ondertekeningseis wel, met vraag aan het bidteam.
  await expect(page.getByTestId('submission-item').filter({ hasText: 'UEA aanleveren' })).toHaveCount(0)
  const eis = page.getByTestId('submission-item').filter({ hasText: 'Inschrijving rechtsgeldig ondertekenen' })
  await expect(eis).toHaveAttribute('data-section', 'eis')
  await expect(eis.getByText('Wie tekent namens de inschrijver?')).toBeVisible()
  // Eisen die de agent aan de tekst toetst horen niet op het indieningsscherm.
  await expect(page.getByTestId('submission-item').filter({ hasText: 'Planning opnemen' })).toHaveCount(0)
  await expect(page.getByTestId('submission-progress')).toHaveText('0/5 gereed')

  // Bestand bij het UEA: zonder documentarchief worden de bestandsgegevens vastgelegd en springt de status op gereed.
  await page.locator('#submission-file-doc-uea').setInputFiles({
    name: 'uea-ondertekend.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 test'),
  })
  await expect(uea.getByTestId('submission-file')).toContainText('uea-ondertekend.pdf')
  await expect(uea).toHaveAttribute('data-status', 'gereed')

  // Eigenaar en status van de eis; afvinken werkt door in het eisenregister.
  await eis.getByLabel(/^Eigenaar van:/).fill('Sanne')
  await eis.getByLabel(/^Eigenaar van:/).blur()
  await eis.getByLabel(/^Status van:/).click()
  await page.getByRole('option', { name: 'Gereed' }).click()
  await expect(eis).toHaveAttribute('data-status', 'gereed')
  await expect(page.getByTestId('submission-progress')).toHaveText('2/5 gereed')

  // Alles blijft bewaard na herladen.
  await page.reload()
  await expect(page.getByTestId('submission-item').filter({ hasText: 'UEA' }).getByTestId('submission-file')).toContainText('uea-ondertekend.pdf')
  const eisNaHerladen = page.getByTestId('submission-item').filter({ hasText: 'Inschrijving rechtsgeldig ondertekenen' })
  await expect(eisNaHerladen).toHaveAttribute('data-status', 'gereed')
  await expect(eisNaHerladen.getByLabel(/^Eigenaar van:/)).toHaveValue('Sanne')
  await expect(page.getByTestId('submission-progress')).toHaveText('2/5 gereed')

  // In de werkplek staat de eis nu op voldaan en verwijst de knop Indiening naar dit scherm.
  await page.goto(`/projecten/${PROJECT_ID}`)
  await expect(page.getByRole('link', { name: /^Indiening/ })).toContainText(/nog \d+ dag/)
  await page.getByRole('region', { name: 'Eisen aan de inschrijving' }).getByRole('button', { name: /^Alle eisen/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Eisenregister' })
  await dialog.getByRole('button', { name: /^Voldaan \(/ }).click()
  await expect(dialog.getByTestId('requirement-row').filter({ hasText: 'Inschrijving rechtsgeldig ondertekenen' })).toHaveAttribute('data-status', 'voldaan')
})

test('eigen bijlage toevoegen, verstreken deadline en inschrijving als ingediend markeren', async ({ page }) => {
  await seedProject(page, { deadline: isoDate(-1), deadlineTime: '10:00' })
  await page.goto(`/projecten/${PROJECT_ID}/indiening`)
  await expect(page.getByTestId('countdown-label')).toHaveText(/geleden verstreken$/)

  await page.getByRole('button', { name: 'Eigen bijlage' }).click()
  await page.getByLabel('Naam van de bijlage').fill('Verklaring verzekering')
  await page.getByRole('button', { name: 'Toevoegen aan indieningsset' }).click()
  const custom = page.getByTestId('submission-item').filter({ hasText: 'Verklaring verzekering' })
  await expect(custom).toHaveAttribute('data-section', 'bijlage')
  await expect(custom.getByText('zelf toegevoegd')).toBeVisible()
  await expect(page.getByTestId('submission-progress')).toHaveText('0/6 gereed')

  await page.getByRole('button', { name: 'Inschrijving ingediend' }).click()
  await expect(page.getByText(/Ingediend op \d{2}-\d{2}-\d{4}/)).toBeVisible()
  await page.reload()
  await expect(page.getByText(/Ingediend op \d{2}-\d{2}-\d{4}/)).toBeVisible()
  await expect(page.getByTestId('submission-item').filter({ hasText: 'Verklaring verzekering' })).toBeVisible()

  await custom.getByRole('button', { name: /^Verwijder bijlage/ }).click()
  await expect(page.getByTestId('submission-item').filter({ hasText: 'Verklaring verzekering' })).toHaveCount(0)
})
