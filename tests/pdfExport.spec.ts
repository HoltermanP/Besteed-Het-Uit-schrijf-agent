import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { PDFParse } from 'pdf-parse'
import { createProject, resetWorkspace } from './helpers'

/**
 * PDF-export: inschrijfplatforms eisen een PDF met een tekstlaag (geen afbeelding) en
 * een bidmanager wil nette paginaovergangen. De export bouwt daarom echte tekst met
 * jsPDF; deze test leest de gedownloade PDF terug en controleert dat de tekst
 * selecteerbaar is, de voettekst per pagina klopt en regels niet worden doorgesneden.
 */

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page)
})

test('exporteert het concept als PDF met selecteerbare tekst en paginanummering', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await createProject(page)
  await page.getByRole('button', { name: 'Start schrijfagent' }).first().click()
  await expect(page.getByText('Brons versie')).toBeVisible({ timeout: 15000 })
  // De schrijfagent streamt het concept in; exporteer pas als het hele stuk er staat.
  await expect(page.getByRole('button', { name: 'Genereer', exact: true })).toBeEnabled({ timeout: 60000 })
  await expect(page.getByText('Bewijslast en organisatiekracht')).toBeVisible({ timeout: 15000 })

  const downloadPromise = page.waitForEvent('download', { timeout: 20000 })
  await page.getByRole('button', { name: 'PDF', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.pdf$/)
  const path = testInfo.outputPath('export.pdf')
  await download.saveAs(path)
  await expect(page.getByText('PDF gedownload.')).toBeVisible()
  expect(errors).toEqual([])

  const parser = new PDFParse({ data: await readFile(path) })
  try {
    const result = await parser.getText()
    const pages = result.pages.map((p) => p.text)
    expect(pages.length).toBeGreaterThanOrEqual(2)

    // Tekstlaag: titel en inhoud zijn als tekst terug te lezen (geen gerasterde afbeelding).
    const all = pages.join('\n')
    expect(all).toContain('Testproject')
    expect(all).toContain('Begrip van de opdracht')
    expect(all).toContain('Onderscheidende aanpak')

    // Voettekst op elke pagina met het juiste paginanummer en totaal.
    pages.forEach((text, index) => {
      expect(text).toContain(`Pagina ${index + 1} van ${pages.length}`)
    })

    // Geen afbeeldingen: de oude export leverde per pagina één PNG op.
    const images = await parser.getImage()
    expect(images.pages.flatMap((p) => p.images)).toHaveLength(0)

    // Een regel wordt nooit doormidden gesneden: pagina 1 eindigt niet met een
    // afgebroken woord (koppelteken-vrij, volledige woorden) voor de voettekst.
    const firstPageBody = pages[0].split('Pagina 1 van')[0].trim()
    expect(firstPageBody).toMatch(/[\w.:;)”’]$/u)
  } finally {
    await parser.destroy()
  }
})
