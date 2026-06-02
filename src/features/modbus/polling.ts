export interface ModbusPollingSettings {
  intervalMs: number
  maxCycles: number
}

export type ModbusPollingFailurePolicy = 'continue' | 'stop'
export type ModbusPollingTaskStatus = 'idle' | 'running' | 'success' | 'timeout' | 'failed'

export interface NormalizedModbusPollingSettings extends ModbusPollingSettings {
  isUnlimited: boolean
}

export interface ModbusPollingTask {
  id: string
  name: string
  enabled: boolean
  address: number
  functionCode: number
  startAddress: number
  quantity: number
  writeValue: string
  intervalMs: number
  timeoutMs: number
  retries: number
  failurePolicy: ModbusPollingFailurePolicy
  sent: number
  success: number
  failed: number
  status: ModbusPollingTaskStatus
  lastError: string
  lastRunAt: number | null
}

export interface ModbusPollingTaskDraft {
  name?: string
  address: number
  functionCode: number
  startAddress: number
  quantity: number
  writeValue: string
  intervalMs?: number
  timeoutMs?: number
  retries?: number
  failurePolicy?: ModbusPollingFailurePolicy
}

export interface ModbusPollingResult {
  id: string
  taskId: string
  taskName: string
  timestamp: number
  attempt: number
  status: 'success' | 'timeout' | 'failed'
  durationMs: number
  requestHex: string
  responseHex: string
  error: string
}

export interface ModbusPollingSchedulerState {
  isRunning: boolean
  activeTaskId: string
  cycle: number
  sent: number
  success: number
  failed: number
  lastError: string
}

const MIN_INTERVAL_MS = 100
const MAX_INTERVAL_MS = 60_000
const MAX_CYCLES = 999_999
const MIN_TIMEOUT_MS = 50
const MAX_TIMEOUT_MS = 60_000
const MAX_RETRIES = 10

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

export function createModbusPollingTask(draft: ModbusPollingTaskDraft, index: number, now = Date.now()): ModbusPollingTask {
  const normalizedInterval = normalizeModbusPollingSettings({
    intervalMs: draft.intervalMs ?? 1000,
    maxCycles: 0,
  }).intervalMs
  const timeoutMs = clampInteger(draft.timeoutMs ?? 1000, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
  const retries = clampInteger(draft.retries ?? 0, 0, MAX_RETRIES)
  const functionCode = clampInteger(draft.functionCode, 1, 255)

  return {
    id: `poll-${now}-${index}`,
    name: draft.name?.trim() || `任务 ${index + 1}`,
    enabled: true,
    address: clampInteger(draft.address, 0, 247),
    functionCode,
    startAddress: clampInteger(draft.startAddress, 0, 65535),
    quantity: clampInteger(draft.quantity, 1, 125),
    writeValue: draft.writeValue,
    intervalMs: normalizedInterval,
    timeoutMs,
    retries,
    failurePolicy: draft.failurePolicy ?? 'continue',
    sent: 0,
    success: 0,
    failed: 0,
    status: 'idle',
    lastError: '',
    lastRunAt: null,
  }
}

export function getEnabledModbusPollingTasks(tasks: ModbusPollingTask[]): ModbusPollingTask[] {
  return tasks.filter(task => task.enabled)
}

export function doesModbusResponseMatchTask(
  task: Pick<ModbusPollingTask, 'address' | 'functionCode'>,
  frame: { address: number; functionCode: number } | undefined,
): boolean {
  if (!frame) return false
  const normalizedFunctionCode = frame.functionCode & 0x7f
  return frame.address === task.address && normalizedFunctionCode === task.functionCode
}

export function updateModbusPollingTaskAfterResult(
  task: ModbusPollingTask,
  status: ModbusPollingResult['status'],
  timestamp: number,
  error = '',
): ModbusPollingTask {
  return {
    ...task,
    sent: task.sent + 1,
    success: status === 'success' ? task.success + 1 : task.success,
    failed: status === 'success' ? task.failed : task.failed + 1,
    status,
    lastError: error,
    lastRunAt: timestamp,
  }
}

export function summarizeModbusPollingTasks(tasks: ModbusPollingTask[]): ModbusPollingSchedulerState {
  const sent = tasks.reduce((sum, task) => sum + task.sent, 0)
  const success = tasks.reduce((sum, task) => sum + task.success, 0)
  const failed = tasks.reduce((sum, task) => sum + task.failed, 0)
  const active = tasks.find(task => task.status === 'running')
  const lastErrorTask = [...tasks].reverse().find(task => task.lastError)

  return {
    isRunning: Boolean(active),
    activeTaskId: active?.id ?? '',
    cycle: 0,
    sent,
    success,
    failed,
    lastError: lastErrorTask?.lastError ?? '',
  }
}

export function serializeModbusPollingTasks(tasks: ModbusPollingTask[]): string {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks,
  }, null, 2)
}
