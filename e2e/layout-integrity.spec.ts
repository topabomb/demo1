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
  await expect.poll(async () => page.locator(`[data-message-index="${index}"]`).count(), { timeout: 15_000 }).toBeGreaterThan(0)
}

async function maxMountedRowOverlap(page: Page): Promise<number> {
  return page.getByTestId('scrollport').evaluate((viewport) => {
    const rows = [...viewport.querySelectorAll<HTMLElement>('[data-render-unit]')]
      .map(row => ({ id: row.dataset.renderUnit ?? '', rect: row.getBoundingClientRect() }))
      .filter(entry => entry.rect.height > 0)
      .sort((a, b) => a.rect.top - b.rect.top)

    let overlap = 0
    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1]!
      const current = rows[i]!
      overlap = Math.max(overlap, previous.rect.bottom - current.rect.top)
    }
    return overlap
  })
}

async function expectRowsDisjoint(page: Page): Promise<void> {
  await expect.poll(() => maxMountedRowOverlap(page), { timeout: 12_000 }).toBeLessThanOrEqual(1)
}

test('architecture proof is visible and links to the same interactive reference implementation', async ({ page }) => {
  await openLab(page)
  await page.getByTestId('architecture-link').click()
  await expect(page.getByTestId('architecture-page')).toBeVisible()
  await expect(page.getByRole('heading', { name: /four lifecycles/i })).toBeVisible()
  await expect(page.getByText('Backend Adapter', { exact: true })).toBeVisible()
  await expect(page.getByText('Conversation Engine', { exact: true })).toBeVisible()
  await expect(page.getByText('Projection Store', { exact: true })).toBeVisible()
  await expect(page.getByText('Viewport Controller', { exact: true })).toBeVisible()
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
  await expect(page.locator('[data-message-index="120010"] .shiki')).toBeVisible({ timeout: 15_000 })
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
