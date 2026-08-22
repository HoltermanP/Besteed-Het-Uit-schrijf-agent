import { createServer, type Server } from 'node:http'
import { expect, test } from '@playwright/test'
import { resetWorkspace } from './helpers'

/*
 * Verbruiksadministratie: wat de AI kost, per project en per stuk.
 *
 * Deze tests draaien de échte serverkant. Er wordt een nep-Anthropic gestart die
 * vastgelegde tokentellingen teruggeeft; de app roept die aan via de baseUrl in de
 * API-configuratie van het verzoek. Zo wordt de hele keten getoetst: aanroep → tokens →
 * kosten → optelling per project en stuk. Dat is precies waar het misgaat als je alleen
 * de UI zou mocken — de kostenberekening (met de cache-tarieven) zit server-side.
 */

const ADMIN_PASSWORD = 'test-admin-wachtwoord'
const COMPANY = 'test-verbruik'
const PROJECT = 'prj-verbruik'

/** Vastgelegde tellingen, zodat de verwachte bedragen exact uitrekenbaar zijn. */
const USAGE_PLAIN = { input_tokens: 1_000, output_tokens: 500 }
const USAGE_CACHED = {
  input_tokens: 1_000,
  output_tokens: 500,
  cache_creation_input_tokens: 2_000,
  cache_read_input_tokens: 4_000,
}

/*
 * Beide aanroepen draaien op claude-sonnet-4-6 (de 'analysis'-tier): $3 per miljoen invoer,
 * $15 per miljoen uitvoer.
 *
 * cpv-voorstel (zonder caching):
 *   1.000 × $3 + 500 × $15 = $0,0105                                   → 10.500 micro-dollar
 * ai-review (caching aan met 1h-TTL: schrijven 2×, lezen 0,1× invoer):
 *   (1.000 + 2.000×2 + 4.000×0,1) × $3 + 500 × $15 = $0,0237           → 23.700 micro-dollar
 *   diezelfde aanroep zonder caching:
 *   (1.000 + 2.000 + 4.000) × $3 + 500 × $15 = $0,0285                 → 28.500 micro-dollar
 */
const COST_PLAIN = 10_500
const COST_CACHED = 23_700
const COST_CACHED_WITHOUT_CACHE = 28_500

type Recorded = { path: string; body: unknown }

/** Nep-Anthropic op een vrije poort; geeft geldige JSON terug met de gewenste tellingen. */
async function startFakeAnthropic(): Promise<{
  baseUrl: string
  calls: Recorded[]
  close: () => Promise<void>
}> {
  const calls: Recorded[] = []
  let usage: Record<string, number> = USAGE_PLAIN

  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      let body: unknown = raw
      try {
        body = JSON.parse(raw)
      } catch {
        // rauwe tekst bewaren
      }
      calls.push({ path: request.url ?? '', body })

      // De aanroep met cache-markers is de review; die krijgt de cachetellingen terug.
      const marked = raw.includes('cache_control')
      usage = marked ? USAGE_CACHED : USAGE_PLAIN

      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          content: [{ type: 'text', text: JSON.stringify({ suggestions: [], notes: 'test', findings: [] }) }],
          usage,
        }),
      )
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Geen poort voor de nep-Anthropic.')

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

/**
 * Een reviewverzoek zoals de werkplek het stuurt. De route valt terug op de heuristische
 * baseline (zonder AI) als het dossier onvolledig is, dus de lege lijsten moeten er echt in.
 */
function reviewBody(ai: unknown, draft: string) {
  return {
    ai,
    stage: 'brons',
    project: { title: 'Zorgvervoer Regio Noord', buyer: 'Gemeente', tendernedId: '', deadline: '' },
    draft,
    documents: [],
    comments: [],
    analysis: null,
    baseline: [],
  }
}

