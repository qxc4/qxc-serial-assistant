import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  createSerialSessionSnapshot,
  serializeSerialSessionRecording,
  type SerialSessionRecording,
} from '../sessionReplay'
import { useSerialReplay } from '../useSerialReplay'

function createSnapshot() {
  return createSerialSessionSnapshot({
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    receiveEncoding: 'utf-8',
    sendEncoding: 'utf-8',
    lineEnding: 'none',
  })
}

function createRecording(): SerialSessionRecording {
  return {
    version: 1,
    name: 'fixture',
    createdAt: '2026-01-01T00:00:00.000Z',
    snapshot: createSnapshot(),
    events: [
      {
        id: 'tx-1',
        direction: 'tx',
        timestamp: 1,
        offsetMs: 0,
        data: 'AT',
        hex: '41 54',
        isHex: true,
        byteLength: 2,
      },
      {
        id: 'rx-1',
        direction: 'rx',
        timestamp: 2,
        offsetMs: 5,
        data: 'OK',
        hex: '4F 4B',
        isHex: false,
        byteLength: 2,
      },
    ],
  }
}

function createHarness() {
  const send = vi.fn(async (_data: string, _isHex?: boolean) => undefined)
  const showToast = vi.fn()
  const downloadTextFile = vi.fn()
  const isConnected = ref(false)
  const replay = useSerialReplay({
    send,
    isConnected,
    createSnapshot,
    showToast,
    downloadTextFile,
  })

  return {
    ...replay,
    send,
    showToast,
    downloadTextFile,
    isConnected,
  }
}

describe('useSerialReplay', () => {
  it('records RX and TX events while recording is active', () => {
    const harness = createHarness()

    harness.startSessionRecording()
    harness.recordSerialSessionEvent(new Uint8Array([0x41, 0x54]), 'tx')
    harness.recordSerialSessionEvent(new Uint8Array([0x4f, 0x4b]), 'rx')
    harness.stopSessionRecording()

    expect(harness.recordedReplayEvents.value).toHaveLength(2)
    expect(harness.recordedReplayEvents.value[0]).toMatchObject({ direction: 'tx', hex: '41 54', isHex: true })
    expect(harness.recordedReplayEvents.value[1]).toMatchObject({ direction: 'rx', data: 'OK', isHex: false })
  })

  it('exports recorded events as a qxc session file', () => {
    const harness = createHarness()

    harness.startSessionRecording()
    harness.recordSerialSessionEvent(new Uint8Array([0x41]), 'tx')
    harness.exportSessionRecording()

    expect(harness.downloadTextFile).toHaveBeenCalledTimes(1)
    expect(harness.downloadTextFile.mock.calls[0]?.[1]).toMatch(/\.qxc-session\.json$/)
    expect(JSON.parse(harness.downloadTextFile.mock.calls[0]?.[0] ?? '{}').events).toHaveLength(1)
  })

  it('imports a recording from a file input event', async () => {
    const harness = createHarness()
    const file = new File([serializeSerialSessionRecording(createRecording())], 'fixture.qxc-session.json', {
      type: 'application/json',
    })
    const input = document.createElement('input')
    Object.defineProperty(input, 'files', { value: [file] })

    await harness.handleSessionReplayFileSelected({ target: input } as unknown as Event)

    expect(harness.loadedSessionRecording.value?.name).toBe('fixture')
    expect(harness.replayEventsForMode.value).toHaveLength(1)
    expect(harness.showToast).toHaveBeenCalledWith('已导入会话：2 条事件')
  })

  it('blocks TX-only replay until a serial connection exists', async () => {
    const harness = createHarness()
    harness.loadedSessionRecording.value = createRecording()

    await harness.startSessionReplay()

    expect(harness.send).not.toHaveBeenCalled()
    expect(harness.showToast).toHaveBeenCalledWith('TX 回放需要先连接串口')
  })

  it('simulates RX/TX replay without sending to the serial port', async () => {
    const harness = createHarness()
    harness.loadedSessionRecording.value = createRecording()
    harness.replayMode.value = 'simulate-rx'

    await harness.startSessionReplay()

    expect(harness.send).not.toHaveBeenCalled()
    expect(harness.simulatedReplayEvents.value.map(event => event.id)).toEqual(['tx-1', 'rx-1'])
    expect(harness.replayCursor.value).toBe(2)
  })
})
