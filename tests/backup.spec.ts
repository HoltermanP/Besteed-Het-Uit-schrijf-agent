import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { strFromU8, unzipSync } from 'fflate'
import { createProject, resetWorkspace } from './helpers'

// Back-up en prullenbak: een beheerder kan alles exporteren en een verwijderd project
// binnen dertig dagen terughalen. Eén foute klik mag geen tender kosten.

const ADMIN_PASSWORD = 'test-admin-wachtwoord'

async function loginAsAdmin(page: Page) {
  await page.goto('/admin')
  await page.getByPlaceholder('Admin wachtwoord').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Inloggen' }).click()
  await expect(page.getByText('TenderNed API')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page)
})

test('volledige export levert een zip met project, concept en machineleesbare back-up', async ({ page }) => {
  await createProject(page, 'Exportproject')
  await page.getByRole('link', { name: 'Alle projecten' }).click()
  await expect(page.getByRole('button', { name: 'Verwijder project Exportproject' })).toBeVisible()
  // Het project moet in de opslag staan vóór de server de back-up samenstelt.
  await page.waitForTimeout(1500)

  await loginAsAdmin(page)
  // Een geheim in de configuratie hoort niet in de back-up terecht te komen.
  await page.getByRole('switch', { name: 'Neon-sync actief' }).click()
  await page.getByTestId('neon-connection').fill('postgresql://geheim@neon.tech/bid')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByText('Instellingen opgeslagen in deze browser.')).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Back-up downloaden' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^back-up-besteed-het-uit-\d{4}-\d{2}-\d{2}\.zip$/)

  const zipPath = await download.path()
  const files = unzipSync(new Uint8Array(await readFile(zipPath)))
  const names = Object.keys(files)

  expect(names).toContain('back-up.json')
  expect(names).toContain('LEESMIJ.txt')

  const overview = names.find((name) => name.endsWith('/project.md'))
  expect(overview, 'projectoverzicht in de zip').toBeTruthy()
  expect(strFromU8(files[overview!])).toContain('Exportproject')

  const concept = names.find((name) => name.includes('/concepten/') && name.endsWith('.html'))
  expect(concept, 'concept als HTML in de zip').toBeTruthy()
  expect(strFromU8(files[concept!])).toContain('Exportproject')

  const bundle = strFromU8(files['back-up.json'])
  expect(bundle).toContain('Exportproject')
  expect(bundle).not.toContain('postgresql://geheim@neon.tech/bid')

  await expect(page.getByText(/\d+ project\(en\), \d+ concept\(en\)/)).toBeVisible()
})

test('verwijderd project blijft dertig dagen in de prullenbak en is terug te halen', async ({ page }) => {
  await createProject(page, 'Prullenbakproject')
  await page.getByRole('link', { name: 'Alle projecten' }).click()

  const kaart = page.getByRole('button', { name: 'Verwijder project Prullenbakproject' })
  await expect(kaart).toBeVisible()
  await kaart.click()
  await expect(page.getByTestId('confirm-dialog')).toContainText('prullenbak')
  await page.getByTestId('confirm-dialog-confirm').click()
  await expect(page.getByText('Nog geen projecten.')).toBeVisible()

  // Ook na een herlaad blijft het project weg — en staat het in de prullenbak.
  await page.waitForTimeout(1500)
  await loginAsAdmin(page)

  const entry = page.getByTestId('trash-entry').filter({ hasText: 'Prullenbakproject' })
  await expect(entry).toBeVisible()
  await expect(entry).toContainText('nog 30 dag(en)')

  await entry.getByRole('button', { name: 'Terugzetten' }).click()
  await expect(page.getByText('De prullenbak is leeg.')).toBeVisible()

  await page.waitForTimeout(1500)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Verwijder project Prullenbakproject' })).toBeVisible()
})

test('een project in de prullenbak kan definitief weg', async ({ page }) => {
  await createProject(page, 'Wegwerpproject')
  await page.getByRole('link', { name: 'Alle projecten' }).click()
  await page.getByRole('button', { name: 'Verwijder project Wegwerpproject' }).click()
  await page.getByTestId('confirm-dialog-confirm').click()
  await expect(page.getByText('Nog geen projecten.')).toBeVisible()

  await page.waitForTimeout(1500)
  await loginAsAdmin(page)

  const entry = page.getByTestId('trash-entry').filter({ hasText: 'Wegwerpproject' })
  await entry.getByRole('button', { name: 'Definitief' }).click()
  await expect(page.getByTestId('confirm-dialog')).toContainText('niet meer terug te halen')
  await page.getByTestId('confirm-dialog-confirm').click()

  await expect(page.getByText('De prullenbak is leeg.')).toBeVisible()
  await page.waitForTimeout(1500)
  await page.reload()
  await expect(page.getByText('De prullenbak is leeg.')).toBeVisible()
})
