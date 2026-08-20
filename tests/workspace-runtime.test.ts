import { describe, expect, it } from 'vitest'
import { ConversationWorkspaceRuntime, HOT_SESSION_LIMIT } from '../src/conversation/workspace-runtime'

describe('ConversationWorkspaceRuntime', () => {
  it('scopes message/render identities per session and keeps heavyweight runtimes bounded', () => {
    const workspace = new ConversationWorkspaceRuntime()
    try {
      const million = workspace.activeSession
      const millionFirst = million.activeUnits[0]!
      const millionSnapshot = million.snapshot(millionFirst.id, 12)
      million.currentLogicalPosition = 500_000
      workspace.saveSnapshot(million.id, { ...millionSnapshot, logicalPosition: 500_000, followTail: false, atVisualBottom: false })

      const dsh = workspace.activate('dsh-transport')
      expect(dsh.activeUnits[0]!.id.startsWith('dsh-transport:')).toBe(true)
      expect(millionFirst.id.startsWith('million:')).toBe(true)
      expect(dsh.activeUnits[0]!.id).not.toBe(millionFirst.id)

      workspace.activate('tool-rendering')
      workspace.activate('event-normalization')
      workspace.activate('dynamic-heights')
      expect(workspace.hotSessionCount).toBeLessThanOrEqual(HOT_SESSION_LIMIT)
      expect(workspace.hasHotRuntime('million')).toBe(true)
      expect(workspace.isSessionStreaming('million')).toBe(true)
    } finally {
      workspace.dispose()
    }
  })

  it('rehydrates an evicted session from semantic viewport and draft state instead of DOM state', () => {
    const workspace = new ConversationWorkspaceRuntime()
    try {
      workspace.activate('dsh-transport')
      const dsh = workspace.activeSession
      dsh.currentLogicalPosition = 90_000
      dsh.setFollowTail(false)
      dsh.setDraftText('draft survives eviction\nwith variable composer height')
      workspace.saveSnapshot('dsh-transport', {
        logicalPosition: 90_000,
        anchorUnitId: dsh.activeUnits[Math.floor(dsh.activeUnits.length / 2)]?.id ?? null,
        anchorOffsetPx: 73,
        followTail: false,
        atVisualBottom: false,
        draftText: dsh.draftText,
      })

      workspace.activate('tool-rendering')
      workspace.activate('event-normalization')
      workspace.activate('dynamic-heights')
      expect(workspace.hotSessionCount).toBeLessThanOrEqual(HOT_SESSION_LIMIT)
      expect(workspace.hasHotRuntime('dsh-transport')).toBe(false)

      const restored = workspace.activate('dsh-transport')
      expect(restored.currentLogicalPosition).toBe(90_000)
      expect(restored.followTail).toBe(false)
      expect(restored.range.start).toBeLessThanOrEqual(90_000)
      expect(restored.range.end).toBeGreaterThan(90_000)
      expect(restored.draftText).toContain('variable composer height')
    } finally {
      workspace.dispose()
    }
  })
})
