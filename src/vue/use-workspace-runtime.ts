import { onBeforeUnmount, shallowRef } from 'vue'
import { DemoWorkspaceRuntime } from '../demo/workspace-runtime'
import type { ConversationSessionRuntime, SessionUiSnapshot } from '../conversation/session-runtime'

/** Demo-only Vue bridge. Reusable engine consumers compose their own workspace/session owner. */
export function useWorkspaceRuntime() {
  const workspace = new DemoWorkspaceRuntime()
  const workspaceRevision = shallowRef(0)
  const activeSession = shallowRef<ConversationSessionRuntime>(workspace.activeSession)
  const activeUiState = shallowRef<SessionUiSnapshot>(workspace.activeSession.uiSnapshot)
  let unsubscribeSession: (() => void) | null = null

  const bindActive = () => {
    unsubscribeSession?.()
    const runtime = workspace.activeSession
    activeSession.value = runtime
    activeUiState.value = runtime.uiSnapshot
    unsubscribeSession = runtime.subscribeState(() => {
      activeUiState.value = runtime.uiSnapshot
    })
  }

  const unsubscribeWorkspace = workspace.subscribe(() => {
    workspaceRevision.value += 1
    if (activeSession.value !== workspace.activeSession) bindActive()
    else activeUiState.value = workspace.activeSession.uiSnapshot
  })
  bindActive()

  onBeforeUnmount(() => {
    unsubscribeSession?.()
    unsubscribeWorkspace()
    workspace.dispose()
  })

  return { workspace, activeSession, activeUiState, workspaceRevision }
}
