import { describe, expect, test } from 'vitest'
import { parseRegisterData, reorderBytes } from '../registerParsing'

describe('registerParsing', () => {
  test('reorders 32-bit values for supported byte orders', () => {
    expect(reorderBytes([0x11, 0x22, 0x33, 0x44], 'ABCD')).toEqual([0x11, 0x22, 0x33, 0x44])
    expect(reorderBytes([0x11, 0x22, 0x33, 0x44], 'DCBA')).toEqual([0x44, 0x33, 0x22, 0x11])
    expect(reorderBytes([0x11, 0x22, 0x33, 0x44], 'BADC')).toEqual([0x22, 0x11, 0x44, 0x33])
    expect(reorderBytes([0x11, 0x22, 0x33, 0x44], 'CDAB')).toEqual([0x33, 0x44, 0x11, 0x22])
  })

  test('parses uint16 register values', () => {
    expect(parseRegisterData([0x12, 0x34, 0x00, 0x02], 10, 'uint16', 'ABCD')).toEqual([
      { address: 10, raw: '12 34', parsed: 0x1234, type: 'uint16' },
      { address: 11, raw: '00 02', parsed: 2, type: 'uint16' },
    ])
  })

  test('parses float32 values', () => {
    const [value] = parseRegisterData([0x3F, 0x80, 0x00, 0x00], 0, 'float32', 'ABCD')
    expect(value.parsed).toBe('1.000000')
  })
})

