import { computed, ref, watch, type Ref } from 'vue'
import {
  createSerialSessionController,
  type SerialSessionController,
  type SerialSessionDescriptor,
} from './serialSessionController'

export interface UseSerialSessionsOptions {
  txBytes: Ref<number>
  rxBytes: Ref<number>
  dataCount: Ref<number>
  isConnected: Ref<boolean>
  showToast: (message: string) => void
}

export interface UseSerialSessionsReturn {
  serialSessionController: SerialSessionController
  serialSessions: Ref<SerialSessionDescriptor[]>
  activeSerialSessionId: Ref<string>
  activeSerialSession: Readonly<Ref<SerialSessionDescriptor | null>>
  syncSerialSessionState: () => void
  refreshDefaultSerialSessionStats: () => void
  addSerialSessionSlot: () => void
  removeSerialSessionSlot: (id: string) => void
  setActiveSerialSession: (id: string) => void
}

function cloneSession(session: SerialSessionDescriptor): SerialSessionDescriptor {
  return {
    ...session,
    stats: { ...session.stats },
  }
}

export function useSerialSessions(options: UseSerialSessionsOptions): UseSerialSessionsReturn {
  const serialSessionController = createSerialSessionController()
  const serialSessions = ref<SerialSessionDescriptor[]>(
    serialSessionController.state.sessions.map(cloneSession),
  )
  const activeSerialSessionId = ref(serialSessionController.state.activeSessionId)
  const activeSerialSession = computed(() =>
    serialSessions.value.find(session => session.id === activeSerialSessionId.value) ?? serialSessions.value[0] ?? null,
  )

  function syncSerialSessionState() {
    serialSessions.value = serialSessionController.state.sessions.map(cloneSession)
    activeSerialSessionId.value = serialSessionController.state.activeSessionId
  }

  function refreshDefaultSerialSessionStats() {
    serialSessionController.updateSessionStats('default', {
      txBytes: options.txBytes.value,
      rxBytes: options.rxBytes.value,
      events: options.dataCount.value,
    })
    const defaultSession = serialSessionController.state.sessions.find(session => session.id === 'default')
    if (defaultSession) {
      defaultSession.connectionLabel = options.isConnected.value ? '当前 Web Serial 连接已连接' : '当前 Web Serial 连接未连接'
    }
    syncSerialSessionState()
  }

  function addSerialSessionSlot() {
    try {
      serialSessionController.addSession()
      syncSerialSessionState()
      options.showToast('已新增串口会话槽；真实多端口连接将在下一阶段启用')
    } catch (error) {
      options.showToast(error instanceof Error ? error.message : String(error))
    }
  }

  function removeSerialSessionSlot(id: string) {
    serialSessionController.removeSession(id)
    syncSerialSessionState()
  }

  function setActiveSerialSession(id: string) {
    if (!serialSessionController.setActiveSession(id)) return
    syncSerialSessionState()
    if (id !== 'default') {
      options.showToast('该会话槽当前为占位模式，真实串口仍由默认会话承载')
    }
  }

  watch(
    [options.txBytes, options.rxBytes, options.dataCount, options.isConnected],
    refreshDefaultSerialSessionStats,
    { immediate: true },
  )

  return {
    serialSessionController,
    serialSessions,
    activeSerialSessionId,
    activeSerialSession,
    syncSerialSessionState,
    refreshDefaultSerialSessionStats,
    addSerialSessionSlot,
    removeSerialSessionSlot,
    setActiveSerialSession,
  }
}
