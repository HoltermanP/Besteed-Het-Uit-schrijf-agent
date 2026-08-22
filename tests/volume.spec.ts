import { expect, test, type Page } from '@playwright/test'
import { resetWorkspace } from './helpers'
import { HEADER_PAGES, wordsForPages } from '../src/lib/volumeLimits'

/**
 * Omvangsbewaking: een stuk met "max. 2 A4" moet ook echt binnen 2 A4 blijven, en zodra
 * woorden, karakters of pagina's over de limiet gaan hoort dat rood op het scherm te staan.
 * De paginatelling komt uit dezelfde bouwer als de PDF-export, dus wat hier wordt getoond
 * is wat er straks wordt ingediend.
 */

const WORDS =
  'de opdrachtgever verwacht een aantoonbaar beheerste uitvoering waarbij onze projectleider wekelijks stuurt op afgesproken meetpunten en resultaten binnen de gestelde termijn oplevert volgens het kwaliteitsplan'.split(
    ' ',
  )

/** Alinea van precies `count` zichtbare woorden. */
function paragraph(count: number): string {
  return `<p>${Array.from({ length: count }, (_, i) => WORDS[i % WORDS.length]).join(' ')}</p>`
}

/** Sectie in de opmaak die de schrijfagent oplevert: kop, subtitel, alinea's, lijst en tabel. */
function section(n: number, words: number): string {
  const listWords = 27
  const tableWords = 13
  const fixed = 8 + 7 + listWords + tableWords // <h2> + subtitel + lijst + tabel
  const prose = Math.max(20, words - fixed)
  return `<section class="doc-section">
  <h2>${n}. Onze aanpak voor onderdeel ${n} van deze uitvraag</h2>
  <p class="section-subtitle">Beoordeeld op: subgunningscriterium ${n} kwaliteit</p>
  ${paragraph(Math.round(prose / 2))}
  <ul><li>${WORDS.slice(0, 9).join(' ')}</li><li>${WORDS.slice(3, 12).join(' ')}</li><li>${WORDS.slice(5, 14).join(' ')}</li></ul>
  ${paragraph(prose - Math.round(prose / 2))}
  <div class="table-wrap"><table><caption>Meetpunten en eigenaren</caption><thead><tr><th>Meetpunt</th><th>Ritme</th><th>Eigenaar</th></tr></thead><tbody>
    <tr><td>Voortgang</td><td>Wekelijks</td><td>Projectleider</td></tr>
    <tr><td>Kwaliteit</td><td>Maandelijks</td><td>Kwaliteitsmanager</td></tr>
  </tbody></table></div>
</section>`
}

const HEADER = `<header class="doc-header">
  <p class="kicker">Plan van aanpak · Brons versie</p>
  <p class="doc-subtitle">Inschrijving Dienstverlening — Gemeente Testdorp</p>
  <h1>Plan van aanpak dienstverlening</h1>
  <dl class="doc-meta"><div><dt>Opdrachtgever</dt><dd>Gemeente Testdorp</dd></div><div><dt>Beoordeeld op</dt><dd>Kwaliteit 70%</dd></div><div><dt>Deadline</dt><dd>1 oktober 2026</dd></div><div><dt>TenderNed</dt><dd>TN-1</dd></div></dl>
  <p class="lead">${WORDS.slice(0, 22).join(' ')}</p>
</header>`

/** Concept van ongeveer `words` zichtbare woorden, verdeeld over `sections` secties. */
function draftOf(words: number, sections = 3): string {
  const perSection = Math.max(60, Math.round((words - 40) / sections))
  const body = Array.from({ length: sections }, (_, i) => section(i + 1, perSection)).join('\n')
  return `<article class="proposal-doc">${HEADER}\n${body}</article>`
}

type Limit = { unit: 'woorden' | 'karakters' | 'paginas'; max: number }

async function openWorkspace(page: Page, id: string, draft: string, limits: Limit[]) {
  const wordLimits = limits.map((limit) => ({
    label: 'Limiet',
    max: limit.max,
    unit: limit.unit,
    source: 'leidraad',
  }))
  await page.request.put('/api/state', {
    data: {
      set: {
        [`bid-agent-dossier-${id}`]: JSON.stringify({
          project: { title: `Omvang ${id}`, tendernedId: 'TN-1', buyer: 'Gemeente Testdorp', deadline: '' },
          documents: [],
          comments: [],
          stage: 'brons',
          draft,
          analysis: {
            analyzedAt: '2026-01-01',
            leidraadFound: true,
            summary: 'Test',
            wordLimits,
            contentRequirements: [],
            documentRequirements: [],
            requestedDocuments: [],
            submissionRequirements: [],
            evaluationCriteria: [],
            styleProfile: { companyName: 'Test', buyerName: 'Gemeente Testdorp', companySignals: [], buyerSignals: [] },
            gaps: [],
            targetWordCount: limits.find((limit) => limit.unit === 'woorden')?.max,
            targetCharCount: limits.find((limit) => limit.unit === 'karakters')?.max,
            targetPageCount: limits.find((limit) => limit.unit === 'paginas')?.max,
          },
          updatedAt: '2026-01-01T10:00:00.000Z',
        }),
      },
    },
  })
  await page.goto(`/projecten/${id}`)
  await expect(page.getByRole('heading', { name: `Omvang ${id}`, level: 1 }).first()).toBeVisible()
}

