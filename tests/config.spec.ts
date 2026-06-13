import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
})

test('configuratiepagina laadt en slaat bedrijfsinfo op', async ({ page }) => {
  await page.goto('/configuratie')
  await expect(page.getByRole('heading', { name: 'Bedrijfsgegevens' })).toBeVisible()

  await page.getByPlaceholder('Besteed Het Uit').fill('Test BV')
  await page.getByPlaceholder('Bidmanagement en AI-ondersteunde inschrijvingen').fill('Tenderexperts')
  await page.getByRole('button', { name: 'Opslaan' }).click()

  await expect(page.getByText('Bedrijfsconfiguratie opgeslagen')).toBeVisible()

  await page.reload()
  await expect(page.getByPlaceholder('Besteed Het Uit')).toHaveValue('Test BV')
})

test('navigatie vanuit werkplek naar configuratie', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Bedrijfsconfiguratie' }).click()
  await expect(page).toHaveURL(/\/configuratie/)
  await expect(page.getByRole('heading', { name: 'Profiel & bewijs' })).toBeVisible()
})

test('upload bedrijfsdocument op configuratiepagina', async ({ page }) => {
  await page.goto('/configuratie')
  await page.setInputFiles('input[type="file"]', {
    name: 'cases.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Referentie: gemeente X, 2024, succesvolle implementatie.'),
  })
  await expect(page.getByText('cases.txt')).toBeVisible()
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByText('Bedrijfsconfiguratie opgeslagen')).toBeVisible()
})

test('gegevens ophalen vult velden in op basis van website', async ({ page }) => {
  await page.route('**/api/company-enrich', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        fields: {
          name: 'Voorbeeld BV',
          tagline: 'Specialist in aanbestedingen',
          kvk: '12345678',
          website: 'https://voorbeeld.nl',
          contactEmail: 'info@voorbeeld.nl',
          profile: 'Voorbeeld BV levert bidmanagement-diensten.',
          competencies: 'Bidmanagement, tenderanalyse',
          usps: 'Landelijke dekking',
          references: 'Gemeente X (2024)',
        },
        sources: ['https://voorbeeld.nl', 'websearch:voorbeeld kvk'],
        notes: 'Alleen expliciet genoemde feiten.',
      }),
    })
  })

  await page.goto('/configuratie')
  await page.getByPlaceholder('https://www.bedrijf.nl').fill('https://voorbeeld.nl')
  await page.getByRole('button', { name: 'Gegevens ophalen' }).click()

  await expect(page.getByPlaceholder('Besteed Het Uit')).toHaveValue('Voorbeeld BV')
  await expect(page.getByPlaceholder('12345678')).toHaveValue('12345678')
  await expect(page.getByPlaceholder('tenders@bedrijf.nl')).toHaveValue('info@voorbeeld.nl')
  await expect(page.getByText('2 bronnen verwerkt')).toBeVisible()
})
