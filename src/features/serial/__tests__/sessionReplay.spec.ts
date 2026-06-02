import { describe, expect, it } from 'vitest'
import {
  createSerialReplayEvent,
  createSerialSessionRecording,
  createSerialSessionSnapshot,
  filterReplayEvents,
  getReplayDelay,
  parseSerialSessionRecording,
  serializeSerialSessionRecording,
} from '../sessionReplay'

describe('sessionReplay', () => {
  it('creates snapshots and replay events with offsets', () => {
    const snapshot = createSerialSessionSnapshot({
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      receiveEncoding: 'utf-8',
      sendEncoding: 'utf-8',
      lineEnding: 'CRLF',
    })
    const event = createSerialReplayEvent(new Uint8Array([0x41, 0x54]), 'tx', 1000, 1250)

    expect(snapshot.capturedAt).toMatch(/T/)
    expect(event.offsetMs).toBe(250)
    expect(event.hex).toBe('41 54')
    expect(event.data).toBe('AT')
  })

  it('serializes and parses recordings while keeping event order', () => {
    const snapshot = createSerialSessionSnapshot({
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      receiveEncoding: 'utf-8',
      sendEncoding: 'utf-8',
      lineEnding: 'none',
    })
    const recording = createSerialSessionRecording({
      name: 'boot-check',
      snapshot,
      createdAt: '2026-06-02T00:00:00.000Z',
      events: [
        { id: 'rx', direction: 'rx', timestamp: 300, offsetMs: 300, data: 'OK', hex: '4F 4B', isHex: false, byteLength: 2 },
        { id: 'tx', direction: 'tx', timestamp: 100, offsetMs: 100, data: 'AT', hex: '41 54', isHex: false, byteLength: 2 },
      ],
    })

    const parsed = parseSerialSessionRecording(serializeSerialSessionRecording(recording))

    expect(parsed.name).toBe('boot-check')
    expect(parsed.events.map(event => event.id)).toEqual(['tx', 'rx'])
  })

  it('calculates replay delay and filters tx-only mode', () => {
    const tx = { id: '1', direction: 'tx' as const, timestamp: 0, offsetMs: 100, data: 'AT', hex: '41 54', isHex: false, byteLength: 2 }
    const rx = { id: '2', direction: 'rx' as const, timestamp: 0, offsetMs: 500, data: 'OK', hex: '4F 4B', isHex: false, byteLength: 2 }

    expect(getReplayDelay(tx, rx, 2)).toBe(200)
    expect(filterReplayEvents([tx, rx], 'tx-only')).toEqual([tx])
    expect(filterReplayEvents([tx, rx], 'simulate-rx')).toEqual([tx, rx])
  })
})
