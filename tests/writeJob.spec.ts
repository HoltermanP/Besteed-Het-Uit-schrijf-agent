import { expect, test, type Page } from '@playwright/test'
import { createProject, resetWorkspace } from './helpers'

// Het schrijven van een stuk draait als opdracht op de server, niet in de browserverbinding.
// Deze tests bewaken de belofte daarvan: de opdracht blijft bij het stuk bewaard, wordt na
// het herladen van de pagina (of het sluiten van het tabblad) weer opgepakt en het resultaat
// komt alsnog in het concept terecht.

const RUNNING_HTML =
  '<article class="proposal-doc"><header class="doc-header"><h1>Plan van aanpak</h1></header>' +
  '<section class="doc-section"><h2>1. Begrip van de opdracht</h2><p class="generation-placeholder">Sectie wordt geschreven…</p></section></article>'

const FINISHED_HTML =
  '<article class="proposal-doc"><header class="doc-header"><p class="kicker">Plan van aanpak · Brons versie</p><h1>Plan van aanpak</h1></header>' +
  '<section class="doc-section"><h2>1. Begrip van de opdracht</h2><p>Dit stuk is op de server afgeschreven.</p></section></article>'

type JobState = { done: boolean }

/**
 * Doe alsof de server een schrijfopdracht uitvoert: POST start hem, GET geeft de voortgang.
 * De test bepaalt met `state.done` wanneer het stuk klaar is.
 */
async function mockWriteJob(page: Page, state: JobState) {
  await page.route('**/api/write-draft/job**', async (route) => {
    const method = route.request().method()
    const base = {
      id: 'opdracht-test',
      projectId: 'test',
      draftId: 'inschrijving',
      draftTitle: 'Plan van aanpak',
      stage: 'brons',
      kind: 'schrijven',
      error: null,
      provider: 'anthropic',
      model: 'claude-test',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      finishedAt: null,
    }

    if (method === 'POST') {
      await route.fulfill({
        json: { ...base, status: 'lopend', message: 'De schrijfagent is gestart…', version: 1, partialHtml: null, html: null },
      })
      return
    }

    const since = Number(new URL(route.request().url()).searchParams.get('since') ?? '0')
    if (state.done) {
      await route.fulfill({
        json: {
          ...base,
          status: 'gereed',
          message: 'Stuk geschreven met anthropic (claude-test).',
          version: 9,
          partialHtml: since < 9 ? FINISHED_HTML : null,
          html: FINISHED_HTML,
          finishedAt: new Date().toISOString(),
        },
      })
      return
    }

    await route.fulfill({
      json: {
        ...base,
        status: 'lopend',
        message: 'Secties schrijven (1/4 gereed)…',
        version: 2,
        // Net als de server: ongewijzigde tekst niet opnieuw versturen.
        partialHtml: since < 2 ? RUNNING_HTML : null,
        html: null,
      },
    })
  })
}

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page)
})

test('lopende schrijfopdracht overleeft het herladen en levert het stuk alsnog af', async ({ page }) => {
  const state: JobState = { done: false }
  await mockWriteJob(page, state)
  await createProject(page, 'Doorlopende generatie')

  await page.getByRole('button', { name: 'Start schrijfagent' }).first().click()

  // Het stuk staat als "schrijft" in de stukkenlijst en de werkplek meldt dat het tabblad dicht mag.
  await expect(page.getByTestId('draft-job-badge')).toBeVisible({ timeout: 15000 })
  await expect(page.getByText(/je kunt dit tabblad sluiten/i)).toBeVisible()

  // Wacht tot de verwijzing naar de opdracht écht in de database staat; dat is na het
  // sluiten van het tabblad de enige weg terug naar het lopende werk.
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'saved', { timeout: 15000 })

  // Tabblad dicht en weer open: de opdracht loopt door en wordt opnieuw opgepakt.
  await page.reload()
  await expect(page.getByTestId('draft-job-badge')).toBeVisible({ timeout: 15000 })

  // De opdracht rondt af terwijl de gebruiker toekijkt.
  state.done = true
  await expect(page.getByText('Dit stuk is op de server afgeschreven.')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('draft-job-badge')).toHaveCount(0)
  await expect(page.getByText(/gereed met anthropic \(claude-test\)/)).toBeVisible()
})

test('opdracht zonder AI-configuratie wordt meteen geweigerd en niet aangemaakt', async ({ page }) => {
  // In de tests staat geen sleutel in de serveromgeving; de werkplek moet dat direct
  // terugkrijgen (en op een lokaal concept terugvallen) in plaats van te gaan wachten.
  const response = await page.request.post('/api/write-draft/job', {
    data: {
      stage: 'brons',
      project: { title: 'Testproject', tendernedId: '', buyer: 'Gemeente', deadline: '' },
      documents: [],
      comments: [],
      analysis: null,
    },
  })
  expect(response.status()).toBe(400)
  expect(((await response.json()) as { error: string }).error).toMatch(/geen ai-configuratie/i)
})

test('status van een onbekende opdracht geeft 404', async ({ page }) => {
  const response = await page.request.get('/api/write-draft/job?id=bestaat-niet')
  expect(response.status()).toBe(404)
})

test('de opdracht draait door na het antwoord en legt haar afloop vast', async ({ page }) => {
  // Zonder AI-sleutel in de omgeving, maar mét (onbereikbare) schrijfagent-configuratie:
  // de opdracht wordt aangemaakt, draait ná het antwoord verder op de server en legt haar
  // afloop vast. Dat de status ná het antwoord verandert, bewijst dat het werk niet aan
  // deze HTTP-verbinding hangt.
  const started = await page.request.post('/api/write-draft/job', {
    data: {
      stage: 'brons',
      project: { title: 'Testproject', tendernedId: '', buyer: 'Gemeente', deadline: '' },
      documents: [],
      comments: [],
      analysis: null,
      projectId: 'test',
      draftId: 'inschrijving',
      draftTitle: 'Plan van aanpak',
      // Bestaat niet: de opdracht loopt vast op de AI-aanroep, niet op de configuratie.
      ai: { provider: 'openai', baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'test-sleutel', model: 'test' },
    },
  })
  expect(started.ok()).toBeTruthy()
  const job = (await started.json()) as { id: string; status: string }
  expect(job.status).toBe('lopend')

  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/write-draft/job?id=${job.id}`)
        return ((await response.json()) as { status: string }).status
      },
      { timeout: 30_000, intervals: [500] },
    )
    .toBe('mislukt')
})
