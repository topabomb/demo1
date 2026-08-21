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
  await expect.poll(async () => numeric(await page.getByTestId('reader-position').textContent()), { timeout: 15_000 }).toBe(index)
}

async function assertNoRowOverlap(page: Page): Promise<void> {
  await expect.poll(async () => page.getByTestId('scrollport').evaluate(stage => {
    const viewport = stage.getBoundingClientRect()
    const rows = [...stage.querySelectorAll<HTMLElement>('[data-virtual-item="true"]')]
      .map(row => row.getBoundingClientRect())
      .filter(rect => rect.height > 0 && rect.bottom > viewport.top && rect.top < viewport.bottom)
      .sort((a, b) => a.top - b.top)
    let worst = 0
    for (let i = 1; i < rows.length; i += 1) worst = Math.max(worst, rows[i - 1]!.bottom - rows[i]!.top)
    return worst
  }), { timeout: 12_000 }).toBeLessThanOrEqual(1)
}

async function bodyOverflow(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth)
}

test('public Agent scenarios entry exposes the canonical gallery without requiring diagnostics', async ({ page }) => {
  await openApp(page)
  const launch = page.getByTestId('scenario-launch')
  await expect(launch).toBeVisible()
  await launch.click()
  await expect(page.getByTestId('active-session-id')).toHaveText('dsh-transport')
  await expect(page.getByTestId('logical-count')).toHaveText('180,013')
  const summary = page.locator('[data-message-index="180012"]').getByTestId('markdown-block')
  await expect(summary).toBeVisible({ timeout: 15_000 })
  await expect(summary).toContainText('Media workflows verified')
})

test('live reasoning can expand during streaming and collapse without corrupting virtual geometry', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('new-session').click()
  await expect(page.getByTestId('active-session-id')).toHaveText('new-1')

  await page.locator('.control-group select').selectOption('5')
  const composer = page.getByTestId('composer-input')
  await composer.fill('Reason carefully about a variable-height Agent response, then answer in Markdown.')
  await page.locator('.send-button').click()

  await expect(page.locator('[data-message-index="1"]').getByTestId('thinking-block')).toBeVisible({ timeout: 15_000 })
  const thinking = page.locator('[data-message-index="1"]').getByTestId('thinking-block')
  await expect(thinking).toHaveAttribute('data-status', 'streaming')
  const collapsedHeight = await thinking.evaluate(element => element.getBoundingClientRect().height)

  await thinking.locator('.disclosure-head').click()
  await expect(thinking.locator('.thinking-body')).toBeVisible()
  const firstLength = (await thinking.locator('.thinking-body').textContent())?.length ?? 0
  const openHeightBefore = await thinking.evaluate(element => element.getBoundingClientRect().height)
  const ticksBefore = numeric(await page.getByTestId('stream-ticks').textContent())

  await expect.poll(async () => numeric(await page.getByTestId('stream-ticks').textContent()), { timeout: 12_000 }).toBeGreaterThan(ticksBefore + 7)
  await expect.poll(async () => (await thinking.locator('.thinking-body').textContent())?.length ?? 0, { timeout: 12_000 }).toBeGreaterThan(firstLength)
  const openHeightAfter = await thinking.evaluate(element => element.getBoundingClientRect().height)
  expect(openHeightAfter).toBeGreaterThanOrEqual(openHeightBefore)
  expect(openHeightAfter).toBeGreaterThan(collapsedHeight + 20)
  await assertNoRowOverlap(page)

  await thinking.locator('.disclosure-head').click()
  await expect(thinking.locator('.thinking-body')).toHaveCount(0)
  const collapsedAgain = await thinking.evaluate(element => element.getBoundingClientRect().height)
  expect(collapsedAgain).toBeLessThan(openHeightAfter)
  expect(Math.abs(collapsedAgain - collapsedHeight)).toBeLessThan(12)
  expect(await bodyOverflow(page)).toBeLessThanOrEqual(1)
  await assertNoRowOverlap(page)
})

