import { expect, test, type Page } from '@playwright/test'

function numeric(text: string | null): number {
  return Number((text ?? '').replace(/[^0-9-]/g, ''))
}

async function physicalRemainingToBottom(page: Page): Promise<number> {
  return page.locator('.conversation-vlist').evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)
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

async function switchSession(page: Page, id: string): Promise<void> {
  await page.getByTestId(`session-${id}`).click()
  await expect(page.getByTestId('active-session-id')).toHaveText(id)
}

test('1M history stays bounded while streaming, reader escape, latest count and reverse prepend remain correct', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })

  await page.goto('/')
  await expect(page.getByTestId('active-session-id')).toHaveText('million')
  await expect(page.getByTestId('logical-count')).toHaveText('1,000,000')

  await expect.poll(async () => numeric(await page.getByTestId('mounted-rows').textContent())).toBeGreaterThan(0)
  expect(numeric(await page.getByTestId('mounted-rows').textContent())).toBeLessThan(180)
  const active = numeric(await page.getByTestId('active-units').textContent())
  expect(active).toBeGreaterThan(2048)
  expect(active).toBeLessThan(10_000)

  await page.locator('.control-group select').selectOption('60')
  await page.getByTestId('stream-start').click()
  await expect.poll(async () => numeric(await page.getByTestId('live-chunks').textContent()), { timeout: 12_000 }).toBeGreaterThan(1)
  await expect.poll(async () => numeric(await page.getByTestId('stream-ticks').textContent())).toBeGreaterThan(30)
  await expect(page.locator('[data-live-unit="true"]').last()).toBeVisible()
  expect(await physicalRemainingToBottom(page)).toBeLessThan(180)

  const publishesBeforeEscape = numeric(await page.getByTestId('stream-ticks').textContent())
  await page.locator('.conversation-vlist').hover()
  await page.mouse.wheel(0, -1200)
  await expect(page.getByTestId('follow-state')).toHaveText('tail paused')
  await expect.poll(() => physicalRemainingToBottom(page)).toBeGreaterThan(400)
  await expect.poll(async () => numeric(await page.getByTestId('stream-ticks').textContent())).toBeGreaterThan(publishesBeforeEscape + 8)

  await page.getByRole('button', { name: 'Pause' }).click()
  await jump(page, 500_000)
  expect(await page.locator('[data-render-unit]').count()).toBeLessThan(180)
  expect(Math.abs(numeric(await page.getByTestId('reader-position').textContent()) - 500_000)).toBeLessThan(35)

  await expect(page.getByTestId('jump-latest')).toBeVisible()
  expect(numeric(await page.getByTestId('messages-after-metric').textContent())).toBeGreaterThan(400_000)

  const anchorBefore = await visibleAnchor(page)
  expect(anchorBefore).not.toBeNull()
  const beforeSegment = await page.getByTestId('segment-range').textContent()
  await page.getByTestId('prepend-button').click()
  await expect.poll(async () => await page.getByTestId('segment-range').textContent()).not.toBe(beforeSegment)

  await expect.poll(async () => {
    const anchor = anchorBefore
    if (!anchor) return Number.POSITIVE_INFINITY
    return page.locator(`[data-render-unit="${anchor.id}"]`).evaluate((element, expectedTop) => {
      const viewport = element.closest('[data-testid="scrollport"]')
      if (!viewport) return Number.POSITIVE_INFINITY
      return Math.abs((element.getBoundingClientRect().top - viewport.getBoundingClientRect().top) - Number(expectedTop))
    }, anchor.top).catch(() => Number.POSITIVE_INFINITY)
  }, { timeout: 12_000 }).toBeLessThan(4)

  await page.getByTestId('jump-latest').click()
  await expect.poll(async () => numeric(await page.getByTestId('messages-after-metric').textContent())).toBeLessThan(10)
  expect(await page.locator('[data-render-unit]').count()).toBeLessThan(180)
  expect(consoleErrors).toEqual([])
})

