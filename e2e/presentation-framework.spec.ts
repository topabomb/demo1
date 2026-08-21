import { expect, test, type Page } from '@playwright/test'

function numeric(text: string | null): number { return Number((text ?? '').replace(/[^0-9-]/g, '')) }

async function openApp(page: Page): Promise<void> {
  await page.goto('./')
  await expect(page.getByTestId('active-session-id')).toBeVisible()
}

async function switchSession(page: Page, id: string): Promise<void> {
  await page.getByTestId(`session-${id}`).click()
  await expect(page.getByTestId('active-session-id')).toHaveText(id)
}

async function jump(page: Page, index: number): Promise<void> {
  await page.getByTestId('jump-input').fill(String(index))
  await page.getByTestId('jump-button').click()
  await expect(page.locator(`[data-message-index="${index}"]`).first()).toBeVisible({ timeout: 15_000 })
  await expect.poll(async () => Math.abs(numeric(await page.getByTestId('reader-position').textContent()) - index), { timeout: 15_000 }).toBeLessThan(48)
}

async function assertNoRowOverlap(page: Page): Promise<void> {
  const overlap = await page.getByTestId('scrollport').evaluate((stage) => {
    const viewport = stage.getBoundingClientRect()
    const rows = [...stage.querySelectorAll<HTMLElement>('[data-virtual-item="true"]')]
      .map(row => row.getBoundingClientRect())
      .filter(rect => rect.bottom > viewport.top && rect.top < viewport.bottom)
      .sort((a, b) => a.top - b.top)
    let worst = 0
    for (let i = 1; i < rows.length; i += 1) worst = Math.max(worst, rows[i - 1]!.bottom - rows[i]!.top)
    return worst
  })
  expect(overlap).toBeLessThanOrEqual(1)
}

async function bodyOverflow(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth)
}

test('runtime ContentBlock fixtures use the canonical projector and renderer registries', async ({ page }) => {
  await openApp(page)
  await switchSession(page, 'dsh-transport')
  await expect(page.getByTestId('logical-count')).toHaveText('180,000')
  await page.getByTestId('inject-mixed-five').click()
  await expect(page.getByTestId('logical-count')).toHaveText('180,025')

  await jump(page, 180_001)
  await expect(page.getByTestId('thinking-block')).toBeVisible()
  await expect(page.getByTestId('diff-block')).toBeVisible()
  await expect(page.getByTestId('markdown-block')).toBeVisible()

  await jump(page, 180_002)
  await expect(page.getByTestId('tool-block')).toBeVisible()

  await jump(page, 180_006)
  await expect(page.getByTestId('image-block')).toBeVisible()

  await jump(page, 180_011)
  const html = page.locator('[data-message-index="180011"]').locator('.html-card')
  await expect(html).toBeVisible()
  expect(await html.locator('script').count()).toBe(0)

  await jump(page, 180_016)
  await expect(page.getByTestId('code-block')).toBeVisible()
  await expect(page.getByTestId('code-block').locator('.shiki')).toBeVisible({ timeout: 15_000 })

  expect(numeric(await page.getByTestId('mounted-rows').textContent())).toBeLessThan(180)
  await assertNoRowOverlap(page)
})

test('Markdown compatibility gallery covers GFM structures, sanitization and long chunked documents', async ({ page }) => {
  await openApp(page)
  await switchSession(page, 'dsh-transport')
  await page.getByTestId('inject-markdown-gallery').click()
  await expect(page.getByTestId('logical-count')).toHaveText('180,006')

  await jump(page, 180_000)
  const basics = page.locator('[data-message-index="180000"]').first().getByTestId('markdown-block')
  await expect(basics.locator('h1')).toHaveText('Markdown compatibility')
  await expect(basics.locator('blockquote')).toBeVisible()
  await expect(basics.locator('del')).toHaveText('strike')

  await jump(page, 180_001)
  const tasks = page.locator('[data-message-index="180001"]').first().getByTestId('markdown-block')
  await expect(tasks.locator('input[type="checkbox"]')).toHaveCount(3)

  await jump(page, 180_002)
  await expect(page.locator('[data-message-index="180002"]').first().locator('.markdown-body table')).toBeVisible()

  await jump(page, 180_003)
  await expect(page.locator('[data-message-index="180003"]').first().locator('.markdown-body pre code')).toHaveCount(2)

  await jump(page, 180_004)
  const raw = page.locator('[data-message-index="180004"]').first().getByTestId('markdown-block')
  expect(await raw.locator('script').count()).toBe(0)
  expect(await page.evaluate(() => (window as unknown as { __markdownUnsafe?: boolean }).__markdownUnsafe)).toBeUndefined()

  await jump(page, 180_005)
  await expect(page.locator('[data-message-index="180005"]').first().locator('.markdown-body h3')).toBeVisible()
  expect(await page.locator('[data-message-index="180005"]').count()).toBeGreaterThan(1)
  await assertNoRowOverlap(page)
})

test('responsive reflow preserves containment, mobile session access and semantic rendering', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openApp(page)
  await switchSession(page, 'dsh-transport')
  await page.getByTestId('inject-markdown-gallery').click()
  await expect(page.getByTestId('logical-count')).toHaveText('180,006')
  await jump(page, 180_002)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(350)
  expect(await bodyOverflow(page)).toBeLessThanOrEqual(1)
  await expect(page.getByTestId('mobile-session-toggle')).toBeVisible()

  // Diagnostics is a product overlay on phone; close it before exercising the workspace drawer.
  const closeDiagnostics = page.locator('.diagnostics-panel .icon-button')
  if (await closeDiagnostics.isVisible()) await closeDiagnostics.click()
  await page.getByTestId('mobile-session-toggle').click()
  await expect(page.getByTestId('session-sidebar')).toBeVisible()
  await page.getByTestId('session-event-normalization').click()
  await expect(page.locator('.conversation-shell')).toHaveAttribute('data-session-id', 'event-normalization')
  await page.getByTestId('mobile-session-toggle').click()
  await page.getByTestId('session-dsh-transport').click()

  // Reopen diagnostics only to drive semantic jumps. Product layout remains single-column.
  await page.getByTestId('diagnostics-open').click()
  await jump(page, 180_002)
  const table = page.locator('[data-message-index="180002"]').first().locator('.markdown-body table')
  await expect(table).toBeVisible()
  expect(await bodyOverflow(page)).toBeLessThanOrEqual(1)

  await jump(page, 180_003)
  const pre = page.locator('[data-message-index="180003"]').first().locator('.markdown-body pre').first()
  await expect(pre).toBeVisible()
  expect(await bodyOverflow(page)).toBeLessThanOrEqual(1)

  await page.getByTestId('inject-mixed-five').click()
  // Gallery added 6 messages; mixed fixtures start at 180006. Ordinal 2 image lands at 180012.
  await jump(page, 180_012)
  const image = page.getByTestId('image-block').locator('img')
  await expect(image).toBeVisible()
  const imageFits = await image.evaluate(element => {
    const row = element.closest<HTMLElement>('[data-virtual-item="true"]')!
    return element.getBoundingClientRect().width <= row.getBoundingClientRect().width + 1
  })
  expect(imageFits).toBe(true)
  expect(await bodyOverflow(page)).toBeLessThanOrEqual(1)
  await assertNoRowOverlap(page)

  await page.setViewportSize({ width: 980, height: 820 })
  await page.waitForTimeout(300)
  expect(await bodyOverflow(page)).toBeLessThanOrEqual(1)
  await assertNoRowOverlap(page)
})
