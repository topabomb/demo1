import { expect, test, type Page } from '@playwright/test'

function numeric(text: string | null): number { return Number((text ?? '').replace(/[^0-9-]/g, '')) }
async function open(page: Page) { await page.goto('./'); await expect(page.getByTestId('active-session-id')).toBeVisible() }
async function switchTo(page: Page, id: string) { await page.getByTestId(`session-${id}`).click(); await expect(page.getByTestId('active-session-id')).toHaveText(id) }
async function send(page: Page, text: string) { const input = page.getByTestId('composer-input'); await input.fill(text); await input.press('Enter') }

test('many asynchronous SessionKernels outlive the 3-hot viewport LRU', async ({ page }) => {
  await open(page)
  for (const [id, prompt] of [
    ['dsh-transport', 'continue DSH transport analysis'],
    ['event-normalization', 'normalize the next provider event'],
    ['workspace-files', 'inspect workspace files'],
    ['dynamic-heights', 'resume the interrupted layout investigation'],
  ] as const) {
    await switchTo(page, id)
    await send(page, prompt)
    await expect(page.locator('.run-status')).toContainText('working')
  }

  expect(numeric(await page.getByTestId('running-kernels').textContent())).toBeGreaterThanOrEqual(5)
  expect(numeric(await page.getByTestId('hot-sessions').textContent())).toBeLessThanOrEqual(3)
  await expect(page.getByTestId('session-dsh-transport')).toContainText('Working')
  await expect(page.getByTestId('session-dsh-transport')).toHaveClass(/unread/)

  await switchTo(page, 'dsh-transport')
  await expect(page.getByTestId('logical-count')).toHaveText('180,002')
  await expect.poll(async () => numeric(await page.getByTestId('stream-ticks').textContent())).toBeGreaterThan(2)
  expect(numeric(await page.getByTestId('hot-sessions').textContent())).toBeLessThanOrEqual(3)
})

test('a historical conversation can be resumed, stopped, resumed again, evicted and restored', async ({ page }) => {
  await open(page)
  await switchTo(page, 'event-normalization')
  await expect(page.getByTestId('logical-count')).toHaveText('95,000')

  await send(page, 'first continuation after historical restore')
  await expect(page.getByTestId('logical-count')).toHaveText('95,002')
  await page.getByTestId('composer-stop').click()
  await expect(page.locator('.run-status')).toContainText('interrupted')

  await send(page, 'second continuation after stopping the first run')
  await expect(page.getByTestId('logical-count')).toHaveText('95,004')
  await expect(page.locator('[data-message-index="95002"]')).toContainText('second continuation')

  for (const id of ['dsh-transport', 'workspace-files', 'dynamic-heights', 'context-cache']) await switchTo(page, id)
  expect(numeric(await page.getByTestId('hot-sessions').textContent())).toBeLessThanOrEqual(3)

  await switchTo(page, 'event-normalization')
  await expect(page.getByTestId('logical-count')).toHaveText('95,004')
  await expect(page.locator('[data-message-index="95002"]')).toContainText('second continuation')
  await expect.poll(async () => numeric(await page.getByTestId('stream-ticks').textContent())).toBeGreaterThan(1)
})

test('pending approval is session-owned and survives switching plus viewport eviction', async ({ page }) => {
  await open(page)
  await switchTo(page, 'tool-rendering')
  await expect(page.getByTestId('pending-interaction')).toContainText('Approve workspace edit')

  for (const id of ['dsh-transport', 'event-normalization', 'workspace-files', 'dynamic-heights']) await switchTo(page, id)
  await switchTo(page, 'tool-rendering')
  await expect(page.getByTestId('pending-interaction')).toBeVisible()
  await page.getByTestId('approve-interaction').click()
  await expect(page.getByTestId('pending-interaction')).toHaveCount(0)
  await expect(page.locator('.run-status')).toContainText('idle')

  await send(page, 'continue after approval')
  await expect(page.getByTestId('logical-count')).toHaveText('420,002')
  await expect(page.locator('.run-status')).toContainText('working')
})

test('working sessions queue follow-ups independently of the mounted viewport', async ({ page }) => {
  await open(page)
  await expect(page.locator('.run-status')).toContainText('working')
  await send(page, 'follow up after the current million-message run')
  await expect(page.getByTestId('queue-banner')).toContainText('1 follow-up')
  await expect(page.getByTestId('queued-prompts')).toHaveText('1')

  await switchTo(page, 'dsh-transport')
  await expect(page.getByTestId('session-million')).toContainText('1 queued')
  await switchTo(page, 'million')
  await expect(page.getByTestId('queue-banner')).toContainText('1 follow-up')
})

test('New session is a real empty resumable conversation and session search is functional', async ({ page }) => {
  await open(page)
  await page.getByTestId('new-session').click()
  await expect(page.getByTestId('active-session-id')).toHaveText('new-1')
  await expect(page.getByTestId('empty-conversation')).toBeVisible()
  await send(page, 'implement a fresh agent task')
  await expect(page.getByTestId('logical-count')).toHaveText('2')
  await expect(page.locator('[data-message-index="0"]')).toContainText('implement a fresh agent task')

  await page.getByTestId('session-search').fill('New agent session')
  await expect(page.getByTestId('session-new-1')).toBeVisible()
  await expect(page.getByTestId('session-dsh-transport')).toHaveCount(0)
})
