import { expect, test } from '@playwright/test'
import { createProject, resetWorkspace } from './helpers'

// Terugkoppeling en bevestigingen: fouten komen als melding in beeld, verwijderen vraagt
// eerst om bevestiging en is daarna nog terug te draaien, en de systeemstatus staat los
// van de laatste actie.

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page)
})

test('project verwijderen vraagt om bevestiging en is terug te draaien', async ({ page }) => {
  // Native browserdialogen mogen niet meer voorkomen; die zouden de test blokkeren.
  let nativeDialogs = 0
  page.on('dialog', (dialog) => {
    // De waarschuwing bij openstaand werk hoort er wél te zijn; die telt niet mee.
    if (dialog.type() === 'beforeunload') {
      void dialog.accept()
      return
    }
    nativeDialogs += 1
    void dialog.dismiss()
  })

  await createProject(page, 'Project om te verwijderen')
  await page.getByRole('link', { name: 'Alle projecten' }).click()
  // De verwijderknop van de kaart is de marker dat het project in de lijst staat; de
  // melding bevat dezelfde projectnaam en zou een tekstzoekopdracht dubbel raken.
  const kaart = page.getByRole('button', { name: 'Verwijder project Project om te verwijderen' })
  await expect(kaart).toBeVisible()

  // Annuleren laat het project staan.
  await kaart.click()
  const confirm = page.getByTestId('confirm-dialog')
  await expect(confirm).toBeVisible()
  await expect(confirm).toContainText('bron(nen)')
  await confirm.getByRole('button', { name: 'Annuleren' }).click()
  await expect(kaart).toBeVisible()

  // Bevestigen verwijdert het project; de melding zet het weer terug.
  await kaart.click()
  await page.getByTestId('confirm-dialog-confirm').click()
  await expect(page.getByText('Nog geen projecten.')).toBeVisible()

  await page.getByRole('button', { name: 'Ongedaan maken' }).click()
  await expect(kaart).toBeVisible()
  // Het terugzetten moet ook de opslag hebben bereikt (gebufferde schrijfactie).
  await page.waitForTimeout(1500)
  await page.reload()
  await expect(kaart).toBeVisible()

  expect(nativeDialogs).toBe(0)
})

test('project hernoemen gebeurt in de app, niet via een browserpop-up', async ({ page }) => {
  let nativeDialogs = 0
  page.on('dialog', (dialog) => {
    // De waarschuwing bij openstaand werk hoort er wél te zijn; die telt niet mee.
    if (dialog.type() === 'beforeunload') {
      void dialog.accept()
      return
    }
    nativeDialogs += 1
    void dialog.dismiss()
  })

  await createProject(page, 'Oude naam')
  await page.getByRole('link', { name: 'Alle projecten' }).click()
  await page.getByRole('button', { name: 'Hernoem project Oude naam' }).click()
  await page.getByLabel('Projectnaam').fill('Nieuwe naam')
  await page.getByRole('button', { name: 'Naam opslaan' }).click()
  await expect(page.getByRole('button', { name: 'Verwijder project Nieuwe naam' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Verwijder project Oude naam' })).toHaveCount(0)
  expect(nativeDialogs).toBe(0)
})

test('geschreven stuk verwijderen vraagt om bevestiging met omvang en is terug te draaien', async ({ page }) => {
  await createProject(page)
  await page.getByRole('button', { name: 'Start schrijfagent' }).first().click()
  await expect(page.getByText('Brons versie')).toBeVisible({ timeout: 15000 })

  // Een tweede (nog leeg) stuk toevoegen, want verwijderen kan pas vanaf twee stukken.
  await page.getByRole('button', { name: 'Eigen stuk' }).click()
  await page.getByLabel('Titel van het stuk').fill('Extra stuk')
  await page.getByRole('button', { name: 'Toevoegen' }).click()
  await expect(page.getByRole('button', { name: 'Verwijder stuk Extra stuk' })).toBeVisible()

  // Het geschreven stuk is het andere; die vraagt om bevestiging.
  const labels = await page.getByRole('button', { name: /^Verwijder stuk / }).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('aria-label') ?? ''),
  )
  const geschreven = labels.find((label) => label !== 'Verwijder stuk Extra stuk')
  expect(geschreven).toBeTruthy()
  const stukTitel = geschreven!.replace('Verwijder stuk ', '')

  await page.getByRole('button', { name: geschreven! }).click()
  const confirm = page.getByTestId('confirm-dialog')
  await expect(confirm).toBeVisible()
  await expect(confirm).toContainText('geschreven woorden')
  await page.getByTestId('confirm-dialog-confirm').click()
  await expect(page.getByTestId('sync-status')).toContainText(`Stuk verwijderd: ${stukTitel}`)

  await page.getByRole('button', { name: 'Ongedaan maken' }).click()
  await expect(page.getByTestId('sync-status')).toContainText(`Stuk teruggezet: ${stukTitel}`)
  await expect(page.getByRole('button', { name: geschreven! })).toBeVisible()
})

test('systeemstatus staat los van de laatste actie en linkt naar de instelling', async ({ page }) => {
  await createProject(page)
  const status = page.getByTestId('system-status')
  // Zonder API-sleutels in de tests staat de schrijfagent niet actief.
  await expect(status.getByRole('link', { name: /Schrijfagent/ })).toHaveAttribute('data-active', 'false')
  await expect(status.getByRole('link', { name: /Schrijfkader/ })).toHaveAttribute('href', '/schrijfregels')
  await expect(page.getByTestId('sync-status')).toBeVisible()
})

test('een mislukte TenderNed-import komt als melding in beeld met opnieuw proberen', async ({ page }) => {
  await page.route('**/api/tenderned/**', (route) => route.fulfill({ status: 500, body: 'fout' }))
  await createProject(page)
  await page.getByRole('button', { name: /Van TenderNed/ }).click()
  await page.getByText('Tender ophalen op publicatie-ID of kenmerk').click()
  await page.getByPlaceholder('publicatie-ID of TN-kenmerk').fill('123456')
  await page
    .getByRole('button', { name: 'Haal de aanbesteding met alle documenten op en koppel die aan dit project' })
    .click()
  await expect(page.getByText(/Ophalen bij TenderNed mislukt/).last()).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole('button', { name: 'Opnieuw proberen' })).toBeVisible()
})
