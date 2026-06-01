import { describe, expect, test } from 'vitest'
import { createProbeCapabilityMatrix } from '../probeCapabilityMatrix'

describe('probe capability matrix', () => {
  test('marks CMSIS-DAP as the recommended pure web debug path', () => {
    const matrix = createProbeCapabilityMatrix('cmsis-dap')

    expect(matrix.summary).toEqual({
      label: 'CMSIS-DAP',
      tone: 'ok',
      detail: '推荐路径：RTT / 调试 / 内存访问可走纯网页内核',
    })
    expect(matrix.capabilities.map(item => [item.key, item.state])).toEqual([
      ['usb-detect', 'ok'],
      ['rtt', 'ok'],
      ['debug', 'ok'],
      ['flash', 'warn'],
    ])
  })

  test('marks ST-Link as supported through the current web workbench path', () => {
    const matrix = createProbeCapabilityMatrix('stlink-v3')

    expect(matrix.summary.tone).toBe('ok')
    expect(matrix.summary.detail).toContain('当前 WebUSB 路径')
    expect(matrix.capabilities.find(item => item.key === 'rtt')?.state).toBe('ok')
    expect(matrix.capabilities.find(item => item.key === 'debug')?.state).toBe('ok')
  })

  test('marks J-Link as detectable but experimental for full RTT and debug', () => {
    const matrix = createProbeCapabilityMatrix('jlink')

    expect(matrix.summary).toEqual({
      label: 'J-Link',
      tone: 'warn',
      detail: '可被 WebUSB 检测；完整 J-Link RTT/debug 协议尚未启用',
    })
    expect(matrix.capabilities.map(item => [item.key, item.state])).toEqual([
      ['usb-detect', 'ok'],
      ['rtt', 'warn'],
      ['debug', 'warn'],
      ['flash', 'warn'],
    ])
    expect(matrix.warning).toContain('当前不是设备故障')
  })

  test('uses a neutral matrix before a probe is selected', () => {
    const matrix = createProbeCapabilityMatrix(null)

    expect(matrix.summary.tone).toBe('idle')
    expect(matrix.capabilities.every(item => item.state === 'idle')).toBe(true)
  })
})
