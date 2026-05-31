export interface RttScanRangeInput {
  start?: number
  end?: number
  chunkSize?: number
  stepSize?: number
}

export interface RttScanRange {
  start: number
  end: number
  chunkSize: number
  stepSize: number
}

const DEFAULT_RTT_SCAN_RANGE: RttScanRange = {
  start: 0x20000000,
  end: 0x20040000,
  chunkSize: 1024,
  stepSize: 16,
}

export function normalizeRttScanRange(input: RttScanRangeInput): RttScanRange {
  const range = { ...DEFAULT_RTT_SCAN_RANGE, ...input }

  if (!Number.isInteger(range.start) || range.start < 0) {
    throw new Error('RTT scan start must be a non-negative integer address')
  }
  if (!Number.isInteger(range.end) || range.end <= range.start) {
    throw new Error('RTT scan end must be greater than start')
  }
  if (!Number.isInteger(range.chunkSize) || range.chunkSize <= 0) {
    throw new Error('RTT scan chunk size must be positive')
  }
  if (!Number.isInteger(range.stepSize) || range.stepSize <= 0) {
    throw new Error('RTT scan step size must be positive')
  }

  return range
}
