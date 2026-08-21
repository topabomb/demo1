import { expect, test, type Page } from '@playwright/test'

async function openLab(page: Page): Promise<void> {
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
  await expect.poll(async () => Number((await page.getByTestId('reader-position').textContent() ?? '').replace(/[^0-9-]/g, '')), { timeout: 15_000 }).toBe(index)
  await settleNavigationFrames(page)
}

async function settleNavigationFrames(page: Page, count = 5): Promise<void> {
  await page.evaluate((frames) => new Promise<void>(resolve => {
    let remaining = frames
    const next = () => {
      remaining -= 1
      if (remaining <= 0) resolve()
      else requestAnimationFrame(next)
    }
    requestAnimationFrame(next)
  }), count)
}

async function maxMountedRowOverlap(page: Page): Promise<number> {
  return page.getByTestId('scrollport').evaluate((viewport) => {
    const rows = [...viewport.querySelectorAll<HTMLElement>('[data-virtual-item="true"]')]
      .map(row => ({ id: row.dataset.renderUnit ?? '', rect: row.getBoundingClientRect() }))
      .filter(entry => entry.rect.height > 0)
      .sort((a, b) => a.rect.top - b.rect.top)
    let overlap = 0
    for (let i = 1; i < rows.length; i += 1) overlap = Math.max(overlap, rows[i - 1]!.rect.bottom - rows[i]!.rect.top)
    return overlap
  })
}

async function expectRowsDisjoint(page: Page): Promise<void> {
  await expect.poll(() => maxMountedRowOverlap(page), { timeout: 12_000 }).toBeLessThanOrEqual(1)
}

async function committedAnchor(page: Page): Promise<{ id: string; top: number } | null> {
  return page.getByTestId('scrollport').evaluate((stage) => {
    const readerText = document.querySelector('[data-testid="reader-position"]')?.textContent ?? ''
    const reader = Number(readerText.replace(/[^0-9-]/g, ''))
    const viewport = stage.getBoundingClientRect()
    const row = [...stage.querySelectorAll<HTMLElement>('[data-virtual-item="true"]')]
      .map(element => ({ element, index: Number(element.dataset.messageIndex), rect: element.getBoundingClientRect() }))
      .filter(entry => entry.index <= reader + 1 && entry.rect.bottom > viewport.top && entry.rect.top < viewport.bottom)
      .sort((a, b) => Math.abs(a.rect.top - viewport.top) - Math.abs(b.rect.top - viewport.top))[0]
    return row ? { id: row.element.dataset.renderUnit ?? '', top: row.rect.top - viewport.top } : null
  })
}

async function anchorDrift(page: Page, anchor: { id: string; top: number }): Promise<number> {
  return page.getByTestId('scrollport').evaluate((stage, expected) => {
    const row = [...stage.querySelectorAll<HTMLElement>('[data-render-unit]')].find(element => element.dataset.renderUnit === expected.id)
    if (!row) return Number.POSITIVE_INFINITY
    return Math.abs((row.getBoundingClientRect().top - stage.getBoundingClientRect().top) - expected.top)
  }, anchor)
}

test('architecture proof exposes state lifetimes and portable contracts', async ({ page }) => {
  await openLab(page)
  await page.getByTestId('architecture-link').click()
  await expect(page.getByTestId('architecture-page')).toBeVisible()
  await expect(page.getByRole('heading', { name: /four state lifetimes/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /seven contracts/i })).toBeVisible()
  for (const name of ['Backend / Runtime Ports', 'Canonical Conversation Model', 'Session + Workspace Kernel', 'Projection Runtime', 'Semantic Viewport Policy', 'Physical List Adapter', 'Renderer + Product Adapter']) {
    await expect(page.getByText(name, { exact: true })).toBeVisible()
  }
  for (const name of ['Durable domain state', 'Session interaction memory', 'Rebuildable presentation state', 'Ephemeral physical state']) {
    await expect(page.getByText(name, { exact: true })).toBeVisible()
  }
  await expect(page.getByText(/O\(delta \+ mutable Markdown tail\)/)).toBeVisible()
  await page.getByTestId('launch-lab').click()
  await expect(page.getByTestId('active-session-id')).toBeVisible()
})

