import { onBeforeUnmount, shallowRef } from 'vue'
import { ConversationWorkspaceRuntime } from '../conversation/workspace-runtime'
import type { ConversationSessionRuntime, SessionUiSnapshot } from '../conversation/session-runtime'

/** Thin Vue bridge: framework sees atomic snapshots, not the mutable session kernel. */
export function useWorkspaceRuntime() {
  const workspace = new ConversationWorkspaceRuntime()
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
