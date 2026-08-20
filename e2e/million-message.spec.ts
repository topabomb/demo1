import { expect, test } from '@playwright/test'

test('one million logical messages keep the physical DOM bounded and interactive', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })

  await page.goto('/')
  await expect(page.getByTestId('logical-count')).toHaveText('1,000,000')

  const mounted = Number((await page.getByTestId('mounted-rows').textContent()) ?? '9999')
  const active = Number(((await page.getByTestId('active-units').textContent()) ?? '99999').replaceAll(',', ''))
  expect(mounted).toBeLessThan(180)
  expect(active).toBeLessThan(10_000)
  expect(active).toBeGreaterThan(2048)

  await page.getByTestId('jump-input').fill('500000')
  await page.getByTestId('jump-button').click()
  await expect(page.getByTestId('reader-position')).toContainText('500,000')

  const rowsAfterJump = await page.locator('[data-render-unit]').count()
  expect(rowsAfterJump).toBeLessThan(180)

  await page.getByTestId('stream-start').click()
  await expect.poll(async () => Number(await page.getByTestId('stream-ticks').textContent())).toBeGreaterThan(5)

  const beforeSegment = await page.getByTestId('segment-range').textContent()
  await page.getByTestId('prepend-button').click()
  await expect.poll(async () => await page.getByTestId('segment-range').textContent()).not.toBe(beforeSegment)

  await page.getByTestId('scrollport').evaluate(element => { element.scrollTop += 700 })
  await page.waitForTimeout(250)
  expect(await page.locator('[data-render-unit]').count()).toBeLessThan(180)
  expect(consoleErrors).toEqual([])
})
