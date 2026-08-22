import fs from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { createProject, resetWorkspace } from './helpers'

const OUT = process.env.DOCX_OUT_DIR ?? ''

/** Representatief concept met alle modellen/opmaak die de schrijfagent gebruikt. */
const RICH_DRAFT = `<article class="proposal-doc">
<header class="doc-header">
  <p class="kicker">Plan van aanpak · Brons versie</p>
  <p class="doc-subtitle">Inschrijving Testproject — Gemeente Test</p>
  <h1>Plan van aanpak dienstverlening</h1>
  <dl class="doc-meta"><dt>Opdrachtgever</dt><dd>Gemeente Test</dd><dt>Deadline</dt><dd>1 oktober 2026</dd><dt>TenderNed</dt><dd>TN-1</dd></dl>
  <table><tbody><tr></tr></tbody></table>
  <p class="lead">Wij leveren binnen <strong>vier weken</strong> een werkend implementatieplan, met <em>toetsbare</em> mijlpalen.</p>
</header>
<section class="doc-section">
  <h2>1. Aanpak</h2>
  <p class="section-subtitle">Beoordeeld op: plan van aanpak (30%)</p>
  <p>Onze aanpak bestaat uit vier fasen.<br>Elke fase kent een eigen resultaat.</p>
  <ol><li>Intake en <strong>analyse</strong></li><li>Ontwerp</li><li>Implementatie</li></ol>
  <ul><li>Wekelijks voortgangsoverleg</li><li>Maandelijkse rapportage</li></ul>
  <blockquote>Wij werken <strong>transparant</strong> en toetsbaar.</blockquote>
  <figure class="doc-model">
    <figcaption>Onze aanpak in vier fasen</figcaption>
    <table class="process-flow" role="presentation"><tbody><tr>
      <td class="process-step"><span class="step-no">1</span><span class="step-title">Intake</span><span class="step-detail">Analyse en plan</span></td>
      <td class="process-arrow">→</td>
      <td class="process-step"><span class="step-no">2</span><span class="step-title">Ontwerp</span><span class="step-detail">Ontwerp en afstemming</span></td>
    </tr></tbody></table>
  </figure>
  <div class="table-wrap"><table><caption>Planning</caption><thead><tr><th>Fase</th><th>Periode</th><th>Resultaat</th></tr></thead><tbody><tr><td>Intake</td><td>Week 1–2</td><td>Plan <strong>vastgesteld</strong></td></tr><tr><td colspan="2">Ontwerp en bouw</td><td>Oplevering</td></tr></tbody></table></div>
</section>
<section class="doc-section">
  <h2>2. Team en planning</h2>
  <figure class="doc-model">
    <figcaption>Planning op hoofdlijnen</figcaption>
    <table class="timeline" role="presentation"><tbody>
      <tr><td class="tl-when">Week 1–2</td><td class="tl-marker"><span class="tl-dot"></span></td><td class="tl-what"><span class="tl-title">Start</span><span class="tl-detail">Kick-off en intake</span></td></tr>
      <tr><td class="tl-when">Week 3–6</td><td class="tl-marker"><span class="tl-dot"></span></td><td class="tl-what"><span class="tl-title">Bouw</span><span class="tl-detail">Implementatie</span></td></tr>
    </tbody></table>
  </figure>
  <figure class="doc-model">
    <figcaption>Projectorganisatie</figcaption>
    <table class="org-chart" role="presentation"><tbody>
      <tr><td class="org-top"><span class="org-box"><span class="org-role">Eindverantwoordelijk</span><span class="org-name">Projectdirecteur</span></span></td></tr>
      <tr><td><table class="org-reports" role="presentation"><tbody><tr>
        <td><span class="org-box"><span class="org-role">Projectleider</span><span class="org-name">Senior adviseur</span></span></td>
        <td><span class="org-box"><span class="org-role">Kwaliteit</span><span class="org-name">Kwaliteitsmanager</span></span></td>
      </tr></tbody></table></td></tr>
    </tbody></table>
  </figure>
  <figure class="doc-model">
    <figcaption>Risico's naar kans en impact</figcaption>
    <table class="matrix-2x2" role="presentation"><tbody>
      <tr><td class="mx-corner"></td><td class="mx-axis-x">Lage impact</td><td class="mx-axis-x">Hoge impact</td></tr>
      <tr><td class="mx-axis-y">Hoge kans</td><td class="mx-cell"><span class="mx-label">Ziekte</span>vervanging geregeld</td><td class="mx-cell mx-hot"><span class="mx-label">Uitloop</span>buffer ingebouwd</td></tr>
      <tr><td class="mx-axis-y">Lage kans</td><td class="mx-cell"><span class="mx-label">Scope</span>wijzigingsproces</td><td class="mx-cell"><span class="mx-label">Data</span>back-up</td></tr>
    </tbody></table>
  </figure>
  <figure class="doc-model">
    <figcaption>SWOT-analyse</figcaption>
    <table class="model-grid" role="presentation"><tbody>
      <tr>
        <td class="tone-positive"><span class="grid-label">Sterktes</span><span class="grid-body"><ul><li>Ervaren team</li><li>Lokale aanwezigheid</li></ul></span></td>
        <td class="tone-negative"><span class="grid-label">Zwaktes</span><span class="grid-body">Beperkte schaal</span></td>
      </tr>
    </tbody></table>
  </figure>
  <ol><li>Tweede genummerde lijst</li><li>Nummering start opnieuw</li></ol>
</section>
</article>`