/**
 * De paginateller van het openstaande stuk, zodra die op de échte meting staat. De teller
 * toont eerst een schatting uit het woordaantal; pas als de PDF is doorgerekend staat de
 * vulling van de laatste pagina in de tooltip.
 */
async function pagesTile(page: Page) {
  const tile = page.getByTestId('volume-paginas')
  await expect(tile).toBeVisible({ timeout: 10000 })
  await expect(tile).toHaveAttribute('title', /gevuld/, { timeout: 10000 })
  return tile
}

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page)
})

test('houdt een stuk dat op de paginalimiet is geschreven binnen die limiet', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'één meting is genoeg')

  // Het woordbudget dat de schrijfagent uit een paginalimiet afleidt, moet in de export
  // ook echt binnen dat aantal A4 passen — en de ruimte wel benutten. Loopt dit stuk,
  // dan is het paginamodel (kop + dichtheid) uit de pas met de PDF-exporter.
  for (const limit of [2, 4, 8]) {
    const words = wordsForPages(limit)
    await openWorkspace(page, `ijk${limit}`, draftOf(words, Math.max(2, limit)), [{ unit: 'paginas', max: limit }])
    const tile = await pagesTile(page)
    const pages = Number((await tile.innerText()).split('/')[0].trim())
    expect(pages, `${words} woorden zou ${limit} A4 moeten vullen, niet ${pages}`).toBeLessThanOrEqual(limit)
    expect(pages).toBeGreaterThanOrEqual(limit - 1)
    await expect(tile).not.toHaveAttribute('data-level', 'over')
  }
})

test('waarschuwt rood zodra het stuk over de paginalimiet gaat', async ({ page }) => {
  await openWorkspace(page, 'paginaover', draftOf(2400, 6), [{ unit: 'paginas', max: 2 }])

  const tile = await pagesTile(page)
  await expect(tile).toHaveAttribute('data-level', 'over')
  const alert = page.getByTestId('volume-alert')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText("pagina's")
  await expect(alert).toContainText('uitgesloten')
})

test('waarschuwt rood bij een overschreden woord- en karakterlimiet', async ({ page }) => {
  await openWorkspace(page, 'woordover', draftOf(1200, 3), [
    { unit: 'woorden', max: 500 },
    { unit: 'karakters', max: 3000 },
  ])

  await expect(page.getByTestId('volume-woorden')).toHaveAttribute('data-level', 'over')
  await expect(page.getByTestId('volume-karakters')).toHaveAttribute('data-level', 'over')
  await expect(page.getByTestId('volume-alert')).toBeVisible()
})

test('geeft geen waarschuwing zolang het stuk binnen de limieten blijft', async ({ page }) => {
  await openWorkspace(page, 'binnenlimiet', draftOf(wordsForPages(4), 4), [
    { unit: 'paginas', max: 4 },
    { unit: 'woorden', max: 4000 },
  ])

  const tile = await pagesTile(page)
  await expect(tile).not.toHaveAttribute('data-level', 'over')
  await expect(page.getByTestId('volume-alert')).toHaveCount(0)
})

test('rekent de vaste kop mee in het paginabudget', () => {
  // Een paginalimiet levert minder woordbudget op dan pagina's × dichtheid: de kop met
  // titel en metadata kost al ruimte voordat de eerste sectie begint.
  expect(wordsForPages(2)).toBeLessThan(wordsForPages(3) - wordsForPages(1))
  expect(HEADER_PAGES).toBeGreaterThan(0)
})

test('markeert een te lang stuk rood op de indieningschecklist', async ({ page }) => {
  const requested = {
    id: 'doc-plan-van-aanpak',
    title: 'Plan van aanpak',
    kind: 'schrijfstuk',
    question: 'Beschrijf de aanpak.',
    criteria: [],
    topics: [],
    wordLimits: [{ label: 'Plan van aanpak', max: 2, unit: 'paginas', source: 'leidraad.pdf' }],
    mandatory: true,
    source: 'leidraad.pdf',
  }
  const html = draftOf(2400, 6)
  await page.request.put('/api/state', {
    data: {
      set: {
        'bid-agent-dossier-tn-omvang': JSON.stringify({
          project: { title: 'Inschrijving omvang', tendernedId: 'TN-1', buyer: 'Gemeente Testdorp', deadline: '' },
          documents: [],
          drafts: [
            {
              id: requested.id,
              title: requested.title,
              source: 'analyse',
              requested,
              stage: 'goud',
              html,
              comments: [],
              updatedAt: '2026-01-01T10:00:00.000Z',
            },
          ],
          activeDraftId: requested.id,
          comments: [],
          stage: 'goud',
          draft: html,
          analysis: null,
          updatedAt: '2026-01-01T10:00:00.000Z',
        }),
      },
    },
  })

  await page.goto('/projecten/tn-omvang/indiening')
  const warning = page.getByTestId('submission-over-limit')
  await expect(warning).toBeVisible()
  await expect(warning).toContainText("pagina's")
  await expect(warning).toContainText('uitgesloten')
})
