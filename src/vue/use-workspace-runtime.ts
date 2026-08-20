import { computed, onBeforeUnmount, shallowRef } from 'vue'
import { ConversationWorkspaceRuntime } from '../conversation/workspace-runtime'

/**
 * Thin Vue bridge. Business state stays in framework-free runtime classes; Vue
 * receives only revision signals and asks the runtime for immutable/current data.
 */
export function useWorkspaceRuntime() {
  const workspace = new ConversationWorkspaceRuntime()
  const workspaceRevision = shallowRef(0)
  const activeRevision = shallowRef(0)
  let unsubscribeSession: (() => void) | null = null

  const bindActive = () => {
    unsubscribeSession?.()
    unsubscribeSession = workspace.activeSession.subscribeState(() => {
      activeRevision.value += 1
    })
    activeRevision.value += 1
  }

  const unsubscribeWorkspace = workspace.subscribe(() => {
    workspaceRevision.value += 1
    bindActive()
  })
  bindActive()

  const activeSession = computed(() => {
    void workspaceRevision.value
    void activeRevision.value
    return workspace.activeSession
  })

  onBeforeUnmount(() => {
    unsubscribeSession?.()
    unsubscribeWorkspace()
  })

  return {
    workspace,
    activeSession,
    workspaceRevision,
    activeRevision,
  }
}