function scopeHeaders(draftId: string, draftTitle: string) {
  return {
    'Content-Type': 'application/json',
    'x-bedrijf-id': COMPANY,
    'x-project-id': PROJECT,
    'x-project-titel': encodeURIComponent('Zorgvervoer Regio Noord'),
    'x-stuk-id': draftId,
    'x-stuk-titel': encodeURIComponent(draftTitle),
  }
}

test('verbruik wordt per project en per stuk vastgelegd, met de juiste kosten', async ({ page }) => {
  await resetWorkspace(page)
  const fake = await startFakeAnthropic()
  const ai = { provider: 'anthropic', baseUrl: fake.baseUrl, apiKey: 'test-sleutel', model: 'claude-sonnet-4-6' }

  try {
    // Stuk 1: een analysetaak zonder prompt caching.
    const suggest = await page.request.post('/api/cpv-suggest', {
      headers: scopeHeaders('stuk-pva', 'Plan van aanpak'),
      data: { ai, company: { profile: 'Wij verzorgen doelgroepenvervoer voor gemeenten.' } },
    })
    expect(suggest.ok()).toBeTruthy()

    // Stuk 2: de AI-review, die wél om caching vraagt.
    const review = await page.request.post('/api/review-draft', {
      headers: scopeHeaders('stuk-kwaliteit', 'Kwaliteitsplan'),
      data: reviewBody(ai, '<p>Een concept om te reviewen.</p>'),
    })
    expect(review.ok()).toBeTruthy()

    // De nep-Anthropic is echt aangeroepen — anders zegt de rest van deze test niets.
    expect(fake.calls.length).toBe(2)
    expect(fake.calls.every((call) => call.path.endsWith('/v1/messages'))).toBeTruthy()

    const report = await (await page.request.get(`/api/verbruik?companyId=${COMPANY}`)).json()

    expect(report.totals.calls).toBe(2)
    expect(report.totals.costUsdMicros).toBe(COST_PLAIN + COST_CACHED)
    expect(report.totals.costWithoutCacheUsdMicros).toBe(COST_PLAIN + COST_CACHED_WITHOUT_CACHE)
    expect(report.totals.unpricedCalls).toBe(0)

    // Per project, met de titel uit de kopregels (dus niet het kale id).
    expect(report.projects).toHaveLength(1)
    const project = report.projects[0]
    expect(project.projectId).toBe(PROJECT)
    expect(project.projectTitle).toBe('Zorgvervoer Regio Noord')

    // Per stuk: elk stuk draagt zijn eigen kosten.
    const drafts = Object.fromEntries(project.drafts.map((draft: { draftId: string }) => [draft.draftId, draft]))
    expect(drafts['stuk-pva'].draftTitle).toBe('Plan van aanpak')
    expect(drafts['stuk-pva'].costUsdMicros).toBe(COST_PLAIN)
    expect(drafts['stuk-kwaliteit'].draftTitle).toBe('Kwaliteitsplan')
    expect(drafts['stuk-kwaliteit'].costUsdMicros).toBe(COST_CACHED)

    // Per taak, zodat zichtbaar is waar in het proces het geld zit.
    const tasks = Object.fromEntries(report.tasks.map((task: { task: string }) => [task.task, task]))
    expect(tasks['cpv-voorstel'].model).toBe('claude-sonnet-4-6')
    expect(tasks['ai-review'].costUsdMicros).toBe(COST_CACHED)

    // Werkt caching? Alleen de review vroeg erom, en die las daadwerkelijk uit de cache.
    expect(report.totals.cacheRequestedCalls).toBe(1)
    expect(report.totals.cacheHitCalls).toBe(1)
    expect(report.totals.cacheReadTokens).toBe(4_000)
    expect(tasks['cpv-voorstel'].cacheRequestedCalls).toBe(0)
  } finally {
    await fake.close()
  }
})

