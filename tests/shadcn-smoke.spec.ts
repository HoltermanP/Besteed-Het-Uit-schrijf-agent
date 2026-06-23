import { test, expect } from '@playwright/test'

const routes = ['/', '/schrijfregels', '/configuratie', '/aanbestedingen']

for (const route of routes) {
  test(`mounts without console errors: ${route}`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto(route, { waitUntil: 'networkidle' })

    // #root must have rendered content (app mounted, no white screen)
    const rootChildren = await page.locator('#root > *').count()
    expect(rootChildren, `#root should have children on ${route}`).toBeGreaterThan(0)

    // Theme toggle present (proves shadcn UI rendered in the header)
    await expect(page.getByRole('button', { name: 'Thema wisselen' }).first()).toBeVisible()

    expect(errors, `console errors on ${route}:\n${errors.join('\n')}`).toEqual([])
  })
}

test('dark mode toggle switches html class', async ({ page }) => {
  await page.goto('/schrijfregels', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Thema wisselen' }).first().click()
  await page.getByRole('menuitem', { name: 'Donker' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Thema wisselen' }).first().click()
  await page.getByRole('menuitem', { name: 'Licht' }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})
