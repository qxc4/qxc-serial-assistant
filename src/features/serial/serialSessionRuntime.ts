import type { SerialSessionDescriptor } from './serialSessionController'

export type SerialSessionDirection = 'tx' | 'rx'

export interface SerialSessionRuntimeLog {
  id: string
  timestamp: number
  direction: SerialSessionDirection
  bytes: Uint8Array
}

export interface SerialSessionRuntimeState {
  isConnected: boolean
  connectionLabel: string
  stats: SerialSessionDescriptor['stats']
  logs: SerialSessionRuntimeLog[]
}

export interface SerialSessionTransportConnection {
  label: string
}

export interface SerialSessionTransport {
  connect(onData: (bytes: Uint8Array) => void): Promise<SerialSessionTransportConnection>
  disconnect(): Promise<void>
  send(bytes: Uint8Array): Promise<void>
  emit?(bytes: number[]): void
}

export interface SerialSessionRuntime {
  readonly session: SerialSessionDescriptor
  readonly state: SerialSessionRuntimeState
  connect(): Promise<void>
  disconnect(): Promise<void>
  send(bytes: Uint8Array): Promise<void>
}

export interface SerialSessionManagerOptions {
  maxSessions?: number
}

export interface WebSerialSessionTransportOptions {
  serial?: Serial
  serialOptions: SerialOptions
  requestOptions?: { filters?: SerialPortFilter[] }
}

export interface SerialSessionManager {
  readonly runtimes: SerialSessionRuntime[]
  addRuntime(session: SerialSessionDescriptor, transport: SerialSessionTransport): SerialSessionRuntime
  activeRuntime(): SerialSessionRuntime | null
  setActiveRuntime(sessionId: string): boolean
  removeRuntime(sessionId: string): boolean
}

export interface MockSerialSessionTransport extends SerialSessionTransport {
  sent: Uint8Array[]
  emit(bytes: number[]): void
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes)
}

function createLog(direction: SerialSessionDirection, bytes: Uint8Array): SerialSessionRuntimeLog {
  return {
    id: `serial-runtime-log-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: Date.now(),
    direction,
    bytes: cloneBytes(bytes),
  }
}

function appendRuntimeLog(state: SerialSessionRuntimeState, direction: SerialSessionDirection, bytes: Uint8Array): void {
  state.logs = [...state.logs, createLog(direction, bytes)].slice(-10_000)
  state.stats = {
    txBytes: state.stats.txBytes + (direction === 'tx' ? bytes.length : 0),
    rxBytes: state.stats.rxBytes + (direction === 'rx' ? bytes.length : 0),
    events: state.stats.events + 1,
  }
}

function syncRuntimeSession(session: SerialSessionDescriptor, state: SerialSessionRuntimeState): void {
  session.stats = { ...state.stats }
  session.connectionLabel = state.connectionLabel
  session.updatedAt = new Date().toISOString()
}

export function createSerialSessionRuntime(
  session: SerialSessionDescriptor,
  transport: SerialSessionTransport,
): SerialSessionRuntime {
  const state: SerialSessionRuntimeState = {
    isConnected: false,
    connectionLabel: session.connectionLabel,
    stats: { ...session.stats },
    logs: [],
  }

  return {
    session,
    state,
    async connect() {
      const connection = await transport.connect(bytes => {
        appendRuntimeLog(state, 'rx', bytes)
        syncRuntimeSession(session, state)
      })
      state.isConnected = true
      state.connectionLabel = connection.label
      syncRuntimeSession(session, state)
    },
    async disconnect() {
      await transport.disconnect()
      state.isConnected = false
      state.connectionLabel = '未连接'
      syncRuntimeSession(session, state)
    },
    async send(bytes) {
      if (!state.isConnected) {
        throw new Error('会话未连接')
      }
      await transport.send(bytes)
      appendRuntimeLog(state, 'tx', bytes)
      syncRuntimeSession(session, state)
    },
  }
}

export function createMockSerialSessionTransport(label = 'Mock Serial'): MockSerialSessionTransport {
  let onData: ((bytes: Uint8Array) => void) | null = null
  const sent: Uint8Array[] = []

  return {
    sent,
    async connect(nextOnData) {
      onData = nextOnData
      return { label }
    },
    async disconnect() {
      onData = null
    },
    async send(bytes) {
      sent.push(cloneBytes(bytes))
    },
    emit(bytes) {
      onData?.(new Uint8Array(bytes))
    },
  }
}

export function createSerialSessionManager(options: SerialSessionManagerOptions = {}): SerialSessionManager {
  const maxSessions = options.maxSessions ?? 4
  const runtimes: SerialSessionRuntime[] = []
  let activeRuntimeId = ''

  return {
    runtimes,
    addRuntime(session, transport) {
      if (runtimes.length >= maxSessions) {
        throw new Error(`最多同时保留 ${maxSessions} 个串口会话`)
      }
      const runtime = createSerialSessionRuntime(session, transport)
      runtimes.push(runtime)
      if (!activeRuntimeId) {
        activeRuntimeId = session.id
      }
      return runtime
    },
    activeRuntime() {
      return runtimes.find(runtime => runtime.session.id === activeRuntimeId) ?? runtimes[0] ?? null
    },
    setActiveRuntime(sessionId) {
      if (!runtimes.some(runtime => runtime.session.id === sessionId)) return false
      activeRuntimeId = sessionId
      return true
    },
    removeRuntime(sessionId) {
      const index = runtimes.findIndex(runtime => runtime.session.id === sessionId)
      if (index < 0) return false
      runtimes.splice(index, 1)
      if (activeRuntimeId === sessionId) {
        activeRuntimeId = runtimes[0]?.session.id ?? ''
      }
      return true
    },
  }
}

function formatSerialPortLabel(port: SerialPort): string {
  const info = port.getInfo()
  if (info.usbVendorId !== undefined && info.usbProductId !== undefined) {
    return `USB ${info.usbVendorId.toString(16).toUpperCase().padStart(4, '0')}:${info.usbProductId.toString(16).toUpperCase().padStart(4, '0')}`
  }
  return 'Web Serial 设备'
}

export function createWebSerialSessionTransport(options: WebSerialSessionTransportOptions): SerialSessionTransport {
  let port: SerialPort | null = null
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let shouldRead = false

  async function startReadLoop(onData: (bytes: Uint8Array) => void): Promise<void> {
    if (!port?.readable) return
    shouldRead = true

    while (shouldRead && port.readable) {
      const currentReader = port.readable.getReader()
      reader = currentReader
      try {
        while (shouldRead) {
          const { value, done } = await currentReader.read()
          if (done) break
          if (value && value.length > 0) {
            onData(value)
          }
        }
      } finally {
        reader = null
        currentReader.releaseLock()
      }
    }
  }

  return {
    async connect(onData) {
      const serialApi = options.serial ?? navigator.serial
      if (!serialApi?.requestPort) {
        throw new Error('当前浏览器不支持 Web Serial')
      }
      port = await serialApi.requestPort(options.requestOptions)
      await port.open(options.serialOptions)
      void startReadLoop(onData)
      return { label: formatSerialPortLabel(port) }
    },
    async disconnect() {
      shouldRead = false
      if (reader) {
        await reader.cancel().catch(() => undefined)
        reader.releaseLock()
        reader = null
      }
      if (port) {
        await port.close()
        port = null
      }
    },
    async send(bytes) {
      if (!port?.writable) {
        throw new Error('Web Serial 写入流不可用')
      }
      const writer = port.writable.getWriter()
      try {
        await writer.write(bytes)
      } finally {
        writer.releaseLock()
      }
    },
  }
}
