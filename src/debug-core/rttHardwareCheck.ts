export type HardwareCheckStatus = 'idle' | 'running' | 'pass' | 'fail' | 'skip'

export type RttHardwareCheckStepKey =
  | 'browser'
  | 'probe'
  | 'target-id'
  | 'ram-read'
  | 'ram-write'
  | 'rtt-scan'
  | 'up-channel'
  | 'down-channel'

export interface RttHardwareCheckStep {
  key: RttHardwareCheckStepKey
  label: string
  status: HardwareCheckStatus
  detail: string
  suggestion: string
  durationMs: number
}

export interface RttHardwareCheckReport {
  id: string
  mode: 'real' | 'mock'
  startedAt: number
  finishedAt: number
  steps: RttHardwareCheckStep[]
  summary: {
    passed: number
    failed: number
    skipped: number
    durationMs: number
  }
}

export interface RttHardwareCheckDefinition {
  key: RttHardwareCheckStepKey
  label: string
  suggestion: string
  run(): Promise<string>
}

export const RTT_HARDWARE_CHECK_LABELS: Record<RttHardwareCheckStepKey, { label: string; suggestion: string }> = {
  browser: {
    label: '浏览器能力',
    suggestion: '请使用 Chrome/Edge 桌面端，并通过 HTTPS 或 localhost 访问。',
  },
  probe: {
    label: '探针识别',
    suggestion: '重新插拔探针，确认浏览器 USB 授权窗口选择了正确设备。',
  },
  'target-id': {
    label: 'DPIDR / CPUID',
    suggestion: '降低 SWD 频率，检查 SWDIO/SWCLK/NRST/GND 和目标供电。',
  },
  'ram-read': {
    label: 'RAM 读取',
    suggestion: '检查芯片是否读保护、目标是否复位保持或地址范围是否正确。',
  },
  'ram-write': {
    label: 'RAM 写回读',
    suggestion: '确认测试地址位于可写 SRAM，避免覆盖应用关键数据。',
  },
  'rtt-scan': {
    label: 'RTT CB 扫描',
    suggestion: '确认固件已链接 SEGGER_RTT.c，扫描范围覆盖 RTT Control Block 所在 RAM。',
  },
  'up-channel': {
    label: 'Up 通道读取',
    suggestion: '确认目标程序正在运行并持续写入 RTT 日志。',
  },
  'down-channel': {
    label: 'Down 通道写入',
    suggestion: '确认目标固件启用了 Down buffer，并处理主机写入数据。',
  },
}

export function createIdleRttHardwareCheckSteps(): RttHardwareCheckStep[] {
  return Object.entries(RTT_HARDWARE_CHECK_LABELS).map(([key, config]) => ({
    key: key as RttHardwareCheckStepKey,
    label: config.label,
    status: 'idle',
    detail: '等待运行',
    suggestion: config.suggestion,
    durationMs: 0,
  }))
}

export async function runRttHardwareChecks(
  definitions: RttHardwareCheckDefinition[],
  mode: RttHardwareCheckReport['mode'],
  onStep?: (step: RttHardwareCheckStep) => void,
): Promise<RttHardwareCheckReport> {
  const startedAt = Date.now()
  const steps: RttHardwareCheckStep[] = []

  for (const definition of definitions) {
    const running: RttHardwareCheckStep = {
      key: definition.key,
      label: definition.label,
      status: 'running',
      detail: '检查中',
      suggestion: definition.suggestion,
      durationMs: 0,
    }
    onStep?.(running)
    const stepStartedAt = Date.now()
    try {
      const detail = await definition.run()
      const step: RttHardwareCheckStep = {
        ...running,
        status: 'pass',
        detail,
        durationMs: Date.now() - stepStartedAt,
      }
      steps.push(step)
      onStep?.(step)
    } catch (error) {
      const step: RttHardwareCheckStep = {
        ...running,
        status: 'fail',
        detail: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - stepStartedAt,
      }
      steps.push(step)
      onStep?.(step)
    }
  }

  const finishedAt = Date.now()
  return {
    id: `rtt-check-${startedAt}`,
    mode,
    startedAt,
    finishedAt,
    steps,
    summary: summarizeRttHardwareCheckSteps(steps, finishedAt - startedAt),
  }
}

export function summarizeRttHardwareCheckSteps(steps: RttHardwareCheckStep[], durationMs = 0): RttHardwareCheckReport['summary'] {
  return {
    passed: steps.filter(step => step.status === 'pass').length,
    failed: steps.filter(step => step.status === 'fail').length,
    skipped: steps.filter(step => step.status === 'skip').length,
    durationMs,
  }
}

export function createMockRttHardwareCheckDefinitions(): RttHardwareCheckDefinition[] {
  return Object.entries(RTT_HARDWARE_CHECK_LABELS).map(([key, config]) => ({
    key: key as RttHardwareCheckStepKey,
    label: config.label,
    suggestion: config.suggestion,
    async run() {
      const details: Record<RttHardwareCheckStepKey, string> = {
        browser: 'Mock WebUSB 可用',
        probe: 'Mock ST-Link V3 已识别',
        'target-id': 'DPIDR 0x2BA01477 / CPUID 0x410FC241',
        'ram-read': '0x20000000 读取 16 bytes 成功',
        'ram-write': '0x20000000 写回读校验成功',
        'rtt-scan': '0x20000100 找到 SEGGER RTT Control Block',
        'up-channel': 'Up 0 读取 12 bytes',
        'down-channel': 'Down 0 写入 ping 成功',
      }
      return details[key as RttHardwareCheckStepKey]
    },
  }))
}

export function serializeRttHardwareCheckReport(report: RttHardwareCheckReport): string {
  return JSON.stringify(report, null, 2)
}
