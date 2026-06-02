import { describe, expect, test } from 'vitest'
import {
  formatModbusPollingProgress,
  normalizeModbusPollingSettings,
  shouldContinueModbusPolling,
} from '../polling'

describe('modbus polling helpers', () => {
  test('normalizes interval and cycle limits', () => {
    expect(normalizeModbusPollingSettings({ intervalMs: 10, maxCycles: -1 })).toEqual({
      intervalMs: 100,
      maxCycles: 0,
      isUnlimited: true,
    })

    expect(normalizeModbusPollingSettings({ intervalMs: 120_000, maxCycles: 1_000_000 })).toEqual({
      intervalMs: 60_000,
      maxCycles: 999_999,
      isUnlimited: false,
    })
  })

  test('treats max cycles 0 as unlimited polling', () => {
    expect(shouldContinueModbusPolling(100, 0)).toBe(true)
    expect(formatModbusPollingProgress(3, 0)).toBe('3 / 无限')
  })

  test('stops when finite cycle count is reached', () => {
    expect(shouldContinueModbusPolling(2, 3)).toBe(true)
    expect(shouldContinueModbusPolling(3, 3)).toBe(false)
    expect(formatModbusPollingProgress(2, 3)).toBe('2 / 3')
  })
})
