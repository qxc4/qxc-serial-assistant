import { describe, expect, test } from 'vitest'
import { summarizeBreakpointSlots } from '../debugDiagnostics'

describe('rtt debug diagnostics', () => {
  test('reports cached breakpoints while disconnected', () => {
    expect(summarizeBreakpointSlots(null, 2, false)).toEqual({
      tone: 'idle',
      label: '未连接',
      detail: '已缓存 2 个断点',
    })
  })

  test('warns before hardware slot status is available', () => {
    expect(summarizeBreakpointSlots(null, 0, true).tone).toBe('warn')
  })

  test('detects over-allocated hardware breakpoints', () => {
    expect(summarizeBreakpointSlots({ used: 2, total: 2, remaining: 0 }, 3, true)).toEqual({
      tone: 'error',
      label: '超出槽位',
      detail: '配置 3 个，硬件仅 2 个',
    })
  })

  test('summarizes healthy slot usage', () => {
    expect(summarizeBreakpointSlots({ used: 1, total: 4, remaining: 3 }, 1, true)).toEqual({
      tone: 'ok',
      label: '槽位正常',
      detail: '1/4 已占用，剩余 3',
    })
  })
})
