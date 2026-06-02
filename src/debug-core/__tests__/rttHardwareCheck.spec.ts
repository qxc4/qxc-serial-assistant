import { describe, expect, test } from 'vitest'
import {
  createIdleRttHardwareCheckSteps,
  createMockRttHardwareCheckDefinitions,
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
})
