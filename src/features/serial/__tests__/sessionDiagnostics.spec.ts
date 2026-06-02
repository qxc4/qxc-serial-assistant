import { describe, expect, test } from 'vitest'
import { formatSerialDuration, summarizeSerialSession } from '../sessionDiagnostics'

describe('serial session diagnostics', () => {
  test('summarizes tx and rx entries', () => {
    const result = summarizeSerialSession([
      { timestamp: 1000, direction: 'tx', data: 'AT' },
      { timestamp: 1200, direction: 'rx', data: 'OK' },
      { timestamp: 1600, direction: 'tx', data: 'AT+RST' },
    ], 2000)

    expect(result.totalEntries).toBe(3)
    expect(result.txEntries).toBe(2)
    expect(result.rxEntries).toBe(1)
    expect(result.averageTxIntervalMs).toBe(600)
    expect(result.receiveAfterLastTx).toBe(false)
    expect(result.silenceMs).toBe(400)
  })

  test('detects response after latest tx', () => {
    const result = summarizeSerialSession([
      { timestamp: 1000, direction: 'tx', data: 'PING' },
      { timestamp: 1500, direction: 'rx', data: 'PONG' },
    ], 1500)

    expect(result.receiveAfterLastTx).toBe(true)
  })

  test('formats compact durations', () => {
    expect(formatSerialDuration(null)).toBe('—')
    expect(formatSerialDuration(250)).toBe('250ms')
    expect(formatSerialDuration(1400)).toBe('1.4s')
    expect(formatSerialDuration(120_000)).toBe('2min')
  })
})
