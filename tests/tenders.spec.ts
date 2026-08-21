import { expect, test } from '@playwright/test'
import { resetWorkspace } from './helpers'

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page)
})

test('TenderNed catalogus laadt publicaties', async ({ page }) => {
  await page.goto('/aanbestedingen')
  await expect(page.getByRole('heading', { name: 'Tenders ophalen' })).toBeVisible()
  await expect(page.getByText(/publicaties in TenderNed/)).toBeVisible({ timeout: 15000 })
})

test('navigatie vanuit projectenoverzicht naar catalogus', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'TenderNed scannen' }).click()
  await expect(page).toHaveURL(/\/aanbestedingen/)
})

test('voorselectie op bedrijfs-CPV-codes: lijst uit TenderNed, sorteren en opslag', async ({ page }) => {
  // Bedrijfsprofiel met een CPV-code direct in de werkruimte-opslag zetten.
  await page.request.put('/api/state', {
    data: {
      set: {
        'bid-agent-company-config': JSON.stringify({
          name: 'Testbedrijf IT',
          profile: 'IT-dienstverlener',
          cpvCodes: [{ code: '72000000-5', omschrijving: 'IT-diensten' }],
          files: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      },
    },
  })

  await page.goto('/aanbestedingen')
  await expect(page.getByRole('heading', { name: 'Voorselectie voor Testbedrijf IT' })).toBeVisible()
  // Stap 1 (CPV-scan) draait automatisch en levert open tenders op.
  await expect(page.getByText(/Stap 1 klaar: \d+ open tender/)).toBeVisible({ timeout: 60000 })
  await expect(page.getByRole('combobox', { name: 'Sorteren op' })).toBeVisible()

  // Sorteren op publicatiedatum wijzigt de keuze en blijft bewaard.
  await page.getByRole('combobox', { name: 'Sorteren op' }).click()
  await page.getByRole('option', { name: 'Publicatiedatum (nieuw → oud)' }).click()
  await expect(page.getByRole('combobox', { name: 'Sorteren op' })).toContainText('Publicatiedatum')

  // De voorselectie staat in de database (de opslaglaag schrijft gebufferd
  // weg, dus even pollen): opnieuw laden toont de lijst direct, zonder scan.
  const readPreselection = async () => {
    const stored = await page.request.get('/api/state')
    const state = (await stored.json()) as { state: Record<string, string> }
    const raw = state.state['bid-agent-tender-preselection']
    return raw ? (JSON.parse(raw) as { items: unknown[]; cpvCodes: string[] }) : null
  }
  await expect.poll(async () => (await readPreselection())?.cpvCodes ?? null, { timeout: 10000 }).toEqual(['72000000-5'])
  expect((await readPreselection())?.items.length).toBeGreaterThan(0)

  await page.reload()
  await expect(page.getByText(/Voorselectie uit de database: \d+ open tender/)).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('combobox', { name: 'Sorteren op' })).toContainText('Publicatiedatum')
})