test('dynamic heterogeneous rows never overlap after disclosure, async measurement, composer resize and session remount', async ({ page }) => {
  await openLab(page)
  await switchSession(page, 'dsh-transport')

  await jump(page, 120_001)
  await expectRowsDisjoint(page)
  const thinking = page.locator('[data-message-index="120001"]').first().getByTestId('thinking-block')
  await thinking.locator('button').click()
  await expect(thinking.locator('.thinking-body')).toBeVisible()
  await expectRowsDisjoint(page)

  await jump(page, 120_002)
  const tool = page.locator('[data-message-index="120002"]').first().getByTestId('tool-block')
  await tool.locator('.tool-summary').click()
  await expect(tool.locator('.tool-detail')).toBeVisible()
  await expectRowsDisjoint(page)

  await jump(page, 120_010)
  const codeUnits = page.locator('[data-message-index="120010"] .shiki')
  await expect.poll(() => codeUnits.count(), { timeout: 15_000 }).toBeGreaterThan(0)
  await expect(codeUnits.first()).toBeVisible()
  await expectRowsDisjoint(page)

  const composer = page.getByTestId('composer-input')
  await composer.fill(Array.from({ length: 12 }, (_, i) => `line ${i} ${'dynamic agent content '.repeat(8)}`).join('\n'))
  await expect.poll(async () => composer.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(100)
  await expectRowsDisjoint(page)

  await switchSession(page, 'event-normalization')
  await expectRowsDisjoint(page)
  await switchSession(page, 'dsh-transport')
  await expectRowsDisjoint(page)
})

test('semantic viewport survives a different product layout and composer height policy', async ({ page }) => {
  await openLab(page)
  await switchSession(page, 'event-normalization')
  await jump(page, 50_000)

  await expect.poll(async () => page.getByTestId('scrollport').evaluate(stage => {
    const viewport = stage.getBoundingClientRect()
    const element = [...stage.querySelectorAll<HTMLElement>('[data-virtual-item="true"]')].find(row => {
      const rect = row.getBoundingClientRect()
      return rect.height > 0 && rect.bottom > viewport.top && rect.top < viewport.bottom
    })
    if (!element) return null
    const style = getComputedStyle(element)
    return { paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, marginTop: style.marginTop, marginBottom: style.marginBottom }
  }), { timeout: 12_000 }).toEqual({ paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px' })

  const before = await committedAnchor(page)
  expect(before).not.toBeNull()
  const stageHeightBefore = await page.getByTestId('scrollport').evaluate(element => element.getBoundingClientRect().height)

  await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('.agent-app')!.style
    const engine = document.querySelector<HTMLElement>('[data-conversation-engine]')!.style
    app.setProperty('--session-sidebar-width', '328px')
    engine.setProperty('--conversation-content-width', '720px')
    engine.setProperty('--conversation-row-gap', '12px')
    engine.setProperty('--composer-max-height', '240px')
  })

  const composer = page.getByTestId('composer-input')
  await composer.fill(Array.from({ length: 18 }, (_, i) => `portable layout line ${i} ${'content '.repeat(18)}`).join('\n'))
  await expect.poll(async () => composer.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(180)
  await expect.poll(async () => page.getByTestId('scrollport').evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(stageHeightBefore)

  const noOverlay = await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('[data-testid="scrollport"]')!.getBoundingClientRect()
    const composerRect = document.querySelector<HTMLElement>('[data-testid="composer-shell"]')!.getBoundingClientRect()
    return stage.bottom <= composerRect.top + 1
  })
  expect(noOverlay).toBe(true)
  await expectRowsDisjoint(page)
  await expect.poll(() => anchorDrift(page, before!), { timeout: 12_000 }).toBeLessThan(4)
})

test('engine styling stays scoped under hostile host element rules', async ({ page }) => {
  await openLab(page)
  await switchSession(page, 'event-normalization')
  await jump(page, 50_000)

  const baselineHeader = await page.locator('.conversation-header').evaluate(element => element.getBoundingClientRect().height)
  const baselineComposer = await page.getByTestId('composer-input').evaluate(element => element.getBoundingClientRect().height)

  const hostProbe = await page.evaluate(() => {
    const probe = document.createElement('button')
    probe.id = 'host-style-probe'
    probe.textContent = 'host'
    document.body.appendChild(probe)
    const style = document.createElement('style')
    style.id = 'hostile-host-style'
    style.textContent = `
      button, input, textarea, select { padding: 31px; border-width: 9px; font-size: 28px; line-height: 3; box-sizing: content-box; }
      img { width: 2000px; max-width: none; }
      table { width: 1800px; max-width: none; }
    `
    document.head.appendChild(style)
    return probe.getBoundingClientRect().height
  })
  expect(hostProbe).toBeGreaterThan(100)
  await settleNavigationFrames(page)

  await expect(page.locator('[data-conversation-engine]')).toHaveAttribute('data-conversation-engine', 'vue')
  await expect.poll(async () => page.locator('.conversation-header').evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(baselineHeader + 2)
  await expect.poll(async () => page.getByTestId('composer-input').evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(baselineComposer + 4)
  await expectRowsDisjoint(page)

  const geometry = await page.evaluate(() => {
    const engine = document.querySelector<HTMLElement>('[data-conversation-engine]')!
    const stage = document.querySelector<HTMLElement>('[data-testid="scrollport"]')!
    const composerRect = document.querySelector<HTMLElement>('[data-testid="composer-shell"]')!.getBoundingClientRect()
    const stageRect = stage.getBoundingClientRect()
    return {
      pageOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      engineOverflow: Math.max(0, engine.scrollWidth - engine.clientWidth),
      overlay: stageRect.bottom - composerRect.top,
    }
  })
  expect(geometry.pageOverflow).toBeLessThanOrEqual(1)
  expect(geometry.engineOverflow).toBeLessThanOrEqual(1)
  expect(geometry.overlay).toBeLessThanOrEqual(1)
})
