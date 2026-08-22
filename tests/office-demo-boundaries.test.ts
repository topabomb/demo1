import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const engineModel = () => readFileSync(resolve(root, 'src/engine/model/conversation.ts'), 'utf8')
const engineContracts = () => readFileSync(resolve(root, 'src/engine/conversation/contracts.ts'), 'utf8')
const officeScenarios = () => readFileSync(resolve(root, 'src/demo/office-scenarios.ts'), 'utf8')
const diagnostics = () => readFileSync(resolve(root, 'src/demo/components/DemoDiagnosticsPanel.vue'), 'utf8')
const workspace = () => readFileSync(resolve(root, 'src/demo/components/AgentWorkspace.vue'), 'utf8')

describe('office Demo responsibility boundary', () => {
  it('reuses generic rendering semantics instead of adding connector or office workflow types to Engine', () => {
    const core = `${engineModel()}\n${engineContracts()}`
    expect(core).not.toMatch(/Gmail|Outlook|GoogleCalendar|MicrosoftGraph|Office365|WorkspaceConnector|MailAction|CalendarAction|SchedulePrompt|OfficeArtifact/)
    expect(core).not.toMatch(/sendEmail|createEvent|scheduleMeeting|connectorAuth|recurringTask/)

    const demo = officeScenarios()
    expect(demo).toContain("'plan'")
    expect(demo).toContain("'tool-call'")
    expect(demo).toContain("'tool-result'")
    expect(demo).toContain("'delegation'")
    expect(demo).toContain("'attachments'")
    expect(demo).toContain('ResourceRef')
    expect(demo).toContain('external side effects remain producer/host responsibilities')
    expect(demo).toContain('external adapter owns the actual side effect and any provider continuation')
    expect(demo).toContain("callId: 'meeting-followup-approval'")
    expect(demo).not.toMatch(/callId: 'meeting-followup-approval'[^\n]*status: 'running'/)
  })

  it('keeps scenario navigation and replay controls entirely in Demo', () => {
    expect(diagnostics()).toContain('Demo scenarios')
    expect(diagnostics()).toContain('demo-office-briefing')
    expect(diagnostics()).toContain('demo-office-followup')
    expect(diagnostics()).toContain('demo-agent-delegation')
    expect(workspace()).toContain('window.location.reload()')
    expect(workspace()).toContain('AGENT_DEMO_MESSAGE')

    const core = `${engineModel()}\n${engineContracts()}`
    expect(core).not.toMatch(/restart-agent|office-briefing|office-followup|AGENT_DEMO_MESSAGE/)
  })
})
