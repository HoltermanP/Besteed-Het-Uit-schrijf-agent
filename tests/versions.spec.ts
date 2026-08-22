import { expect, test } from '@playwright/test'
import { createProject, resetWorkspace } from './helpers'

// Versiegeschiedenis per stuk: elke generatie en elke eigen bewerkingsronde is terug te
// vinden, twee versies zijn naast elkaar te leggen en een oudere versie is te herstellen.

const EIGEN_ZIN = 'Eigen aanvulling van de schrijver.'

// Statusregel waarmee de werkplek meldt dat het (lokaal opgebouwde) concept klaar is.
const GEREED = /Analyse en concept opgeslagen|Analyse, concept en Neon-sync gereed/

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page)
})

test('bewaart elke ronde, vergelijkt twee versies en herstelt een oudere versie', async ({ page }) => {
  await createProject(page, 'Versiebeheer')

  // 1. Generatie → eerste versie.
  await page.getByRole('button', { name: 'Start schrijfagent' }).first().click()
  await expect(page.getByText('Brons versie')).toBeVisible({ timeout: 15000 })
  await expect(page.getByText(GEREED)).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: /^Versies/ }).click()
  await expect(page.getByTestId('version-entry')).toHaveCount(1)
  await page.keyboard.press('Escape')

  // 2. Eigen bewerkingsronde → wordt bij het openen van de versies vastgelegd.
  const editor = page.locator('.document-editor')
  await editor.click()
  await page.keyboard.type(EIGEN_ZIN)
  await expect(editor).toContainText(EIGEN_ZIN)
  await page.getByRole('button', { name: /^Versies/ }).click()
  await expect(page.getByTestId('version-entry')).toHaveCount(2)
  await expect(page.getByTestId('version-history').getByText('Eigen bewerking').first()).toBeVisible()
  await page.keyboard.press('Escape')

  // 3. Opnieuw genereren gooit het handwerk niet weg: de bewerking blijft als versie staan.
  await page.getByRole('button', { name: 'Genereer' }).click()
  await expect(page.getByText(GEREED)).toBeVisible({ timeout: 15000 })
  await expect(editor).not.toContainText(EIGEN_ZIN)
  await page.getByRole('button', { name: /^Versies/ }).click()
  await expect(page.getByTestId('version-entry')).toHaveCount(3)

  // 4. Twee versies naast elkaar: de eigen bewerking tegen de huidige tekst.
  const bewerking = page.getByTestId('version-entry').filter({ hasText: 'Eigen bewerking' }).first()
  await bewerking.getByRole('button', { name: 'Vergelijk' }).click()
  await expect(page.getByTestId('diff-summary')).toBeVisible()
  await expect(page.getByTestId('version-history').getByText(EIGEN_ZIN).first()).toBeVisible()

  // 5. Oudere versie herstellen: de eigen zin staat terug in de editor.
  await page.getByRole('tab', { name: /Geschiedenis/ }).click()
  await bewerking.getByRole('button', { name: 'Herstel' }).click()
  await expect(page.getByText(/hersteld/i).first()).toBeVisible()
  await expect(editor).toContainText(EIGEN_ZIN)

  // 6. Ook het herstel is een versie; de tekst van vóór het herstel blijft bewaard.
  await page.getByRole('button', { name: /^Versies/ }).click()
  await expect(page.getByTestId('version-entry')).toHaveCount(4)
  await expect(page.getByTestId('version-history').getByText('Hersteld:').first()).toBeVisible()
})

test('bewaart de versies per project na herladen', async ({ page }) => {
  await createProject(page, 'Versies bewaren')
  await page.getByRole('button', { name: 'Start schrijfagent' }).first().click()
  await expect(page.getByText(GEREED)).toBeVisible({ timeout: 15000 })

  await page.reload()
  await page.getByRole('button', { name: /^Versies/ }).click()
  await expect(page.getByTestId('version-entry')).toHaveCount(1)
})