test('a non-million Recent session renders realistic thinking/tool/code/diff/image/html nodes with isolated IDs', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })

  await page.goto('/')
  await switchSession(page, 'dsh-transport')
  await expect(page.getByTestId('logical-count')).toHaveText('180,000')

  await jump(page, 120_001)
  const scopedRow = page.locator('[data-message-index="120001"]').first()
  await expect(scopedRow).toHaveAttribute('data-session-id', 'dsh-transport')
  await expect(scopedRow).toHaveAttribute('data-render-unit', /^dsh-transport:/)

  let thinking = scopedRow.getByTestId('thinking-block')
  await expect(thinking).toBeVisible()
  const collapsed = await thinking.evaluate(element => element.getBoundingClientRect().height)
  await thinking.locator('button').click()
  thinking = page.locator('[data-message-index="120001"]').first().getByTestId('thinking-block')
  await expect(thinking.locator('.thinking-body')).toBeVisible()
  expect(await thinking.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(collapsed + 40)

  await jump(page, 120_002)
  let tool = page.locator('[data-message-index="120002"]').first().getByTestId('tool-block')
  await tool.locator('.tool-summary').click()
  tool = page.locator('[data-message-index="120002"]').first().getByTestId('tool-block')
  await expect(tool.locator('.tool-detail')).toBeVisible()
  await expect(tool.locator('.tool-pane')).toContainText(/path|rows|query/)

  await jump(page, 120_010)
  let code = page.locator('[data-message-index="120010"]').first().getByTestId('code-block')
  await expect(code.locator('.shiki')).toBeVisible({ timeout: 15_000 })
  const expandCode = code.getByRole('button', { name: 'expand' })
  if (await expandCode.count()) {
    await expandCode.click()
    code = page.locator('[data-message-index="120010"]').first().getByTestId('code-block')
    await expect(code.getByRole('button', { name: 'collapse' })).toBeVisible()
  }

  await jump(page, 120_018)
  let diff = page.locator('[data-message-index="120018"]').first().getByTestId('diff-block')
  await expect(diff.locator('.diff-ellipsis')).toBeVisible()
  await diff.getByRole('button', { name: 'expand' }).click()
  diff = page.locator('[data-message-index="120018"]').first().getByTestId('diff-block')
  await expect(diff.getByRole('button', { name: 'collapse' })).toBeVisible()

  await jump(page, 120_022)
  const html = page.locator('[data-message-index="120022"]').first().locator('.html-card')
  await expect(html).toContainText('Generated interactive artifact')
  expect(await html.locator('script').count()).toBe(0)

  await jump(page, 120_021)
  const image = page.locator('[data-message-index="120021"]').first().locator('.image-card img')
  await expect(image).toBeVisible()
  expect(Number(await image.getAttribute('width'))).toBeGreaterThan(0)
  expect(Number(await image.getAttribute('height'))).toBeGreaterThan(0)

  expect(await page.locator('[data-render-unit]').count()).toBeLessThan(180)
  expect(consoleErrors).toEqual([])
})

test('Recent sessions isolate scroll/fold/stream state, preserve semantic viewport, and keep hot-runtime LRU bounded', async ({ page }) => {
  await page.goto('/')

  await expect.poll(async () => numeric(await page.getByTestId('stream-ticks').textContent())).toBeGreaterThan(3)
  const millionTicks = numeric(await page.getByTestId('stream-ticks').textContent())

  // A running Agent session stays alive off-screen while another session becomes active.
  await switchSession(page, 'dsh-transport')
  await page.waitForTimeout(700)
  await switchSession(page, 'million')
  await expect.poll(async () => numeric(await page.getByTestId('stream-ticks').textContent())).toBeGreaterThan(millionTicks)
  await page.getByRole('button', { name: 'Pause' }).click()

  // Expand one semantic node in session A.
  await jump(page, 120_001)
  let millionThinking = page.locator('[data-message-index="120001"]').first().getByTestId('thinking-block')
  await millionThinking.locator('button').click()
  millionThinking = page.locator('[data-message-index="120001"]').first().getByTestId('thinking-block')
  await expect(millionThinking.locator('.thinking-body')).toBeVisible()

  // Same logical index in B has a different scoped node id and remains collapsed.
  await switchSession(page, 'dsh-transport')
  await jump(page, 120_001)
  const dshThinking = page.locator('[data-message-index="120001"]').first().getByTestId('thinking-block')
  await expect(dshThinking).toBeVisible()
  expect(await dshThinking.locator('.thinking-body').count()).toBe(0)

  // Give B a non-tail reader position, then force it through LRU eviction.
  await jump(page, 90_000)
  const dshReader = numeric(await page.getByTestId('reader-position').textContent())
  expect(Math.abs(dshReader - 90_000)).toBeLessThan(35)

  await switchSession(page, 'tool-rendering')
  await switchSession(page, 'event-normalization')
  await switchSession(page, 'dynamic-heights')
  expect(numeric(await page.getByTestId('hot-sessions').textContent())).toBeLessThanOrEqual(3)

  await switchSession(page, 'dsh-transport')
  await expect.poll(async () => Math.abs(numeric(await page.getByTestId('reader-position').textContent()) - 90_000)).toBeLessThan(45)
  expect(numeric(await page.getByTestId('hot-sessions').textContent())).toBeLessThanOrEqual(3)

  // Session A's disclosure state survives virtual unmount/session switches but does
  // not leak to session B because RenderUnit identity is session-scoped.
  await switchSession(page, 'million')
  await expect.poll(async () => Math.abs(numeric(await page.getByTestId('reader-position').textContent()) - 120_001)).toBeLessThan(45)
  millionThinking = page.locator('[data-message-index="120001"]').first().getByTestId('thinking-block')
  await expect(millionThinking.locator('.thinking-body')).toBeVisible()

  expect(await page.locator('[data-render-unit]').count()).toBeLessThan(180)
})
