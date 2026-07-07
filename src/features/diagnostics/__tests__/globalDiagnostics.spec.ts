import { describe, expect, it, beforeEach } from 'vitest'
import {
  buildModbusDiagnostics,
  buildSerialDiagnostics,
  createDiagnosticSnapshot,
  resetDiagnostics,
  setModuleDiagnostics,
  useGlobalDiagnostics,
  type DiagnosticItem,
} from '../globalDiagnostics'
import type { SerialSessionDiagnostics } from '../../serial'

const t = (key: string, params?: Record<string, unknown>) => {
  if (!params) return key
  return `${key}:${JSON.stringify(params)}`
}

function item(overrides: Partial<DiagnosticItem>): DiagnosticItem {
  return {
    id: 'item',
    module: 'serial',
    tone: 'ok',
    title: 'title',
    detail: 'detail',
    priority: 0,
    ...overrides,
  }
}

function sessionDiagnostics(overrides: Partial<SerialSessionDiagnostics> = {}): SerialSessionDiagnostics {
  return {
    totalEntries: 0,
    txEntries: 0,
    rxEntries: 0,
    lastTxAt: null,
    lastRxAt: null,
    averageTxIntervalMs: null,
    receiveAfterLastTx: false,
    silenceMs: null,
    ...overrides,
  }
}

describe('global diagnostics', () => {
  beforeEach(() => {
    resetDiagnostics()
  })

  it('ranks highest tone as error over warn over idle over ok', () => {
    expect(createDiagnosticSnapshot([item({ tone: 'ok' })], 100).highestTone).toBe('ok')
    expect(createDiagnosticSnapshot([item({ tone: 'ok' }), item({ tone: 'idle' })], 100).highestTone).toBe('idle')
    expect(createDiagnosticSnapshot([item({ tone: 'warn' }), item({ tone: 'idle' })], 100).highestTone).toBe('warn')
    expect(createDiagnosticSnapshot([item({ tone: 'error' }), item({ tone: 'warn' })], 100).highestTone).toBe('error')
  })

  it('registers, replaces and clears diagnostics by module', () => {
    const diagnostics = useGlobalDiagnostics()

    setModuleDiagnostics('serial', [item({ id: 'serial-1', module: 'serial', tone: 'warn' })])
    expect(diagnostics.snapshot.value.items.map(entry => entry.id)).toEqual(['serial-1'])

    setModuleDiagnostics('serial', [item({ id: 'serial-2', module: 'serial', tone: 'error' })])
    expect(diagnostics.snapshot.value.items.map(entry => entry.id)).toEqual(['serial-2'])
    expect(diagnostics.snapshot.value.highestTone).toBe('error')

    setModuleDiagnostics('serial', [])
    expect(diagnostics.snapshot.value.items).toEqual([])
  })
})

describe('serial diagnostics', () => {
  it('reports unsupported browser and disconnected states', () => {
    const entries = buildSerialDiagnostics({
      isSupported: false,
      isConnected: false,
      canReconnect: false,
      isReconnecting: false,
      session: sessionDiagnostics(),
      lastError: null,
      now: 10_000,
    }, t)

    expect(entries.map(entry => [entry.id, entry.tone])).toContainEqual(['serial-unsupported', 'error'])
    expect(entries.map(entry => [entry.id, entry.tone])).toContainEqual(['serial-disconnected', 'idle'])
  })

  it('warns when a send has no later receive or the link is silent', () => {
    const entries = buildSerialDiagnostics({
      isSupported: true,
      isConnected: true,
      canReconnect: false,
      isReconnecting: false,
      session: sessionDiagnostics({
        totalEntries: 1,
        txEntries: 1,
        rxEntries: 0,
        lastTxAt: 1_000,
        lastRxAt: null,
        receiveAfterLastTx: false,
        silenceMs: 9_000,
      }),
      lastError: null,
      now: 10_000,
    }, t)

    expect(entries.map(entry => [entry.id, entry.tone])).toContainEqual(['serial-no-response', 'warn'])
    expect(entries.map(entry => [entry.id, entry.tone])).toContainEqual(['serial-silent', 'warn'])
  })
})

describe('modbus diagnostics', () => {
  it('reports response gaps, failed parsing and exception frames', () => {
    const entries = buildModbusDiagnostics({
      pipeline: {
        total: 5,
        success: 2,
        failed: 3,
        exceptionFrames: 1,
        successRate: 40,
        lastError: 'CRC mismatch',
      },
      responseGap: 2,
      pollingHealth: null,
    }, t)

    expect(entries.map(entry => [entry.id, entry.tone])).toContainEqual(['modbus-response-gap', 'error'])
    expect(entries.map(entry => [entry.id, entry.tone])).toContainEqual(['modbus-parse-failed', 'warn'])
    expect(entries.map(entry => [entry.id, entry.tone])).toContainEqual(['modbus-exception-frame', 'warn'])
  })
})
