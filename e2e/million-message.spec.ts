import { expect, test } from '@playwright/test'

function numeric(text: string | null): number {
  return Number((text ?? '').replace(/[^0-9-]/g, ''))
}

async function visibleAnchor(page: import('@playwright/test').Page): Promise<{ id: string; top: number } | null> {
  return page.getByTestId('scrollport').evaluate((scrollport) => {
    const viewport = scrollport.getBoundingClientRect()
    const rows = [...scrollport.querySelectorAll<HTMLElement>('[data-render-unit]')]
      .map(row => ({ row, rect: row.getBoundingClientRect() }))
      .filter(({ rect }) => rect.bottom > viewport.top && rect.top < viewport.bottom)
      .sort((a, b) => Math.abs(a.rect.top - viewport.top) - Math.abs(b.rect.top - viewport.top))
    const first = rows[0]
    if (!first) return null
    return {
      id: first.row.dataset.renderUnit ?? '',
      top: first.rect.top - viewport.top,
    }
  })
}

test('one million logical messages keep the physical DOM bounded and interactive', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })

  await page.goto('/')
  await expect(page.getByTestId('logical-count')).toHaveText('1,000,000')

  const mounted = numeric(await page.getByTestId('mounted-rows').textContent())
  const active = numeric(await page.getByTestId('active-units').textContent())
  expect(mounted).toBeLessThan(180)
  expect(active).toBeLessThan(10_000)
  expect(active).toBeGreaterThan(2048)

  await page.getByTestId('jump-input').fill('500000')
  await page.getByTestId('jump-button').click()

  const range = (await page.getByTestId('segment-range').textContent()) ?? ''
  const [startText, endText] = range.split('–')
  const start = numeric(startText)
  const end = numeric(endText)
  expect(start).toBeLessThanOrEqual(500_000)
  expect(end).toBeGreaterThanOrEqual(500_000)

  const reader = numeric(await page.getByTestId('reader-position').textContent())
  expect(Math.abs(reader - 500_000)).toBeLessThan(20)
  expect(await page.locator('[data-render-unit]').count()).toBeLessThan(180)

  await page.getByTestId('stream-start').click()
  await expect.poll(async () => numeric(await page.getByTestId('stream-ticks').textContent())).toBeGreaterThan(5)
  await page.getByRole('button', { name: 'Stop' }).click()

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
  }, { timeout: 10_000 }).toBeLessThan(4)

  await page.getByTestId('scrollport').evaluate(element => { element.scrollTop += 700 })
  await page.waitForTimeout(250)
  expect(await page.locator('[data-render-unit]').count()).toBeLessThan(180)
  expect(consoleErrors).toEqual([])
})
