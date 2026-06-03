import { describe, expect, test } from 'vitest'
import {
  createIdleRttHardwareCheckSteps,
  createMockRttHardwareCheckDefinitions,
  createRttHardwareCheckFailureGroups,
  createRttHardwareCheckSummaryText,
  runRttHardwareChecks,
  serializeRttHardwareCheckReport,
  summarizeRttHardwareCheckSteps,
} from '../rttHardwareCheck'

describe('rttHardwareCheck', () => {
  test('creates idle steps in fixed hardware acceptance order', () => {
    expect(createIdleRttHardwareCheckSteps().map(step => step.key)).toEqual([
      'browser',
      'probe',
      'target-id',
      'ram-read',
      'ram-write',
      'rtt-scan',
      'up-channel',
      'down-channel',
    ])
  })

  test('runs mock hardware checks and summarizes the report', async () => {
    const report = await runRttHardwareChecks(createMockRttHardwareCheckDefinitions(), 'mock')

    expect(report.mode).toBe('mock')
    expect(report.steps).toHaveLength(8)
    expect(report.summary.passed).toBe(8)
    expect(report.summary.failed).toBe(0)
  })

  test('records failed steps without aborting later checks', async () => {
    const report = await runRttHardwareChecks([
      {
        key: 'browser',
        label: '浏览器能力',
        suggestion: '使用 Chrome/Edge',
        async run() {
          throw new Error('WebUSB 不可用')
        },
      },
      {
        key: 'probe',
        label: '探针识别',
        suggestion: '重新授权',
        async run() {
          return '已识别'
        },
      },
    ], 'real')

    expect(report.summary.failed).toBe(1)
    expect(report.summary.passed).toBe(1)
    expect(report.steps[0]?.detail).toBe('WebUSB 不可用')
  })

  test('summarizes and serializes reports', async () => {
    expect(summarizeRttHardwareCheckSteps([
      { key: 'browser', label: '浏览器', status: 'pass', detail: '', suggestion: '', durationMs: 1 },
      { key: 'probe', label: '探针', status: 'skip', detail: '', suggestion: '', durationMs: 1 },
    ], 20)).toEqual({ passed: 1, failed: 0, skipped: 1, durationMs: 20 })

    const report = await runRttHardwareChecks(createMockRttHardwareCheckDefinitions(), 'mock')
    expect(JSON.parse(serializeRttHardwareCheckReport(report)).summary.passed).toBe(8)
  })

  test('groups failed hardware check steps by reason', () => {
    const failedSteps = [
      {
        key: 'probe' as const,
        label: '探针识别',
        status: 'fail' as const,
        detail: 'USB 授权被拒绝',
        suggestion: '重新授权',
        durationMs: 2,
      },
      {
        key: 'target-id' as const,
        label: 'DPIDR / CPUID',
        status: 'fail' as const,
        detail: 'USB 授权被拒绝',
        suggestion: '重新授权',
        durationMs: 2,
      },
      {
        key: 'rtt-scan' as const,
        label: 'RTT CB 扫描',
        status: 'fail' as const,
        detail: '未找到 RTT Control Block',
        suggestion: '检查扫描范围',
        durationMs: 3,
      },
    ]

    expect(createRttHardwareCheckFailureGroups(failedSteps)).toEqual([
      {
        reason: 'USB 授权被拒绝',
        count: 2,
        steps: ['探针识别', 'DPIDR / CPUID'],
        suggestion: '重新授权',
      },
      {
        reason: '未找到 RTT Control Block',
        count: 1,
        steps: ['RTT CB 扫描'],
        suggestion: '检查扫描范围',
      },
    ])
  })

  test('creates a copyable hardware check summary', async () => {
    const report = await runRttHardwareChecks([
      {
        key: 'browser',
        label: '浏览器能力',
        suggestion: '使用 Chrome/Edge',
        async run() {
          return 'WebUSB 可用'
        },
      },
      {
        key: 'probe',
        label: '探针识别',
        suggestion: '重新授权',
        async run() {
          throw new Error('未选择 USB 设备')
        },
      },
    ], 'real')

    const summary = createRttHardwareCheckSummaryText(report)

    expect(summary).toContain('RTT 硬件验收诊断')
    expect(summary).toContain('模式: real')
    expect(summary).toContain('通过: 1')
    expect(summary).toContain('失败: 1')
    expect(summary).toContain('探针识别: fail - 未选择 USB 设备')
    expect(summary).toContain('建议: 重新授权')
  })
})
