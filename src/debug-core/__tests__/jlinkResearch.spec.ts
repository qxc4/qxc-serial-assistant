import { describe, expect, it } from 'vitest'
import { createJLinkDiagnosticReport, JLINK_SUPPORT_ROUTES } from '../jlinkResearch'

describe('jlinkResearch', () => {
  it('describes J-Link support routes without claiming pure web support', () => {
    expect(JLINK_SUPPORT_ROUTES.map(route => route.key)).toEqual([
      'pure-web-protocol',
      'segger-gdb-server',
      'local-relay',
      'sdk-integration',
    ])
    expect(JLINK_SUPPORT_ROUTES.find(route => route.key === 'sdk-integration')?.status).toBe('requires-license')
  })

  it('creates a detected-device diagnostic report', () => {
    const report = createJLinkDiagnosticReport(true)

    expect(report.title).toBe('已检测到 J-Link')
    expect(report.summary).toContain('不是探针故障')
    expect(report.warnings[0]).toContain('不恢复 RTT Bridge')
  })
})
