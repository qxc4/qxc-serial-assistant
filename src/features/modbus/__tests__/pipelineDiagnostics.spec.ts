import { describe, expect, test } from 'vitest'
import { estimateModbusResponseGap, summarizeModbusPipeline } from '../pipelineDiagnostics'

describe('modbus pipeline diagnostics', () => {
  test('summarizes success, failures, and success rate', () => {
    const diagnostics = summarizeModbusPipeline([
      { result: { success: true, mode: 'rtu', frame: { address: 1, functionCode: 3, data: [], checksum: [0, 0] }, rawBytes: [] } },
      { result: { success: false, mode: 'rtu', error: 'CRC 错误', rawBytes: [] } },
    ])

    expect(diagnostics.total).toBe(2)
    expect(diagnostics.success).toBe(1)
    expect(diagnostics.failed).toBe(1)
    expect(diagnostics.successRate).toBe(50)
    expect(diagnostics.lastError).toBe('CRC 错误')
  })

  test('counts modbus exception responses', () => {
    const diagnostics = summarizeModbusPipeline([
      { result: { success: true, mode: 'rtu', frame: { address: 1, functionCode: 0x83, data: [2], checksum: [0, 0] }, rawBytes: [] } },
    ])

    expect(diagnostics.exceptionFrames).toBe(1)
  })

  test('estimates response gap from sent and parsed counts', () => {
    expect(estimateModbusResponseGap(10, 7)).toBe(3)
    expect(estimateModbusResponseGap(5, 8)).toBe(0)
  })
})
