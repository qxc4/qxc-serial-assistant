export interface SerialSessionDescriptor {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  isDefault: boolean
  connectionLabel: string
  stats: {
    txBytes: number
    rxBytes: number
    events: number
  }
}

export interface SerialSessionControllerState {
  activeSessionId: string
  sessions: SerialSessionDescriptor[]
  maxSessions: number
}

export interface SerialSessionController {
  readonly state: SerialSessionControllerState
  activeSession(): SerialSessionDescriptor
  addSession(name?: string): SerialSessionDescriptor
  removeSession(id: string): boolean
  renameSession(id: string, name: string): boolean
  updateSessionStats(id: string, stats: Partial<SerialSessionDescriptor['stats']>): boolean
  setActiveSession(id: string): boolean
}

export function createDefaultSerialSession(now = new Date().toISOString()): SerialSessionDescriptor {
  return {
    id: 'default',
    name: '串口 1',
    createdAt: now,
    updatedAt: now,
    isDefault: true,
    connectionLabel: '当前 Web Serial 连接',
    stats: {
      txBytes: 0,
      rxBytes: 0,
      events: 0,
    },
  }
}

export function createSerialSessionController(
  initialSessions: SerialSessionDescriptor[] = [createDefaultSerialSession()],
  maxSessions = 4,
): SerialSessionController {
  const sessions = initialSessions.length > 0 ? [...initialSessions] : [createDefaultSerialSession()]
  const state: SerialSessionControllerState = {
    activeSessionId: sessions[0]?.id ?? 'default',
    sessions,
    maxSessions,
  }

  return {
    state,
    activeSession() {
      return state.sessions.find(session => session.id === state.activeSessionId) ?? state.sessions[0] ?? createDefaultSerialSession()
    },
    addSession(name) {
      if (state.sessions.length >= state.maxSessions) {
        throw new Error(`最多同时保留 ${state.maxSessions} 个串口会话`)
      }
      const now = new Date().toISOString()
      const session: SerialSessionDescriptor = {
        id: `session-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        name: name?.trim() || `串口 ${state.sessions.length + 1}`,
        createdAt: now,
        updatedAt: now,
        isDefault: false,
        connectionLabel: '未连接',
        stats: {
          txBytes: 0,
          rxBytes: 0,
          events: 0,
        },
      }
      state.sessions.push(session)
      state.activeSessionId = session.id
      return session
    },
    removeSession(id) {
      const index = state.sessions.findIndex(session => session.id === id)
      if (index < 0 || state.sessions[index]?.isDefault) return false
      state.sessions.splice(index, 1)
      if (state.activeSessionId === id) {
        state.activeSessionId = state.sessions[0]?.id ?? 'default'
      }
      return true
    },
    renameSession(id, name) {
      const session = state.sessions.find(item => item.id === id)
      const nextName = name.trim()
      if (!session || !nextName) return false
      session.name = nextName
      session.updatedAt = new Date().toISOString()
      return true
    },
    updateSessionStats(id, stats) {
      const session = state.sessions.find(item => item.id === id)
      if (!session) return false
      session.stats = {
        ...session.stats,
        ...stats,
      }
      session.updatedAt = new Date().toISOString()
      return true
    },
    setActiveSession(id) {
      if (!state.sessions.some(session => session.id === id)) return false
      state.activeSessionId = id
      return true
    },
  }
}
