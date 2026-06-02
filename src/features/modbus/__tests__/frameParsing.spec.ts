import { describe, expect, test } from 'vitest'
import { buildModbusFrame } from '../../../utils/modbus'
import { bytesToHexInput, parseCompleteModbusFrame } from '../frameParsing'

describe('frameParsing', () => {
  test('formats bytes as spaced uppercase hex', () => {
    expect(bytesToHexInput([0x01, 0x03, 0x0a])).toBe('01 03 0A')
  })

  test('parses a complete RTU frame without waiting for another frame gap', () => {
    const frame = buildModbusFrame(1, 3, [0, 0, 0, 1], 'rtu')
    const result = parseCompleteModbusFrame(frame, 'rtu')
    expect(result?.success).toBe(true)
    expect(result?.frame?.address).toBe(1)
    expect(result?.frame?.functionCode).toBe(3)
  })

  test('parses a complete ASCII frame', () => {
    const frame = buildModbusFrame(1, 3, [0, 0, 0, 1], 'ascii')
    const result = parseCompleteModbusFrame(frame, 'ascii')
    expect(result?.success).toBe(true)
    expect(result?.frame?.address).toBe(1)
    expect(result?.frame?.functionCode).toBe(3)
  })
})

