import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { PROTOCOL_TEMPLATES } from '../protocolTemplates'
import { useQuickCommands } from '../useQuickCommands'

function createHarness() {
  const send = vi.fn(async (_data: string, _isHex?: boolean) => undefined)
  const showToast = vi.fn()
  const isConnected = ref(true)
  const quick = useQuickCommands({
    send,
    isConnected,
    showToast,
    measureSync: (_name, fn) => fn(),
  })

  return {
    ...quick,
    send,
    showToast,
    isConnected,
  }
}

describe('useQuickCommands', () => {
  it('applies a protocol template by appending commands and parse hints', () => {
    const harness = createHarness()
    const initialCount = harness.quickCommands.value.length
    harness.selectedProtocolTemplateId.value = PROTOCOL_TEMPLATES[0]?.id ?? ''

    harness.applySelectedProtocolTemplate()

    expect(harness.quickCommands.value.length).toBeGreaterThan(initialCount)
    expect(harness.protocolTemplateHint.value).not.toBe('')
    expect(harness.showToast).toHaveBeenCalledWith(`已应用模板：${PROTOCOL_TEMPLATES[0]?.name}`)
  })

  it('sends enabled quick commands in order', async () => {
    const harness = createHarness()
    harness.quickCommands.value = [
      { id: 1, enabled: true, content: 'AT', description: '', isHex: false, delay: 0 },
      { id: 2, enabled: false, content: 'SKIP', description: '', isHex: false, delay: 0 },
      { id: 3, enabled: true, content: '41 54', description: '', isHex: true, delay: 0 },
    ]

    await harness.sendSelected()

    expect(harness.send.mock.calls).toEqual([
      ['AT', false],
      ['41 54', true],
    ])
    expect(harness.isSendingQuickCommands.value).toBe(false)
  })

  it('does not send commands while disconnected', async () => {
    const harness = createHarness()
    harness.isConnected.value = false

    await harness.sendCommand({ id: 1, enabled: true, content: 'AT', description: '', isHex: false, delay: 0 })
    await harness.sendSelected()

    expect(harness.send).not.toHaveBeenCalled()
  })

  it('cleans up loop state and pending sends', () => {
    const harness = createHarness()
    harness.quickCommands.value = [
      { id: 1, enabled: true, content: 'AT', description: '', isHex: false, delay: 1000 },
    ]

    harness.toggleLoopSend()
    expect(harness.isLooping.value).toBe(true)

    harness.cleanupQuickCommands()

    expect(harness.isLooping.value).toBe(false)
    expect(harness.isSendingQuickCommands.value).toBe(false)
  })
})