test('het maandplafond waarschuwt zodra het bedrag eroverheen gaat, maar blokkeert niet', async ({ page }) => {
  await resetWorkspace(page)
  const fake = await startFakeAnthropic()
  const ai = { provider: 'anthropic', baseUrl: fake.baseUrl, apiKey: 'test-sleutel', model: 'claude-sonnet-4-6' }

  try {
    const budget = await page.request.put('/api/verbruik', {
      data: { companyId: COMPANY, monthlyCapEur: 0.01, usdToEur: 0.92 },
    })
    expect(budget.ok()).toBeTruthy()

    const before = await (await page.request.get(`/api/verbruik?companyId=${COMPANY}&action=status`)).json()
    expect(before.monthlyCapEur).toBe(0.01)

    // Eén aanroep van $0,0105 ≈ € 0,0097 blijft nog net onder het plafond van € 0,01…
    await page.request.post('/api/cpv-suggest', {
      headers: scopeHeaders('stuk-pva', 'Plan van aanpak'),
      data: { ai, company: { profile: 'Doelgroepenvervoer voor gemeenten.' } },
    })
    const near = await (await page.request.get(`/api/verbruik?companyId=${COMPANY}&action=status`)).json()
    expect(near.exceeded).toBe(false)
    expect(near.warning).toBe(true)

    // …de tweede duwt het eroverheen.
    const overspend = await page.request.post('/api/cpv-suggest', {
      headers: scopeHeaders('stuk-pva', 'Plan van aanpak'),
      data: { ai, company: { profile: 'Doelgroepenvervoer voor gemeenten.' } },
    })
    // Het plafond waarschuwt en blokkeert niet: deze aanroep hoort gewoon te slagen.
    expect(overspend.ok()).toBeTruthy()

    const after = await (await page.request.get(`/api/verbruik?companyId=${COMPANY}&action=status`)).json()
    expect(after.exceeded).toBe(true)
    expect(after.spentEur).toBeCloseTo((COST_PLAIN * 2 * 0.92) / 1_000_000, 6)
  } finally {
    await fake.close()
  }
})

test('de verbruikspagina toont de kosten per project en de cachingstand', async ({ page }) => {
  await resetWorkspace(page)
  const fake = await startFakeAnthropic()
  const ai = { provider: 'anthropic', baseUrl: fake.baseUrl, apiKey: 'test-sleutel', model: 'claude-sonnet-4-6' }

  try {
    await page.request.post('/api/review-draft', {
      headers: scopeHeaders('stuk-kwaliteit', 'Kwaliteitsplan'),
      data: reviewBody(ai, '<p>Een concept om te reviewen.</p>'),
    })
    // Het overzicht draait op het actieve bedrijf uit de werkruimte; dat is 'default'.
    await page.request.post('/api/review-draft', {
      headers: { ...scopeHeaders('stuk-kwaliteit', 'Kwaliteitsplan'), 'x-bedrijf-id': 'default' },
      data: reviewBody(ai, '<p>Nog een concept.</p>'),
    })

    await page.goto('/verbruik')
    await page.getByPlaceholder('Admin wachtwoord').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: 'Inloggen' }).click()

    await expect(page.getByRole('heading', { name: 'Wat de AI heeft gekost' })).toBeVisible()

    // € 0,0237 × 0,92 ≈ € 0,0218 — klein bedrag, dus met extra decimalen weergegeven.
    // Let op de regex: het euroteken staat met een harde spatie (U+00A0) aan het bedrag vast.
    await expect(page.getByText(/€\s*0,0218/).first()).toBeVisible()
    await expect(page.getByText('Zorgvervoer Regio Noord')).toBeVisible()
    await expect(page.getByText('1 van 1 aanroepen lazen uit cache')).toBeVisible()

    // Het stuk zit een niveau dieper; het project klapt open.
    await page.getByText('Zorgvervoer Regio Noord').click()
    await expect(page.getByText('Kwaliteitsplan')).toBeVisible()
  } finally {
    await fake.close()
  }
})
