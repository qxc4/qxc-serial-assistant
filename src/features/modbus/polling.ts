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

export interface ModbusPollingTaskImportResult {
  success: boolean
  tasks: ModbusPollingTask[]
  error?: string
}

export interface ModbusPollingResultFilter {
  taskName?: string
  status?: ModbusPollingResult['status'] | 'all'
  query?: string
}

const MIN_INTERVAL_MS = 100
const MAX_INTERVAL_MS = 60_000
const MAX_CYCLES = 999_999
const MIN_TIMEOUT_MS = 50
const MAX_TIMEOUT_MS = 60_000
const MAX_RETRIES = 10
const MAX_IMPORT_TASKS = 200

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

export function resetModbusPollingTaskStats(task: ModbusPollingTask): ModbusPollingTask {
  return {
    ...task,
    sent: 0,
    success: 0,
    failed: 0,
    status: 'idle',
    lastError: '',
    lastRunAt: null,
  }
}

export function duplicateModbusPollingTask(task: ModbusPollingTask, index: number, now = Date.now()): ModbusPollingTask {
  return createModbusPollingTask({
    name: `${task.name} 副本`,
    address: task.address,
    functionCode: task.functionCode,
    startAddress: task.startAddress,
    quantity: task.quantity,
    writeValue: task.writeValue,
    intervalMs: task.intervalMs,
    timeoutMs: task.timeoutMs,
    retries: task.retries,
    failurePolicy: task.failurePolicy,
  }, index, now)
}

export function filterModbusPollingResults(
  results: ModbusPollingResult[],
  filter: ModbusPollingResultFilter,
): ModbusPollingResult[] {
  const taskName = filter.taskName?.trim().toLowerCase() ?? ''
  const query = filter.query?.trim().toLowerCase() ?? ''
  const status = filter.status ?? 'all'

  return results.filter(result => {
    if (status !== 'all' && result.status !== status) return false
    if (taskName && !result.taskName.toLowerCase().includes(taskName)) return false
    if (!query) return true

    return [
      result.taskName,
      result.requestHex,
      result.responseHex,
      result.error,
      result.status,
    ].some(value => value.toLowerCase().includes(query))
  })
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function readFailurePolicy(value: unknown): ModbusPollingFailurePolicy {
  return value === 'stop' ? 'stop' : 'continue'
}

export function parseModbusPollingTasksImport(raw: string, now = Date.now()): ModbusPollingTaskImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { success: false, tasks: [], error: '导入文件不是有效 JSON' }
  }

  if (!isObject(parsed) || !Array.isArray(parsed.tasks)) {
    return { success: false, tasks: [], error: '导入文件缺少 tasks 数组' }
  }

  if (parsed.tasks.length === 0) {
    return { success: false, tasks: [], error: '导入文件没有轮询任务' }
  }

  const tasks = parsed.tasks
    .slice(0, MAX_IMPORT_TASKS)
    .filter(isObject)
    .map((task, index) => createModbusPollingTask({
      name: readString(task.name, `导入任务 ${index + 1}`),
      address: readNumber(task.address, 1),
      functionCode: readNumber(task.functionCode, 3),
      startAddress: readNumber(task.startAddress, 0),
      quantity: readNumber(task.quantity, 1),
      writeValue: readString(task.writeValue),
      intervalMs: readNumber(task.intervalMs, 1000),
      timeoutMs: readNumber(task.timeoutMs, 1000),
      retries: readNumber(task.retries, 0),
      failurePolicy: readFailurePolicy(task.failurePolicy),
    }, index, now))

  if (tasks.length === 0) {
    return { success: false, tasks: [], error: '导入文件没有可用任务' }
  }

  return { success: true, tasks }
}
