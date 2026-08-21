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
  // De analyse benoemt welke stukken de inschrijver zelf moet schrijven, met de limiet per stuk.
  await expect(page.getByRole('heading', { name: 'Op te stellen documenten' })).toBeVisible()
  await expect(page.getByText(/Daarnaast aan te leveren/)).toBeVisible()
})

test('toont per stuk een eigen concept en schrijft het gekozen stuk', async ({ page }) => {
  await page.getByRole('button', { name: 'Leidraadanalyse' }).click()
  await page.getByRole('button', { name: 'Analyseer dossier' }).click()
  await expect(page.getByRole('heading', { name: 'Op te stellen documenten' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Het herkende schrijfstuk staat als kaart in de middenkolom en is het actieve stuk.
  const panel = page.getByRole('region', { name: 'Stukken van deze inschrijving' })
  await expect(panel.getByRole('button', { name: /^Plan van aanpak/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Opdracht voor dit stuk' })).toBeVisible()

  // Een eigen stuk toevoegen geeft een tweede, nog niet gestart concept.
  await panel.getByRole('button', { name: 'Eigen stuk' }).click()
  await page.getByLabel('Titel van het stuk').fill('Implementatieplan')
  await page.getByRole('button', { name: 'Toevoegen' }).last().click()
  await expect(panel.getByRole('button', { name: /^Implementatieplan/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Implementatieplan', level: 1 })).toBeVisible()

  // Het actieve stuk schrijven; het andere stuk blijft ongeschreven.
  await page.getByRole('button', { name: 'Start schrijfagent' }).first().click()
  await expect(page.getByText('Implementatieplan · Brons versie')).toBeVisible({ timeout: 15000 })
  await panel.getByRole('button', { name: /^Plan van aanpak/ }).click()
  await expect(page.getByText('Nog geen concept geschreven')).toBeVisible()
})

test('toont het eisenregister en laat een eis afvinken', async ({ page }) => {
  await page.getByRole('button', { name: 'Leidraadanalyse' }).click()
  await page.getByRole('button', { name: 'Analyseer dossier' }).click()
  await expect(page.getByRole('dialog', { name: 'Leidraadanalyse' }).getByText(/\d+ eisen in het register/)).toBeVisible()
  await page.keyboard.press('Escape')

  // De rechterkolom toont de voortgang op de eisen en de open punten met vraag aan het bidteam.
  const card = page.getByRole('region', { name: 'Eisen aan de inschrijving' })
  await expect(card).toBeVisible()
  const progress = card.getByTestId('requirements-progress')
  const before = (await progress.textContent()) ?? ''
  expect(before).toMatch(/^\d+\/\d+ afgedekt$/)

  // Het volledige register groepeert per categorie; de referentielijst uit de leidraad is een in te dienen stuk.
  await card.getByRole('button', { name: /^Alle eisen/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Eisenregister' })
  await expect(dialog.getByRole('heading', { name: /In te dienen stukken/ })).toBeVisible()
  // Filter "Alle", zodat de rij na het afvinken zichtbaar blijft (standaard staat het filter op "Open").
  await dialog.getByRole('button', { name: /^Alle \(/ }).click()
  const row = dialog.getByTestId('requirement-row').filter({ hasText: /referentielijst/i }).first()
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: /^Markeer voldaan/ }).click()
  await expect(row).toHaveAttribute('data-status', 'voldaan')
  await page.keyboard.press('Escape')

  // Afvinken telt mee in de voortgang en blijft bewaard na herladen.
  await expect(progress).not.toHaveText(before)
  const after = (await progress.textContent()) ?? ''
  // De werkruimte-opslag schrijft gebundeld weg (zie storage.ts); geef de flush de tijd.
  await page.waitForTimeout(1500)
  await page.reload()
  await expect(page.getByRole('region', { name: 'Eisen aan de inschrijving' }).getByTestId('requirements-progress')).toHaveText(after)
})

test('verbeterronde: review vraagt informatie op en verwerkt antwoorden naar zilver', async ({ page }) => {
  await page.getByRole('button', { name: 'Leidraadanalyse' }).click()
  await page.getByRole('button', { name: 'Analyseer dossier' }).click()
  await expect(page.getByRole('heading', { name: 'Op te stellen documenten' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Start schrijfagent' }).first().click()
  await expect(page.getByText('Brons versie')).toBeVisible({ timeout: 15000 })

  // De AI-review levert (ook zonder AI) gerichte informatievragen voor open eisen van het bidteam.
  await page.getByRole('button', { name: 'AI-review', exact: true }).click()
  await page.getByRole('button', { name: 'Review uitvoeren', exact: true }).click()
  await expect(page.getByTestId('review-finding').first()).toBeVisible({ timeout: 15000 })
  await page.keyboard.press('Escape')

  const panel = page.getByRole('region', { name: 'Verbeterronde' })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading', { name: /Verbeterronde naar Zilver/ })).toBeVisible()
  const request = panel.getByTestId('info-request').first()
  await expect(request).toBeVisible()
  // Zonder antwoord of goedgekeurd voorstel valt er niets te verwerken.
  await expect(panel.getByRole('button', { name: 'Verwerk naar Zilver' })).toBeDisabled()

  await request.getByRole('textbox').fill('Referentielijst met drie opdrachten uit 2024–2025 is beschikbaar (bijlage A).')
  await request.getByRole('textbox').blur()
  await expect(panel.getByText(/1 beantwoord/)).toBeVisible()

  // Verwerken naar zilver neemt alleen het gegeven antwoord mee; de stap verschuift naar Zilver.
  await page.getByRole('button', { name: 'Verwerk naar Zilver' }).click()
  await expect(page.getByText('Verbeterronde verwerkt')).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: /Zilver/ }).first()).toHaveAttribute('aria-pressed', 'true')
})

test('genereert concept met leidraadanalyse-sectie', async ({ page }) => {
  await page.getByRole('button', { name: 'Start schrijfagent' }).first().click()
  await expect(page.getByText('0. Leidraadanalyse en schrijfstijl')).toBeVisible()
  await expect(page.getByText('Gevraagde inhoud en onderwerpen')).toBeVisible()
  await expect(page.getByText('Vraag achter de vraag (intern — niet indienen)')).toBeVisible()

  // Statistiekkaart "Leidraad" toont "Ja" zodra de analyse de leidraad heeft gevonden.
  await expect(page.getByText('Ja', { exact: true })).toBeVisible()
})
