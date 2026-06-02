export interface ModbusPollingSettings {
  intervalMs: number
  maxCycles: number
}

export interface NormalizedModbusPollingSettings extends ModbusPollingSettings {
  isUnlimited: boolean
}

const MIN_INTERVAL_MS = 100
const MAX_INTERVAL_MS = 60_000
const MAX_CYCLES = 999_999

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.floor(value)))
}

export function normalizeModbusPollingSettings(settings: ModbusPollingSettings): NormalizedModbusPollingSettings {
  const intervalMs = clampInteger(settings.intervalMs, MIN_INTERVAL_MS, MAX_INTERVAL_MS)
  const maxCycles = clampInteger(settings.maxCycles, 0, MAX_CYCLES)

  return {
    intervalMs,
    maxCycles,
    isUnlimited: maxCycles === 0,
  }
}

export function shouldContinueModbusPolling(sentCycles: number, maxCycles: number): boolean {
  return maxCycles === 0 || sentCycles < maxCycles
}

export function formatModbusPollingProgress(sentCycles: number, maxCycles: number): string {
  return maxCycles === 0 ? `${sentCycles} / 无限` : `${sentCycles} / ${maxCycles}`
}
