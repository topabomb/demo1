import { expect, test } from '@playwright/test'

test('engine shell exposes real controls and demo-owned chrome without fake affordances', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByTestId('active-session-id')).toBeVisible()
  await expect(page.getByText('Synthetic playback', { exact: true })).toBeVisible()
  await expect(page.getByTestId('diagnostics-open')).toBeVisible()
  await expect(page.getByTestId('composer-input')).toBeVisible()

  await expect(page.locator('[title="Search conversation"]')).toHaveCount(0)
  await expect(page.locator('[title="Attach"]')).toHaveCount(0)
  await expect(page.locator('.model-chip')).toHaveCount(0)
  await expect(page.locator('.mode-button')).toHaveCount(0)

  const desktop = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.conversation-header')!.getBoundingClientRect()
    const stage = document.querySelector<HTMLElement>('[data-testid="scrollport"]')!.getBoundingClientRect()
    const composer = document.querySelector<HTMLElement>('[data-testid="composer-shell"]')!.getBoundingClientRect()
    return {
      headerHeight: header.height,
      overlay: stage.bottom - composer.top,
      pageOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }
  })
  expect(desktop.headerHeight).toBeGreaterThanOrEqual(54)
  expect(desktop.headerHeight).toBeLessThanOrEqual(64)
  expect(desktop.overlay).toBeLessThanOrEqual(1)
  expect(desktop.pageOverflow).toBeLessThanOrEqual(1)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('mobile-session-toggle')).toBeVisible()
  await expect(page.getByTestId('composer-input')).toBeVisible()
  const mobile = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.conversation-header')!.getBoundingClientRect()
    const menu = document.querySelector<HTMLElement>('[data-testid="mobile-session-toggle"]')!.getBoundingClientRect()
    const composer = document.querySelector<HTMLElement>('[data-testid="composer-shell"]')!.getBoundingClientRect()
    const stage = document.querySelector<HTMLElement>('[data-testid="scrollport"]')!.getBoundingClientRect()
    return {
      menuClearsTitle: header.left + 48 >= menu.right,
      overlay: stage.bottom - composer.top,
      pageOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }
  })
  expect(mobile.menuClearsTitle).toBe(true)
  expect(mobile.overlay).toBeLessThanOrEqual(1)
  expect(mobile.pageOverflow).toBeLessThanOrEqual(1)
})