async function clickWord(page: Page, outName: string) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('400')) errors.push(`console: ${msg.text()}`)
  })
  const downloadPromise = page.waitForEvent('download', { timeout: 20000 })
  await page.getByRole('button', { name: 'Word', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.docx$/)
  if (OUT) await download.saveAs(`${OUT}/${outName}`)
  await expect(page.getByText('Word-document gedownload.')).toBeVisible()
  expect(errors).toEqual([])
}

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page)
})

test('exporteert het concept als Word-document', async ({ page }) => {
  await createProject(page)
  await page.getByRole('button', { name: 'Start schrijfagent' }).first().click()
  await expect(page.getByText('Brons versie')).toBeVisible({ timeout: 15000 })
  await clickWord(page, 'export.docx')
})

test('exporteert een concept met tabellen, modellen en lijsten als Word-document', async ({ page }) => {
  await page.request.put('/api/state', {
    data: {
      set: {
        'bid-agent-dossier-555555': JSON.stringify({
          project: { title: 'Rijk project', tendernedId: 'TN-1', buyer: 'Gemeente Test', deadline: '' },
          documents: [],
          comments: [],
          stage: 'brons',
          draft: RICH_DRAFT,
          analysis: null,
          updatedAt: '2026-01-01T10:00:00.000Z',
        }),
      },
    },
  })
  await page.goto('/projecten/555555')
  await expect(page.getByRole('heading', { name: 'Rijk project', level: 1 }).first()).toBeVisible()
  await expect(page.getByText('Plan van aanpak dienstverlening')).toBeVisible()
  await clickWord(page, 'export-rich.docx')
})

// Echte concepten uit een dump (alleen lokaal, via DOCX_IN_DIR) door de exporter halen.
const IN = process.env.DOCX_IN_DIR ?? ''
if (IN) {
  for (const file of fs.readdirSync(IN).filter((name: string) => name.endsWith('.html'))) {
    test(`exporteert echt concept ${file}`, async ({ page }) => {
      const html = fs.readFileSync(`${IN}/${file}`, 'utf8')
      const id = `real-${file.replace(/\W+/g, '')}`
      await page.request.put('/api/state', {
        data: {
          set: {
            [`bid-agent-dossier-${id}`]: JSON.stringify({
              project: { title: `Echt ${file}`, tendernedId: '', buyer: '', deadline: '' },
              documents: [], comments: [], stage: 'brons', draft: html, analysis: null,
              updatedAt: '2026-01-01T10:00:00.000Z',
            }),
          },
        },
      })
      await page.goto(`/projecten/${id}`)
      await expect(page.getByRole('heading', { name: `Echt ${file}`, level: 1 }).first()).toBeVisible()
      await clickWord(page, `${file}.docx`)
    })
  }
}
