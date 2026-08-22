import { expect, test, type Page } from '@playwright/test'

function numeric(text: string | null): number {
  return Number((text ?? '').replace(/[^0-9.-]/g, ''))
}

async function logicalCount(page: Page): Promise<number> {
  return numeric(await page.getByTestId('logical-count').textContent())
}

async function jump(page: Page, index: number): Promise<void> {
  await page.getByTestId('jump-input').fill(String(index))
  await page.getByTestId('jump-button').click()
  await expect(page.getByTestId('reader-position')).toContainText(`#${index.toLocaleString()}`)
}

test('diagnostics shortcuts expose the live Plan, delegation and terminal evidence', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByTestId('demo-restart-agent')).toBeVisible()
  await expect(page.getByTestId('demo-office-briefing')).toBeVisible()
  await expect(page.getByTestId('demo-office-followup')).toBeVisible()

  await page.getByRole('button', { name: 'Pause' }).click()
  await page.getByLabel('Stream rate').selectOption('60')
  await page.getByTestId('stream-start').click()
  await expect.poll(() => logicalCount(page), { timeout: 20_000 }).toBeGreaterThanOrEqual(84_009)
  await page.getByRole('button', { name: 'Pause' }).click()

  await page.getByTestId('demo-agent-delegation').click()
  await expect(page.getByTestId('active-session-id')).toHaveText('agent-loop')
  await expect(page.getByTestId('delegation-block')).toContainText('Delegated verification')

  await page.getByTestId('demo-agent-terminal').click()
  await expect(page.getByTestId('terminal-block')).toContainText('pnpm test')

  await page.getByTestId('demo-agent-plan').click()
  await expect(page.getByTestId('plan-block')).toContainText('Release regression investigation')
})

test('executive briefing demonstrates cross-source research, parallel specialists and office deliverables', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('demo-office-briefing').click()
  await expect(page.getByTestId('active-session-id')).toHaveText('office-briefing')
  await expect(page.locator('.conversation-title')).toContainText('Monday executive briefing')

  await jump(page, 61_994)
  const plan = page.locator('[data-message-index="61994"]').getByTestId('plan-block')
  await expect(plan.locator('[data-plan-status="completed"]')).toHaveCount(4)

  await jump(page, 61_995)
  const sources = page.locator('[data-message-index="61995"]').getByTestId('tool-block')
  await expect(sources).toHaveAttribute('data-presentation-kind', 'resources')
  await sources.locator('.tool-summary').click()
  await expect(sources.getByTestId('tool-resources')).toContainText('Launch risk email thread')
  await expect(sources.getByTestId('tool-resources')).toContainText('QBR review meeting')
  await expect(sources.getByTestId('tool-resources')).toContainText('Q3 metrics workbook')
  await expect(sources.getByTestId('tool-resources')).toContainText('Competitor launch update')

  await jump(page, 61_997)
  const delegation = page.locator('[data-message-index="61997"]').getByTestId('delegation-block')
  await expect(delegation.locator('[data-status="completed"]')).toHaveCount(3)
  await expect(delegation.locator('[data-mode="background"]')).toHaveCount(2)

  await jump(page, 61_998)
  await expect(page.locator('[data-message-index="61998"]').getByTestId('markdown-block')).toContainText('Decisions needed')

  await jump(page, 61_999)
  const deliverables = page.locator('[data-message-index="61999"]')
  await expect(deliverables).toContainText('Monday Executive Briefing.docx')
  await expect(deliverables).toContainText('QBR Decision Review.pptx')
  await expect(deliverables).toContainText('KPI Snapshot.xlsx')
})

test('meeting follow-up demonstrates a session-owned approval before external office actions', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('demo-office-followup').click()
  await expect(page.getByTestId('active-session-id')).toHaveText('office-followup')
  await expect(page.getByTestId('pending-interaction')).toHaveAttribute('data-kind', 'approval')
  await expect(page.getByTestId('pending-interaction')).toContainText('Approve follow-up and Friday review')
  await expect(page.getByTestId('approve-interaction')).toBeVisible()
  await expect(page.getByTestId('deny-interaction')).toBeVisible()

  await jump(page, 35_994)
  const plan = page.locator('[data-message-index="35994"]').getByTestId('plan-block')
  await expect(plan.locator('[data-plan-status="blocked"]')).toContainText('Send message and schedule review')

  await jump(page, 35_998)
  const action = page.locator('[data-message-index="35998"]').getByTestId('tool-block')
  await expect(action).toHaveAttribute('data-category', 'productivity')
  await expect(action).toHaveAttribute('data-call-id', 'meeting-followup-approval')
  await expect(action).toContainText('send_meeting_followup')

  await page.getByTestId('deny-interaction').click()
  await expect(page.getByTestId('pending-interaction')).toHaveCount(0)
  await expect(page.getByTestId('composer-input')).toBeEnabled()
})