test('uploads, image generation, TTS and ASR compose tool execution with durable media artifacts', async ({ page }) => {
  await openApp(page)
  await switchSession(page, 'dsh-transport')
  await page.getByTestId('inject-agent-scenarios').click()
  await expect(page.getByTestId('logical-count')).toHaveText('180,013')

  await jump(page, 180_000)
  const singleUpload = page.locator('[data-message-index="180000"]').getByTestId('attachments-block')
  await expect(singleUpload.getByTestId('attachment-image')).toHaveCount(1)
  await expect(singleUpload).toContainText('Single image upload')

  await jump(page, 180_001)
  const multiUpload = page.locator('[data-message-index="180001"]').getByTestId('attachments-block')
  await expect(multiUpload.getByTestId('attachment-image')).toHaveCount(2)
  await expect(multiUpload.getByTestId('attachment-file')).toHaveCount(2)
  await expect(multiUpload).toContainText('requirements.pdf')
  await expect(multiUpload).toContainText('meeting.m4a')

  await jump(page, 180_003)
  const imageCall = page.locator('[data-message-index="180003"]').getByTestId('tool-block')
  await expect(imageCall).toHaveAttribute('data-category', 'image-generation')
  await expect(imageCall).toContainText('image-gen-reference-v2')
  await imageCall.locator('.tool-summary').click()
  await expect(imageCall.locator('.tool-detail')).toContainText('compact futuristic agent workstation')
  await expect(imageCall.locator('.tool-progress')).toBeVisible()

  await jump(page, 180_005)
  const generated = page.locator('[data-message-index="180005"]').getByTestId('attachments-block')
  await expect(generated.getByTestId('attachment-image')).toHaveCount(4)
  await expect(generated.getByTestId('media-prompt')).toContainText('compact futuristic agent workstation')
  await expect(generated).toContainText('image-gen-reference-v2')
  await expect(generated).toContainText('image_gen_1')

  await jump(page, 180_008)
  const tts = page.locator('[data-message-index="180008"]').getByTestId('audio-block')
  await expect(tts).toContainText('Generated speech')
  await expect(tts.getByTestId('audio-waveform')).toBeVisible()
  await expect(tts.getByTestId('audio-transcript')).toContainText('framework keeps media artifacts independent')

  await jump(page, 180_009)
  const asrInput = page.locator('[data-message-index="180009"]').getByTestId('audio-block')
  await expect(asrInput).toContainText('Voice message')
  await expect(asrInput.getByTestId('audio-transcript')).toContainText('uploaded meeting recording')

  await jump(page, 180_011)
  const asrResult = page.locator('[data-message-index="180011"]').getByTestId('tool-block')
  await expect(asrResult).toHaveAttribute('data-category', 'asr')
  await asrResult.locator('.tool-summary').click()
  await expect(asrResult.locator('.tool-detail')).toContainText('confidence')
  await expect(asrResult.locator('.tool-detail')).toContainText('0.97')

  await page.setViewportSize({ width: 390, height: 844 })
  await jump(page, 180_005)
  const imagesFit = await generated.getByTestId('attachment-image').evaluateAll(elements => elements.every(element => {
    const image = element.querySelector('img')
    const row = element.closest<HTMLElement>('[data-virtual-item="true"]')
    return Boolean(image && row && image.getBoundingClientRect().width <= row.getBoundingClientRect().width + 1)
  }))
  expect(imagesFit).toBe(true)
  expect(await bodyOverflow(page)).toBeLessThanOrEqual(1)
  await assertNoRowOverlap(page)
})

test('repeated heterogeneous scenario packs keep projection and mounted DOM bounded', async ({ page }) => {
  await openApp(page)
  await switchSession(page, 'dsh-transport')
  for (let i = 0; i < 6; i += 1) {
    await page.getByTestId('inject-agent-scenarios').click()
    await expect(page.getByTestId('logical-count')).toHaveText((180_000 + (i + 1) * 13).toLocaleString('en-US'))
  }

  expect(numeric(await page.getByTestId('mounted-rows').textContent())).toBeLessThan(180)
  expect(numeric(await page.getByTestId('projection-cache').textContent())).toBeLessThanOrEqual(4096)
  expect(numeric(await page.getByTestId('active-units').textContent())).toBeLessThan(5000)
  expect(await bodyOverflow(page)).toBeLessThanOrEqual(1)
  await assertNoRowOverlap(page)
})