import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useSerialMultiSession } from '../useSerialMultiSession'
import { createMockSerialSessionTransport } from '../serialSessionRuntime'

const defaultLogs = ref([
  { id: 1, timestamp: 1, data: 'default', direction: 'rx' as const, rawBytes: new Uint8Array([1]) },
])
const defaultStats = {
  txBytes: ref(1),
  rxBytes: ref(2),
  dataCount: ref(1),
  isConnected: ref(true),
}

describe('useSerialMultiSession', () => {
  it('keeps default singleton session and adds real isolated runtimes', async () => {
    const session = useSerialMultiSession({
      defaultLogs,
      ...defaultStats,
      showToast: () => undefined,
      createTransport: () => createMockSerialSessionTransport('Mock 2'),
    })

    const runtime = session.addSerialSessionSlot()
    expect(runtime).not.toBeNull()
    expect(session.serialSessions.value).toHaveLength(2)
    expect(session.activeSerialSession.value?.isDefault).toBe(false)

    await session.connectActiveSerialSession()
    await session.sendActiveSerialSession(new Uint8Array([65, 66]))
    runtime?.transport.emit?.([67])

    expect(session.activeSessionLogs.value.map(item => item.data)).toEqual(['AB', 'C'])
    expect(session.activeSerialSession.value?.stats.txBytes).toBe(2)
    expect(session.activeSerialSession.value?.stats.rxBytes).toBe(1)

    session.setActiveSerialSession('default')
    expect(session.activeSessionLogs.value).toEqual(defaultLogs.value)
  })

  it('clears active runtime logs without touching default logs', async () => {
    const session = useSerialMultiSession({
      defaultLogs,
      ...defaultStats,
      showToast: () => undefined,
      createTransport: () => createMockSerialSessionTransport('Mock 2'),
    })

    const runtime = session.addSerialSessionSlot()
    await session.connectActiveSerialSession()
    runtime?.transport.emit?.([65])
    expect(session.activeSessionLogs.value).toHaveLength(1)

    session.clearActiveSessionLogs()
    expect(session.activeSessionLogs.value).toEqual([])

    session.setActiveSerialSession('default')
    expect(session.activeSessionLogs.value).toEqual(defaultLogs.value)
  })

  it('removes runtime sessions without removing the default session', () => {
    const session = useSerialMultiSession({
      defaultLogs,
      ...defaultStats,
      showToast: () => undefined,
      createTransport: () => createMockSerialSessionTransport('Mock 2'),
    })

    const runtime = session.addSerialSessionSlot()
    expect(runtime).not.toBeNull()
    expect(session.removeSerialSessionSlot('default')).toBe(false)
    expect(session.removeSerialSessionSlot(runtime!.session.id)).toBe(true)
    expect(session.serialSessions.value).toHaveLength(1)
    expect(session.activeSerialSessionId.value).toBe('default')
  })
})
