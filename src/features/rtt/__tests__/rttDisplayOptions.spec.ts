import { describe, expect, test } from 'vitest'
import {
  RTT_LEVEL_BG_MAP,
  RTT_LEVEL_COLOR_MAP,
  RTT_STATE_COLOR_MAP,
  rttBackendOptions,
  rttFrequencyOptions,
  rttLevelOptions,
} from '../rttDisplayOptions'

describe('rttDisplayOptions', () => {
  test('keeps connection state colors', () => {
    expect(RTT_STATE_COLOR_MAP.connected).toContain('green')
    expect(RTT_STATE_COLOR_MAP.error).toContain('red')
  })

  test('keeps log level display mappings', () => {
    expect(RTT_LEVEL_COLOR_MAP.error).toContain('red')
    expect(RTT_LEVEL_BG_MAP.warn).toContain('yellow')
    expect(rttLevelOptions.map(option => option.value)).toEqual(['trace', 'debug', 'info', 'warn', 'error'])
  })

  test('keeps WebUSB backend and SWD frequency options', () => {
    expect(rttBackendOptions).toEqual([
      expect.objectContaining({ value: 'webusb', label: 'WebUSB 调试工作台' }),
    ])
    expect(rttFrequencyOptions.map(option => option.value)).toContain(16000000)
  })
})

