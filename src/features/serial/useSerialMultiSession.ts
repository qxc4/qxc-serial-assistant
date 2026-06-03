import { computed, ref, watch, type Ref } from 'vue'
import {
  createSerialSessionController,
  type SerialSessionDescriptor,
} from './serialSessionController'
import {
  createSerialSessionRuntime,
  createWebSerialSessionTransport,
  type SerialSessionRuntime,
  type SerialSessionRuntimeLog,
  type SerialSessionTransport,
} from './serialSessionRuntime'

export interface SerialViewLogEntry {
  id: number
  timestamp: number
  data: string
  direction: 'rx' | 'tx'
  rawBytes?: Uint8Array
}

export interface UseSerialMultiSessionOptions {
  defaultLogs: Ref<SerialViewLogEntry[]>
  txBytes: Ref<number>
  rxBytes: Ref<number>
  dataCount: Ref<number>
  isConnected: Ref<boolean>
  showToast: (message: string) => void
  createTransport?: () => SerialSessionTransport
  serialOptions?: () => SerialOptions
}

export interface RuntimeWithTransport extends SerialSessionRuntime {
  transport: SerialSessionTransport
}

function cloneSession(session: SerialSessionDescriptor): SerialSessionDescriptor {
  return {
    ...session,
    stats: { ...session.stats },
  }
}

function decodeRuntimeBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return Array.from(bytes).map(byte => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ')
  }
}

function runtimeLogToViewLog(log: SerialSessionRuntimeLog, index: number): SerialViewLogEntry {
  return {
    id: index + 1,
    timestamp: log.timestamp,
    data: decodeRuntimeBytes(log.bytes),
    direction: log.direction,
    rawBytes: log.bytes,
  }
}

export function useSerialMultiSession(options: UseSerialMultiSessionOptions) {
  const serialSessionController = createSerialSessionController()
  const runtimeMap = new Map<string, RuntimeWithTransport>()
  const runtimeRevision = ref(0)
  const serialSessions = ref<SerialSessionDescriptor[]>(serialSessionController.state.sessions.map(cloneSession))
  const activeSerialSessionId = ref(serialSessionController.state.activeSessionId)
  const activeRuntime = computed(() => runtimeMap.get(activeSerialSessionId.value) ?? null)
  const activeSerialSession = computed(() => {
    runtimeRevision.value
    const runtime = activeRuntime.value
    if (runtime) return cloneSession(runtime.session)
    return serialSessions.value.find(session => session.id === activeSerialSessionId.value) ?? serialSessions.value[0] ?? null
  })
  const activeSessionLogs = computed<SerialViewLogEntry[]>(() => {
    runtimeRevision.value
    const runtime = activeRuntime.value
    if (!runtime) return options.defaultLogs.value
    return runtime.state.logs.map(runtimeLogToViewLog)
  })
  const isActiveSessionConnected = computed(() => {
    runtimeRevision.value
    return activeRuntime.value?.state.isConnected ?? options.isConnected.value
  })

  function syncSerialSessionState(): void {
    serialSessions.value = serialSessionController.state.sessions.map(cloneSession)
    activeSerialSessionId.value = serialSessionController.state.activeSessionId
  }

  function refreshDefaultSerialSessionStats(): void {
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

  function refreshRuntimeSessionStats(runtime: SerialSessionRuntime): void {
    serialSessionController.updateSessionStats(runtime.session.id, runtime.state.stats)
    runtime.session.connectionLabel = runtime.state.connectionLabel
    syncSerialSessionState()
  }

  function createDefaultTransport(): SerialSessionTransport {
    return createWebSerialSessionTransport({
      serialOptions: options.serialOptions?.() ?? {
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
      },
    })
  }

  function observeTransport(transport: SerialSessionTransport): SerialSessionTransport {
    return {
      ...transport,
      async connect(onData) {
        return transport.connect(bytes => {
          onData(bytes)
          runtimeRevision.value++
          syncSerialSessionState()
        })
      },
      async disconnect() {
        await transport.disconnect()
        runtimeRevision.value++
      },
      async send(bytes) {
        await transport.send(bytes)
        runtimeRevision.value++
      },
    }
  }

  function addSerialSessionSlot(): RuntimeWithTransport | null {
    try {
      const session = serialSessionController.addSession()
      const transport = observeTransport(options.createTransport?.() ?? createDefaultTransport())
      const runtime = createSerialSessionRuntime(session, transport) as RuntimeWithTransport
      runtime.transport = transport
      runtimeMap.set(session.id, runtime)
      syncSerialSessionState()
      options.showToast('已新增真实串口会话，可在会话条中连接独立端口')
      return runtime
    } catch (error) {
      options.showToast(error instanceof Error ? error.message : String(error))
      return null
    }
  }

  function removeSerialSessionSlot(id: string): boolean {
    if (id === 'default') return false
    const runtime = runtimeMap.get(id)
    if (runtime?.state.isConnected) {
      void runtime.disconnect().finally(() => refreshRuntimeSessionStats(runtime))
    }
    runtimeMap.delete(id)
    const removed = serialSessionController.removeSession(id)
    syncSerialSessionState()
    return removed
  }

  function setActiveSerialSession(id: string): boolean {
    if (!serialSessionController.setActiveSession(id)) return false
    syncSerialSessionState()
    return true
  }

  async function connectActiveSerialSession(): Promise<void> {
    const runtime = activeRuntime.value
    if (!runtime) return
    await runtime.connect()
    refreshRuntimeSessionStats(runtime)
  }

  async function disconnectActiveSerialSession(): Promise<void> {
    const runtime = activeRuntime.value
    if (!runtime) return
    await runtime.disconnect()
    refreshRuntimeSessionStats(runtime)
  }

  async function sendActiveSerialSession(bytes: Uint8Array): Promise<void> {
    const runtime = activeRuntime.value
    if (!runtime) return
    await runtime.send(bytes)
    refreshRuntimeSessionStats(runtime)
  }

  function clearActiveSessionLogs(): boolean {
    const runtime = activeRuntime.value
    if (!runtime) return false
    runtime.state.logs = []
    runtime.state.stats = {
      txBytes: 0,
      rxBytes: 0,
      events: 0,
    }
    runtime.session.stats = { ...runtime.state.stats }
    runtime.session.updatedAt = new Date().toISOString()
    runtimeRevision.value++
    syncSerialSessionState()
    return true
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
    activeRuntime,
    activeSessionLogs,
    isActiveSessionConnected,
    syncSerialSessionState,
    refreshDefaultSerialSessionStats,
    addSerialSessionSlot,
    removeSerialSessionSlot,
    setActiveSerialSession,
    connectActiveSerialSession,
    disconnectActiveSerialSession,
    sendActiveSerialSession,
    clearActiveSessionLogs,
  }
}
