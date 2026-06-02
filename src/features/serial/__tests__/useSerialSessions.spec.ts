import { describe, expect, it, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { useSerialSessions } from '../useSerialSessions'

function createHarness() {
  const showToast = vi.fn()
  const txBytes = ref(0)
  const rxBytes = ref(0)
  const dataCount = ref(0)
  const isConnected = ref(false)
  const sessions = useSerialSessions({
    txBytes,
    rxBytes,
    dataCount,
    isConnected,
    showToast,
  })

  return {
    ...sessions,
    txBytes,
    rxBytes,
    dataCount,
    isConnected,
    showToast,
  }
}

describe('useSerialSessions', () => {
  it('syncs the default session stats from the active serial singleton', async () => {
    const harness = createHarness()

    harness.txBytes.value = 128
    harness.rxBytes.value = 256
    harness.dataCount.value = 9
    harness.isConnected.value = true
    await nextTick()

    expect(harness.serialSessions.value[0]?.stats).toEqual({
      txBytes: 128,
      rxBytes: 256,
      events: 9,
    })
    expect(harness.serialSessions.value[0]?.connectionLabel).toBe('当前 Web Serial 连接已连接')
  })

  it('adds placeholder sessions up to the controller limit', () => {
    const harness = createHarness()

    harness.addSerialSessionSlot()
    harness.addSerialSessionSlot()
    harness.addSerialSessionSlot()
    harness.addSerialSessionSlot()

    expect(harness.serialSessions.value).toHaveLength(4)
    expect(harness.showToast).toHaveBeenLastCalledWith('最多同时保留 4 个串口会话')
    expect(harness.activeSerialSession.value?.isDefault).toBe(false)
  })

  it('warns when activating a placeholder session', () => {
    const harness = createHarness()
    harness.addSerialSessionSlot()
    const placeholderId = harness.activeSerialSessionId.value
    harness.setActiveSerialSession('default')
    harness.showToast.mockClear()

    harness.setActiveSerialSession(placeholderId)

    expect(harness.activeSerialSessionId.value).toBe(placeholderId)
    expect(harness.showToast).toHaveBeenCalledWith('该会话槽当前为占位模式，真实串口仍由默认会话承载')
  })

  it('protects the default session from deletion', () => {
    const harness = createHarness()

    harness.removeSerialSessionSlot('default')

    expect(harness.serialSessions.value).toHaveLength(1)
    expect(harness.activeSerialSessionId.value).toBe('default')
  })
})
