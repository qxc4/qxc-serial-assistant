export interface BreakpointSlotStatusLike {
  used: number
  total: number
  remaining: number
}

export type DebugDiagnosticTone = 'ok' | 'warn' | 'error' | 'idle'

export interface BreakpointSlotDiagnostic {
  tone: DebugDiagnosticTone
  label: string
  detail: string
}

export function summarizeBreakpointSlots(
  status: BreakpointSlotStatusLike | null,
  configuredBreakpoints: number,
  isConnected: boolean,
): BreakpointSlotDiagnostic {
  if (!isConnected) {
    return {
      tone: 'idle',
      label: '未连接',
      detail: configuredBreakpoints > 0 ? `已缓存 ${configuredBreakpoints} 个断点` : '连接目标后读取 FPB 槽位',
    }
  }

  if (!status) {
    return {
      tone: 'warn',
      label: '读取中',
      detail: '尚未读取 Cortex-M FPB 槽位信息',
    }
  }

  if (configuredBreakpoints > status.total) {
    return {
      tone: 'error',
      label: '超出槽位',
      detail: `配置 ${configuredBreakpoints} 个，硬件仅 ${status.total} 个`,
    }
  }

  if (status.remaining === 0) {
    return {
      tone: 'warn',
      label: '槽位已满',
      detail: `${status.used}/${status.total} 已占用`,
    }
  }

  if (status.remaining === 1) {
    return {
      tone: 'warn',
      label: '剩余 1 个',
      detail: `${status.used}/${status.total} 已占用`,
    }
  }

  return {
    tone: 'ok',
    label: '槽位正常',
    detail: `${status.used}/${status.total} 已占用，剩余 ${status.remaining}`,
  }
}
