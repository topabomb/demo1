import { expect, test, type Page } from '@playwright/test'

function numeric(text: string | null): number {
  return Number((text ?? '').replace(/[^0-9-]/g, ''))
}

async function visibleAnchor(page: Page): Promise<{ id: string; top: number } | null> {
  return page.getByTestId('scrollport').evaluate((scrollport) => {
    const viewport = scrollport.getBoundingClientRect()
    const rows = [...scrollport.querySelectorAll<HTMLElement>('[data-render-unit]')]
      .map(row => ({ row, rect: row.getBoundingClientRect() }))
      .filter(({ rect }) => rect.bottom > viewport.top && rect.top < viewport.bottom)
      .sort((a, b) => Math.abs(a.rect.top - viewport.top) - Math.abs(b.rect.top - viewport.top))
    const first = rows[0]
    if (!first) return null
    return { id: first.row.dataset.renderUnit ?? '', top: first.rect.top - viewport.top }
  })
}

async function jump(page: Page, index: number): Promise<void> {
  await page.getByTestId('jump-input').fill(String(index))
  await page.getByTestId('jump-button').click()
  await expect.poll(async () => {
    const range = (await page.getByTestId('segment-range').textContent()) ?? ''
    const [startText, endText] = range.split('–')
    return numeric(startText) <= index && numeric(endText) >= index
  }).toBe(true)
  await expect.poll(async () => page.locator(`[data-message-index="${index}"]`).count()).toBeGreaterThan(0)
}

async function remainingToBottom(page: Page): Promise<number> {
  return page.getByTestId('scrollport').evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)
}

test('one million logical messages keep DOM bounded, tail-follow correctly, and preserve a semantic prepend anchor', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })

  await page.goto('/')
  await expect(page.getByTestId('logical-count')).toHaveText('1,000,000')

  const mounted = numeric(await page.getByTestId('mounted-rows').textContent())
  const active = numeric(await page.getByTestId('active-units').textContent())
  expect(mounted).toBeLessThan(180)
  expect(active).toBeLessThan(10_000)
  expect(active).toBeGreaterThan(2048)

  await expect.poll(async () => numeric(await page.getByTestId('stream-ticks').textContent())).toBeGreaterThan(5)
  await expect(page.locator('[data-live-unit="true"]').last()).toBeVisible()
  expect(await remainingToBottom(page)).toBeLessThan(160)

  const publishesBeforeEscape = numeric(await page.getByTestId('stream-ticks').textContent())
  await page.getByTestId('scrollport').hover()
  await page.mouse.wheel(0, -1200)
  await expect.poll(() => remainingToBottom(page)).toBeGreaterThan(400)
  await expect.poll(async () => numeric(await page.getByTestId('stream-ticks').textContent())).toBeGreaterThan(publishesBeforeEscape + 4)
  expect(await remainingToBottom(page)).toBeGreaterThan(300)

  await page.getByRole('button', { name: 'Pause' }).click()
  await jump(page, 500_000)
  expect(await page.locator('[data-render-unit]').count()).toBeLessThan(180)

  const reader = numeric(await page.getByTestId('reader-position').textContent())
  expect(Math.abs(reader - 500_000)).toBeLessThan(30)

  const anchorBefore = await visibleAnchor(page)
  expect(anchorBefore).not.toBeNull()
  const beforeSegment = await page.getByTestId('segment-range').textContent()
  await page.getByTestId('prepend-button').click()
  await expect.poll(async () => await page.getByTestId('segment-range').textContent()).not.toBe(beforeSegment)

  await expect.poll(async () => {
    const anchor = anchorBefore
    if (!anchor) return Number.POSITIVE_INFINITY
    return page.locator(`[data-render-unit="${anchor.id}"]`).evaluate((element, expectedTop) => {
      const scrollport = element.closest('[data-testid="scrollport"]')
      if (!scrollport) return Number.POSITIVE_INFINITY
      return Math.abs((element.getBoundingClientRect().top - scrollport.getBoundingClientRect().top) - Number(expectedTop))
    }, anchor.top).catch(() => Number.POSITIVE_INFINITY)
  }, { timeout: 12_000 }).toBeLessThan(4)

  expect(await page.locator('[data-render-unit]').count()).toBeLessThan(180)
  expect(consoleErrors).toEqual([])
})

test('realistic agent content stays structurally bounded while disclosure and rich rendering work', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })

  await page.goto('/')
  await page.getByRole('button', { name: 'Pause' }).click()

  await jump(page, 480_001)
  let thinking = page.locator('[data-message-index="480001"]').first().getByTestId('thinking-block')
  await expect(thinking).toBeVisible()
  const thinkingCollapsedHeight = await thinking.evaluate(element => element.getBoundingClientRect().height)
  await thinking.locator('button').click()
  thinking = page.locator('[data-message-index="480001"]').first().getByTestId('thinking-block')
  await expect(thinking.locator('.thinking-body')).toBeVisible()
  expect(await thinking.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(thinkingCollapsedHeight + 40)

  await jump(page, 480_002)
  let tool = page.locator('[data-message-index="480002"]').first().getByTestId('tool-block')
  await expect(tool).toBeVisible()
  await tool.locator('.tool-summary').click()
  tool = page.locator('[data-message-index="480002"]').first().getByTestId('tool-block')
  await expect(tool.locator('.tool-detail')).toBeVisible()
  await expect(tool.locator('.tool-pane')).toContainText(/path|rows|query/)

  await jump(page, 480_010)
  let code = page.locator('[data-message-index="480010"]').first().getByTestId('code-block')
  await expect(code).toBeVisible()
  await expect(code.locator('.shiki')).toBeVisible({ timeout: 15_000 })
  const expandCode = code.getByRole('button', { name: 'expand' })
  if (await expandCode.count()) {
    const collapsedHeight = await code.evaluate(element => element.getBoundingClientRect().height)
    await expandCode.click()
    code = page.locator('[data-message-index="480010"]').first().getByTestId('code-block')
    await expect(code.getByRole('button', { name: 'collapse' })).toBeVisible()
    expect(await code.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(collapsedHeight)
  }

  await jump(page, 480_018)
  let diff = page.locator('[data-message-index="480018"]').first().getByTestId('diff-block')
  await expect(diff).toBeVisible()
  await expect(diff.locator('.diff-ellipsis')).toBeVisible()
  await diff.getByRole('button', { name: 'expand' }).click()
  diff = page.locator('[data-message-index="480018"]').first().getByTestId('diff-block')
  await expect(diff.getByRole('button', { name: 'collapse' })).toBeVisible()

  await jump(page, 480_022)
  const html = page.locator('[data-message-index="480022"]').first().locator('.html-card')
  await expect(html).toBeVisible()
  expect(await html.locator('script').count()).toBe(0)
  await expect(html).toContainText('Generated interactive artifact')

  await jump(page, 480_021)
  const image = page.locator('[data-message-index="480021"]').first().locator('.image-card img')
  await expect(image).toBeVisible()
  const dimensions = await image.evaluate(element => ({
    width: Number(element.getAttribute('width')),
    height: Number(element.getAttribute('height')),
  }))
  expect(dimensions.width).toBeGreaterThan(0)
  expect(dimensions.height).toBeGreaterThan(0)

  expect(await page.locator('[data-render-unit]').count()).toBeLessThan(180)
  expect(consoleErrors).toEqual([])
})
