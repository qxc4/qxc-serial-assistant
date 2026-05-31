import { describe, expect, it } from 'vitest'
import { normalizeRttScanRange } from '../rttScanRange'

describe('rttScanRange', () => {
  it('normalizes empty scan range to Cortex-M SRAM defaults', () => {
    expect(normalizeRttScanRange({})).toEqual({
      start: 0x20000000,
      end: 0x20040000,
      chunkSize: 1024,
      stepSize: 16,
    })
  })

  it('accepts custom scan ranges and scan granularity', () => {
    expect(normalizeRttScanRange({
      start: 0x20010000,
      end: 0x20020000,
      chunkSize: 512,
      stepSize: 8,
    })).toEqual({
      start: 0x20010000,
      end: 0x20020000,
      chunkSize: 512,
      stepSize: 8,
    })
  })

  it('rejects invalid or unsafe scan ranges', () => {
    expect(() => normalizeRttScanRange({ start: 0x20001000, end: 0x20001000 })).toThrow(/end/i)
    expect(() => normalizeRttScanRange({ start: -1 })).toThrow(/start/i)
    expect(() => normalizeRttScanRange({ stepSize: 0 })).toThrow(/step/i)
  })
})
