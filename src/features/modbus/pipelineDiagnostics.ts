import type { ModbusParseResult } from '../../types/modbus'

export interface ModbusPipelineDiagnosticInput {
  result: ModbusParseResult | null
  error?: string
}

export interface ModbusPipelineDiagnostics {
  total: number
  success: number
  failed: number
  exceptionFrames: number
  successRate: number
  lastError: string
}

export function summarizeModbusPipeline(items: ModbusPipelineDiagnosticInput[]): ModbusPipelineDiagnostics {
  let success = 0
  let failed = 0
  let exceptionFrames = 0
  let lastError = ''

  for (const item of items) {
    if (item.result?.success) {
      success += 1
      if (item.result.frame && item.result.frame.functionCode >= 0x80) {
        exceptionFrames += 1
      }
      continue
    }

    failed += 1
    if (!lastError) {
      lastError = item.error || item.result?.error || ''
    }
  }

  const total = items.length
  const successRate = total === 0 ? 0 : Math.round((success / total) * 100)

  return {
    total,
    success,
    failed,
    exceptionFrames,
    successRate,
    lastError,
  }
}

export function estimateModbusResponseGap(sentRequests: number, parsedResponses: number): number {
  return Math.max(0, sentRequests - parsedResponses)
}
