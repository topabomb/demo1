import { describe, expect, it } from 'vitest'
import { DemoWorkspaceRuntime, HOT_SESSION_LIMIT } from '../src/demo/workspace-runtime'

describe('DemoWorkspaceRuntime lifecycle split', () => {
  it('bounds heavyweight runtimes even when multiple kernels are working', () => {
    const workspace = new DemoWorkspaceRuntime()
    try {
      for (const id of ['dsh-transport', 'event-normalization', 'workspace-files']) {
        workspace.executionFor(id).submit(`run ${id}`)
        workspace.activate(id)
      }
      workspace.activate('dynamic-heights')
      expect(workspace.runningSessionCount).toBeGreaterThanOrEqual(4)
      expect(workspace.hotSessionCount).toBeLessThanOrEqual(HOT_SESSION_LIMIT)
      expect(workspace.kernelFor('million').status).toBe('working')
    } finally {
      workspace.dispose()
    }
  })

  it('evicts a working viewport without destroying its execution kernel', async () => {
    const workspace = new DemoWorkspaceRuntime()
    try {
      workspace.activate('dsh-transport')
      const execution = workspace.executionFor('dsh-transport')
      execution.submit('keep running offscreen')
      const before = execution.publishTicks
      workspace.activate('event-normalization')
      workspace.activate('workspace-files')
      workspace.activate('dynamic-heights')
      expect(workspace.hasHotRuntime('dsh-transport')).toBe(false)
      expect(workspace.kernelFor('dsh-transport').status).toBe('working')
      await new Promise(resolve => setTimeout(resolve, 80))
      expect(execution.publishTicks).toBeGreaterThan(before)
    } finally {
      workspace.dispose()
    }
  })

  it('persists approval state and can create a resumable empty session', () => {
    const workspace = new DemoWorkspaceRuntime()
    try {
      expect(workspace.kernelFor('tool-rendering').pendingInteraction?.kind).toBe('approval')
      workspace.activate('tool-rendering')
      workspace.activate('event-normalization')
      workspace.activate('workspace-files')
      workspace.activate('dynamic-heights')
      expect(workspace.kernelFor('tool-rendering').pendingInteraction?.kind).toBe('approval')

      const id = workspace.createSession()
      workspace.activate(id)
      expect(workspace.activeSession.logicalCount).toBe(0)
      expect(workspace.executionFor(id).submit('first real prompt')).toBe('started')
      expect(workspace.kernelFor(id).count).toBe(2)
    } finally {
      workspace.dispose()
    }
  })
})
