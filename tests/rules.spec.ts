import { expect, test } from '@playwright/test'
import { resetWorkspace } from './helpers'

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page)
})

test('schrijfkaderpagina laadt en toont sectie met editor', async ({ page }) => {
  await page.goto('/schrijfregels')
  await expect(
    page.getByRole('heading', { name: 'Schrijfregels, schrijfwijze & kwaliteit' }),
  ).toBeVisible()

  const section = page.getByTestId('kader-section-richtlijnen')
  await expect(section.getByRole('heading', { name: 'Schrijfregels' })).toBeVisible()
  await expect(section.getByText('Regel schrijven')).toBeVisible()
  await expect(section.getByText('Bron uploaden & AI')).toBeVisible()
})

test('navigatie vanuit werkplek naar schrijfkader', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('navigation').getByRole('link', { name: 'Schrijfkader' }).click()
  await expect(page).toHaveURL(/\/schrijfregels/)
})

test('schrijfregel aanmaken en opslaan', async ({ page }, testInfo) => {
  // Unieke naam: beide browserprojecten delen één dev-server (in-memory store).
  // Zonder uniek label matcht de assertie meerdere identieke items (strict-mode).
  const ruleName = `Verboden woorden ${testInfo.project.name}-${Date.now()}`
  await page.goto('/schrijfregels')
  const section = page.getByTestId('kader-section-richtlijnen')

  await section.getByPlaceholder('Bijv. Verboden formuleringen').fill(ruleName)
  await section
    .getByLabel('Inhoud')
    .fill('Gebruik geen superlatieven zonder bewijs.')
  await section.getByRole('button', { name: 'Regel opslaan' }).click()

  await expect(section.getByText('Regel opgeslagen.')).toBeVisible()
  await expect(section.getByRole('listitem').filter({ hasText: ruleName })).toBeVisible()
})

test('regeldocument uploaden', async ({ page }, testInfo) => {
  const fileName = `kwaliteitsstandaard-${testInfo.project.name}-${Date.now()}.txt`
  await page.goto('/schrijfregels')
  const section = page.getByTestId('kader-section-richtlijnen')

  await section.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: 'text/plain',
    buffer: Buffer.from('Elke uitspraak moet toetsbaar zijn aan een bewijsstuk.'),
  })

  await expect(
    section.getByRole('listitem').filter({ hasText: fileName }),
  ).toBeVisible()
})

test('kopje klikken toont de uitwerking van de sectie', async ({ page }) => {
  await page.goto('/schrijfregels')
  const section = page.getByTestId('kader-section-schrijfstijl')

  // Ingeklapt: de uitwerking is niet zichtbaar.
  await expect(page.getByTestId('kader-uitwerking-schrijfstijl')).toHaveCount(0)

  await section.getByRole('heading', { name: 'Schrijfwijze' }).click()

  const uitwerking = page.getByTestId('kader-uitwerking-schrijfstijl')
  await expect(uitwerking).toBeVisible()
  await expect(uitwerking.getByText('Uitwerking — zo schrijft de agent')).toBeVisible()
  await expect(uitwerking.getByText('Basis (ingebouwd)')).toBeVisible()
  await expect(uitwerking.getByText(/Actieve zinnen met een duidelijke actor/)).toBeVisible()
  await expect(uitwerking.getByLabel('Handmatige aanpassingen')).toBeVisible()

  // Nogmaals klikken klapt de uitwerking weer in.
  await section.getByRole('heading', { name: 'Schrijfwijze' }).click()
  await expect(page.getByTestId('kader-uitwerking-schrijfstijl')).toHaveCount(0)
})

test('handmatige aanpassingen opslaan en terugzien na herladen', async ({ page }, testInfo) => {
  const instructie = `Schrijf in de u-vorm (${testInfo.project.name})`
  await page.goto('/schrijfregels')
  const section = page.getByTestId('kader-section-richtlijnen')

  await section.getByRole('heading', { name: 'Schrijfregels' }).click()
  const uitwerking = page.getByTestId('kader-uitwerking-richtlijnen')
  await uitwerking.getByLabel('Handmatige aanpassingen').fill(instructie)
  await uitwerking.getByRole('button', { name: 'Aanpassingen opslaan' }).click()
  await expect(uitwerking.getByText('Aanpassingen opgeslagen.')).toBeVisible()
  await expect(section.getByText('eigen aanpassingen actief')).toBeVisible()

  await page.reload()
  await page.getByTestId('kader-section-richtlijnen').getByRole('heading', { name: 'Schrijfregels' }).click()
  await expect(
    page.getByTestId('kader-uitwerking-richtlijnen').getByLabel('Handmatige aanpassingen'),
  ).toHaveValue(instructie)
})

test('voorbeeld toont letterlijk wat de schrijfagent ontvangt, inclusief aanpassingen', async ({ page }) => {
  await page.goto('/schrijfregels')

  const algemeen = page.getByTestId('kader-algemeen')
  await algemeen.getByLabel('Algemene aanpassingen').fill("Vermijd het woord 'partner'.")
  await algemeen.getByRole('button', { name: 'Aanpassingen opslaan' }).click()
  await expect(algemeen.getByText('Aanpassingen opgeslagen.')).toBeVisible()

  await page.getByRole('button', { name: 'Wat de schrijfagent ontvangt' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Schrijfkader — Algemene aanpassingen')).toBeVisible()
  await expect(dialog.getByText(/SCHRIJFKADER · ALGEMENE AANPASSINGEN/)).toBeVisible()
  await expect(dialog.getByText(/Vermijd het woord 'partner'\./)).toBeVisible()
  await expect(dialog.getByText('Schrijfkader — Schrijfregels')).toBeVisible()
  await expect(dialog.getByText(/SCHRIJFKADER · SCHRIJFREGELS/)).toBeVisible()
  await expect(dialog.getByText('Schrijfkader — Schrijfwijze')).toBeVisible()
  await expect(dialog.getByText('Schrijfkader — Kwaliteit')).toBeVisible()
})
