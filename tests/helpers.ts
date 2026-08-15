import { expect, type Page } from '@playwright/test'

// Reset de werkruimte: leeg de database-opslag (in de tests een in-memory store via
// STATE_MEMORY=1) en start met een schone pagina. Vervangt het oude localStorage.clear().
export async function resetWorkspace(page: Page) {
  await page.request.delete('/api/state')
  await page.goto('/')
  await page.evaluate(() => {
    sessionStorage.clear()
  })
}

/** Maak via het projectenoverzicht een nieuw project aan en wacht tot de projectomgeving open is. */
export async function createProject(page: Page, title = 'Testproject') {
  await page.getByRole('button', { name: 'Nieuw project' }).click()
  await page.getByLabel('Projectnaam').fill(title)
  await page.getByRole('button', { name: 'Project aanmaken en openen' }).click()
  await page.waitForURL(/\/projecten\//)
  await expect(page.getByRole('heading', { name: title, level: 1 }).first()).toBeVisible()
}

/** Voeg in de projectomgeving handmatig een tekstbron toe (standaard als aanbestedingsbron). */
export async function addManualSource(page: Page, name: string, content: string) {
  await page.getByPlaceholder('Naam bron').fill(name)
  await page.getByPlaceholder('Plak broninformatie, rules of training...').fill(content)
  await page.getByRole('button', { name: 'Toevoegen' }).click()
  await expect(page.getByText(`"${name}" toegevoegd`)).toBeVisible()
}

/** Voorbeeldleidraad met limieten, bijlagen en beoordelingscriteria voor de analysetests. */
export const LEIDRAAD_TEKST =
  'Aanbestedingsleidraad dienstverlening. Inschrijvers dienen een plan van aanpak in van maximaal 3500 woorden en maximaal 15 pagina\'s. Verplichte bijlagen: referentielijst, teamoverzicht met CV\'s, invullingsblad EMVI. Beoordeling kwaliteit 70%, prijs 30%. Subcriteria kwaliteit: plan van aanpak (30%), team en competenties (25%), continuiteit (15%), duurzaamheid (15%), implementatie (15%). Schrijf formeel en toetsbaar; vermijd promotionele taal. De opdrachtgever beoordeelt objectief op aansluiting, onderbouwing en uitvoerbaarheid.'

export const PVE_TEKST =
  'De opdrachtgever zoekt een betrouwbare partner die aantoonbaar kwaliteit levert, risico’s actief beheerst, duurzaam werkt en binnen vier weken na gunning kan starten. Beoordeling: kwaliteit 70%, prijs 30%. Subcriteria: plan van aanpak, team, continuiteit, duurzaamheid en implementatie.'
