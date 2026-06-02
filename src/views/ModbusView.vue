<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { 
  FileCode, 
  Send, 
  Trash2, 
  Download, 
  ChevronDown, 
  ChevronUp,
  CheckCircle2,
  XCircle,
  Copy,
  Cpu,
  Table,
  FileSpreadsheet
} from 'lucide-vue-next'
import { useSettingsStore } from '../stores/settings'
import { useI18n } from '../composables/useI18n'
import { useSerial } from '../composables/useSerial'
import { buildModbusFrame } from '../utils/modbus'
import { calculateAllChecksums } from '../utils/checksum'
import { functionCodeNames } from '../types/modbus'
import type { ModbusParseResult, ModbusMode } from '../types/modbus'
import {
  bytesToHexInput,
  createModbusPollingTask,
  doesModbusResponseMatchTask,
  estimateModbusResponseGap,
  formatModbusPollingProgress,
  getEnabledModbusPollingTasks,
  normalizeModbusPollingSettings,
  parseCompleteModbusFrame,
  parseRegisterData,
  serializeModbusPollingTasks,
  shouldContinueModbusPolling,
  summarizeModbusPipeline,
  summarizeModbusPollingTasks,
  updateModbusPollingTaskAfterResult,
  type ByteOrder,
  type DataType,
  type ModbusPollingResult,
  type ModbusPollingTask,
  type RegisterValue,
} from '../features/modbus'

const settingsStore = useSettingsStore()
const { t } = useI18n()
const {
  isConnected: isSerialConnected,
  baudRate,
  send: sendSerial,
  onDataReceive,
} = useSerial()

/** 当前解析模式 */
const parseMode = ref<ModbusMode>('rtu')

/** 数据类型设置 */
const dataTypeSettings = ref<{
  type: DataType
  byteOrder: ByteOrder
}>({
  type: 'uint16',
  byteOrder: 'ABCD'
})

/** 输入的十六进制数据 */
const inputHex = ref('')

interface ParseResultItem {
  id: string
  timestamp: number
  input: string
  mode: ModbusMode
  result: ModbusParseResult | null
  checksums: Array<{ type: string; value: string }>
  registers: RegisterValue[]
  error?: string
}

const parseResults = ref<ParseResultItem[]>([])

/** 构建设置 */
const buildSettings = ref({
  address: 1,
  functionCode: 3,
  startAddress: 0,
  quantity: 1,
  writeValue: ''
})

/** 构建结果 */
const buildResult = ref('')

const autoParseSerialResponse = ref(true)
const isSendingModbusRequest = ref(false)
const lastSerialResponseAt = ref<number | null>(null)
const pollingSettings = ref({
  intervalMs: 1000,
  maxCycles: 0,
})
const isPollingModbus = ref(false)
const sentPollingCycles = ref(0)
const lastPollingSentAt = ref<number | null>(null)
const lastPollingError = ref('')
let pollingTimer: ReturnType<typeof setInterval> | null = null
let isPollingTickInFlight = false
const pollingTasks = ref<ModbusPollingTask[]>([])
const pollingResults = ref<ModbusPollingResult[]>([])
const isTaskPolling = ref(false)
const activePollingTaskId = ref('')
const pollingTaskCycle = ref(0)
const pendingPollingResponse = ref<{
  task: ModbusPollingTask
  resolve: (value: { bytes: number[]; result: ModbusParseResult }) => void
} | null>(null)
let stopTaskPollingRequested = false

/** 展开的解析结果 */
const expandedResult = ref<string | null>(null)

const successfulResultCount = computed(() => parseResults.value.filter(item => item.result?.success).length)
const failedResultCount = computed(() => parseResults.value.filter(item => !item.result?.success).length)
const normalizedPollingSettings = computed(() => normalizeModbusPollingSettings(pollingSettings.value))
const pollingProgressLabel = computed(() => formatModbusPollingProgress(sentPollingCycles.value, normalizedPollingSettings.value.maxCycles))
const pipelineDiagnostics = computed(() => summarizeModbusPipeline(parseResults.value))
const pollingResponseGap = computed(() => estimateModbusResponseGap(sentPollingCycles.value, pipelineDiagnostics.value.total))
const taskPollingSummary = computed(() => ({
  ...summarizeModbusPollingTasks(pollingTasks.value),
  isRunning: isTaskPolling.value,
  activeTaskId: activePollingTaskId.value,
  cycle: pollingTaskCycle.value,
}))
const activeParseResult = computed(() => {
  return parseResults.value.find(item => item.id === expandedResult.value) || parseResults.value[0] || null
})

/** 数据类型选项 */
const dataTypeOptions = computed<{ value: DataType; label: string; bytes: number }[]>(() => [
  { value: 'uint16', label: t('modbus.uint16'), bytes: 2 },
  { value: 'int16', label: t('modbus.int16'), bytes: 2 },
  { value: 'uint32', label: t('modbus.uint32'), bytes: 4 },
  { value: 'int32', label: t('modbus.int32'), bytes: 4 },
  { value: 'float32', label: t('modbus.float32'), bytes: 4 }
])

/** 字节序选项 */
const byteOrderOptions = computed<{ value: ByteOrder; label: string }[]>(() => [
  { value: 'ABCD', label: t('modbus.abcd') },
  { value: 'DCBA', label: t('modbus.dcba') },
  { value: 'BADC', label: t('modbus.badc') },
  { value: 'CDAB', label: t('modbus.cdab') }
])

/** 功能码选项 */
const functionCodeOptions = computed(() => [
  { value: 1, label: t('modbus.fc01'), needsQuantity: true },
  { value: 2, label: t('modbus.fc02'), needsQuantity: true },
  { value: 3, label: t('modbus.fc03'), needsQuantity: true },
  { value: 4, label: t('modbus.fc04'), needsQuantity: true },
  { value: 5, label: t('modbus.fc05'), needsValue: true },
  { value: 6, label: t('modbus.fc06'), needsValue: true },
  { value: 15, label: t('modbus.fc15'), needsValue: true },
  { value: 16, label: t('modbus.fc16'), needsValue: true }
])

/** 当前选中的功能码配置 */
const selectedFunctionCode = computed(() => {
  return functionCodeOptions.value.find(fc => fc.value === buildSettings.value.functionCode)
})

function appendParseResult(input: string, bytes: number[], result: ModbusParseResult | null, error?: string): void {
  const item: ParseResultItem = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    input,
    mode: parseMode.value,
    result,
    checksums: calculateAllChecksums(bytes),
    registers: [],
    error,
  }

  if (result && !result.success) {
    item.error = result.error
  }

  if (result?.success && result.frame) {
    const fc = result.frame.functionCode
    if ([0x03, 0x04].includes(fc) && result.frame.data.length > 1) {
      const byteCount = result.frame.data[0]
      const registerData = result.frame.data.slice(1, 1 + byteCount)
      item.registers = parseRegisterData(
        registerData,
        0,
        dataTypeSettings.value.type,
        dataTypeSettings.value.byteOrder,
      )
    }
  }

  parseResults.value.unshift(item)
  expandedResult.value = item.id

  if (parseResults.value.length > 100) {
    parseResults.value = parseResults.value.slice(0, 100)
  }
}

/**
 * 解析输入数据
 */
function handleParse() {
  const hex = inputHex.value.trim().replace(/\s/g, '')
  if (!hex) return
  
  if (!/^[0-9A-Fa-f]+$/.test(hex)) {
    settingsStore.showToast(t('modbus.invalidHex'))
    return
  }
  
  const paddedHex = hex.length % 2 === 1 ? '0' + hex : hex
  const bytes: number[] = []
  
  for (let i = 0; i < paddedHex.length; i += 2) {
    const byteStr = paddedHex.substring(i, i + 2)
    const byte = parseInt(byteStr, 16)
    if (!isNaN(byte)) {
      bytes.push(byte)
    }
  }
  
  if (bytes.length === 0) {
    settingsStore.showToast(t('modbus.invalidHex'))
    return
  }
  
  try {
    const result = parseCompleteModbusFrame(bytes, parseMode.value, baudRate.value)
    appendParseResult(inputHex.value.trim(), bytes, result, result ? undefined : '帧未完整或无法解析')
  } catch (e) {
    settingsStore.showToast(t('modbus.buildFailed'))
    console.error('解析失败:', e)
  }
}

/**
 * 构建 Modbus 帧
 */
function buildModbusRequestData(functionCode: number, startAddress: number, quantity: number, writeValue: string): number[] | null {
  if (startAddress < 0 || startAddress > 65535) {
    settingsStore.showToast('起始地址必须在 0-65535 范围内')
    return null
  }
  
  if (quantity < 1 || quantity > 125) {
    settingsStore.showToast('数量必须在 1-125 范围内')
    return null
  }
  
  switch (functionCode) {
    case 1:
    case 2:
    case 3:
    case 4:
      return [
        (startAddress >> 8) & 0xFF,
        startAddress & 0xFF,
        (quantity >> 8) & 0xFF,
        quantity & 0xFF
      ]
    
    case 5: {
      const coilValue = writeValue === '1' || writeValue.toUpperCase() === 'ON' ? 0xFF00 : 0x0000
      return [
        (startAddress >> 8) & 0xFF,
        startAddress & 0xFF,
        (coilValue >> 8) & 0xFF,
        coilValue & 0xFF
      ]
    }
    
    case 6: {
      const regValue = parseInt(writeValue, 10) || 0
      if (regValue < 0 || regValue > 65535) {
        settingsStore.showToast('写入值必须在 0-65535 范围内')
        return null
      }
      return [
        (startAddress >> 8) & 0xFF,
        startAddress & 0xFF,
        (regValue >> 8) & 0xFF,
        regValue & 0xFF
      ]
    }
    
    case 15:
    case 16: {
      const values = writeValue.split(',').map(v => parseInt(v.trim(), 10) || 0)
      if (values.length === 0 || values.length > 123) {
        settingsStore.showToast('写入值数量必须在 1-123 范围内')
        return null
      }
      const byteCount = functionCode === 15 ? Math.ceil(values.length / 8) : values.length * 2
      return [
        (startAddress >> 8) & 0xFF,
        startAddress & 0xFF,
        (values.length >> 8) & 0xFF,
        values.length & 0xFF,
        byteCount,
        ...values.flatMap(v => functionCode === 16 ? [(v >> 8) & 0xFF, v & 0xFF] : [v])
      ]
    }
  }

  settingsStore.showToast('暂不支持该功能码')
  return null
}

function buildFrameHexFromRequest(address: number, functionCode: number, startAddress: number, quantity: number, writeValue: string): string {
  if (address < 0 || address > 247) {
    settingsStore.showToast('从站地址必须在 0-247 范围内')
    return ''
  }

  const data = buildModbusRequestData(functionCode, startAddress, quantity, writeValue)
  if (!data) return ''
  const frame = buildModbusFrame(address, functionCode, data, parseMode.value)
  return frame.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
}

function handleBuild() {
  const { address, functionCode, startAddress, quantity, writeValue } = buildSettings.value
  
  try {
    const frame = buildFrameHexFromRequest(address, functionCode, startAddress, quantity, writeValue)
    if (!frame) return
    buildResult.value = frame
  } catch (e) {
    settingsStore.showToast(t('modbus.buildFailed') + '：' + (e instanceof Error ? e.message : String(e)))
  }
}

function useBuildResultAsResponseInput() {
  if (!buildResult.value) return
  inputHex.value = buildResult.value
}

async function handleSendBuiltFrame() {
  try {
    isSendingModbusRequest.value = true
    await sendCurrentModbusFrame()
    settingsStore.showToast('Modbus 请求已发送')
  } catch (error) {
    settingsStore.showToast(`发送失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    isSendingModbusRequest.value = false
  }
}

async function sendCurrentModbusFrame(): Promise<void> {
  if (!buildResult.value) {
    handleBuild()
  }
  if (!buildResult.value) {
    throw new Error('请先构建有效的 Modbus 帧')
  }
  if (!isSerialConnected.value) {
    throw new Error('请先在串口页连接设备')
  }

  await sendSerial(buildResult.value, true)
}

function stopModbusPolling(reason?: string) {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
  isPollingModbus.value = false
  isPollingTickInFlight = false
  if (reason) {
    lastPollingError.value = reason
  }
}

async function runModbusPollingTick() {
  if (isPollingTickInFlight || !isPollingModbus.value) return
  if (!shouldContinueModbusPolling(sentPollingCycles.value, normalizedPollingSettings.value.maxCycles)) {
    stopModbusPolling()
    return
  }

  try {
    isPollingTickInFlight = true
    await sendCurrentModbusFrame()
    sentPollingCycles.value += 1
    lastPollingSentAt.value = Date.now()

    if (!shouldContinueModbusPolling(sentPollingCycles.value, normalizedPollingSettings.value.maxCycles)) {
      stopModbusPolling()
    }
  } catch (error) {
    stopModbusPolling(error instanceof Error ? error.message : String(error))
  } finally {
    isPollingTickInFlight = false
  }
}

function startModbusPolling() {
  stopModbusPolling()
  const normalized = normalizedPollingSettings.value
  pollingSettings.value.intervalMs = normalized.intervalMs
  pollingSettings.value.maxCycles = normalized.maxCycles
  lastPollingError.value = ''
  sentPollingCycles.value = 0

  if (!isSerialConnected.value) {
    settingsStore.showToast('请先在串口页连接设备')
    return
  }

  if (!buildResult.value) {
    handleBuild()
  }
  if (!buildResult.value) return

  isPollingModbus.value = true
  void runModbusPollingTick()
  pollingTimer = setInterval(() => {
    void runModbusPollingTick()
  }, normalized.intervalMs)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

function updatePollingTask(taskId: string, updater: (task: ModbusPollingTask) => ModbusPollingTask): void {
  pollingTasks.value = pollingTasks.value.map(task => task.id === taskId ? updater(task) : task)
}

function addCurrentRequestAsPollingTask(): void {
  const task = createModbusPollingTask({
    name: `从站 ${buildSettings.value.address} / ${functionCodeNames[buildSettings.value.functionCode] || `FC${buildSettings.value.functionCode}`}`,
    address: buildSettings.value.address,
    functionCode: buildSettings.value.functionCode,
    startAddress: buildSettings.value.startAddress,
    quantity: buildSettings.value.quantity,
    writeValue: buildSettings.value.writeValue,
    intervalMs: pollingSettings.value.intervalMs,
    timeoutMs: 1000,
    retries: 1,
    failurePolicy: 'continue',
  }, pollingTasks.value.length)
  pollingTasks.value = [...pollingTasks.value, task]
}

function removePollingTask(taskId: string): void {
  if (isTaskPolling.value) return
  pollingTasks.value = pollingTasks.value.filter(task => task.id !== taskId)
}

function togglePollingTask(taskId: string): void {
  if (isTaskPolling.value) return
  updatePollingTask(taskId, task => ({ ...task, enabled: !task.enabled }))
}

function buildFrameHexFromTask(task: ModbusPollingTask): string {
  return buildFrameHexFromRequest(task.address, task.functionCode, task.startAddress, task.quantity, task.writeValue)
}

function waitForPollingResponse(task: ModbusPollingTask, timeoutMs: number): Promise<{ bytes: number[]; result: ModbusParseResult }> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      if (pendingPollingResponse.value?.task.id === task.id) {
        pendingPollingResponse.value = null
      }
      reject(new Error('响应超时'))
    }, timeoutMs)

    pendingPollingResponse.value = {
      task,
      resolve: value => {
        window.clearTimeout(timeoutId)
        pendingPollingResponse.value = null
        resolve(value)
      },
    }
  })
}

function recordPollingResult(result: ModbusPollingResult): void {
  pollingResults.value = [result, ...pollingResults.value].slice(0, 500)
}

async function runPollingTask(task: ModbusPollingTask): Promise<boolean> {
  const requestHex = buildFrameHexFromTask(task)
  if (!requestHex) return false

  updatePollingTask(task.id, current => ({ ...current, status: 'running', lastError: '' }))
  activePollingTaskId.value = task.id

  for (let attempt = 1; attempt <= task.retries + 1; attempt++) {
    if (stopTaskPollingRequested) return false

    const startedAt = Date.now()
    try {
      const responsePromise = waitForPollingResponse(task, task.timeoutMs)
      await sendSerial(requestHex, true)
      const response = await responsePromise
      const finishedAt = Date.now()
      const updatedTask = updateModbusPollingTaskAfterResult(task, 'success', finishedAt)
      updatePollingTask(task.id, current => ({
        ...updatedTask,
        enabled: current.enabled,
        name: current.name,
        intervalMs: current.intervalMs,
        timeoutMs: current.timeoutMs,
        retries: current.retries,
        failurePolicy: current.failurePolicy,
      }))
      recordPollingResult({
        id: `poll-result-${finishedAt}-${Math.random().toString(36).slice(2, 8)}`,
        taskId: task.id,
        taskName: task.name,
        timestamp: finishedAt,
        attempt,
        status: 'success',
        durationMs: finishedAt - startedAt,
        requestHex,
        responseHex: bytesToHexInput(response.bytes),
        error: '',
      })
      return true
    } catch (error) {
      if (pendingPollingResponse.value?.task.id === task.id) {
        pendingPollingResponse.value = null
      }
      const finishedAt = Date.now()
      const message = error instanceof Error ? error.message : String(error)
      if (attempt <= task.retries) {
        continue
      }
      const failedTask = updateModbusPollingTaskAfterResult(task, message === '响应超时' ? 'timeout' : 'failed', finishedAt, message)
      updatePollingTask(task.id, current => ({
        ...failedTask,
        enabled: current.enabled,
        name: current.name,
        intervalMs: current.intervalMs,
        timeoutMs: current.timeoutMs,
        retries: current.retries,
        failurePolicy: current.failurePolicy,
      }))
      recordPollingResult({
        id: `poll-result-${finishedAt}-${Math.random().toString(36).slice(2, 8)}`,
        taskId: task.id,
        taskName: task.name,
        timestamp: finishedAt,
        attempt,
        status: message === '响应超时' ? 'timeout' : 'failed',
        durationMs: finishedAt - startedAt,
        requestHex,
        responseHex: '',
        error: message,
      })
      lastPollingError.value = message
      return task.failurePolicy !== 'stop'
    }
  }

  return true
}

async function startTaskPolling(): Promise<void> {
  if (!isSerialConnected.value) {
    settingsStore.showToast('请先在串口页连接设备')
    return
  }
  const enabledTasks = getEnabledModbusPollingTasks(pollingTasks.value)
  if (enabledTasks.length === 0) {
    settingsStore.showToast('请先添加并启用轮询任务')
    return
  }

  stopModbusPolling()
  isTaskPolling.value = true
  stopTaskPollingRequested = false
  pollingTaskCycle.value = 0
  lastPollingError.value = ''

  try {
    while (!stopTaskPollingRequested) {
      pollingTaskCycle.value += 1
      const tasks = getEnabledModbusPollingTasks(pollingTasks.value)
      if (tasks.length === 0) break
      for (const task of tasks) {
        if (stopTaskPollingRequested) break
        const shouldContinue = await runPollingTask(task)
        if (!shouldContinue) {
          stopTaskPollingRequested = true
          break
        }
        await delay(task.intervalMs)
      }
    }
  } finally {
    isTaskPolling.value = false
    activePollingTaskId.value = ''
    pendingPollingResponse.value = null
  }
}

function stopTaskPolling(): void {
  stopTaskPollingRequested = true
  isTaskPolling.value = false
  activePollingTaskId.value = ''
  pendingPollingResponse.value = null
}

function exportPollingTasks(): void {
  const blob = new Blob([serializeModbusPollingTasks(pollingTasks.value)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `modbus_polling_tasks_${Date.now()}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  settingsStore.showToast('轮询任务已导出')
}

const stopSerialDataListener = onDataReceive((data, direction) => {
  if (direction !== 'rx' || data.length === 0) return

  try {
    const bytes = Array.from(data)
    const result = parseCompleteModbusFrame(bytes, parseMode.value, baudRate.value)
    if (!result) return
    const pending = pendingPollingResponse.value
    const matchedPendingTask = pending && result.success && doesModbusResponseMatchTask(pending.task, result.frame)
    if (matchedPendingTask) {
      pending.resolve({ bytes, result })
    }
    if (!autoParseSerialResponse.value && !matchedPendingTask) return
    lastSerialResponseAt.value = Date.now()
    appendParseResult(bytesToHexInput(bytes), bytes, result)
  } catch (error) {
    console.error('Modbus 串口响应自动解析失败:', error)
  }
})

onUnmounted(() => {
  stopModbusPolling()
  stopTaskPolling()
  stopSerialDataListener()
})

/**
 * 复制到剪贴板
 */
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    settingsStore.showToast(t('serial.copied'))
  } catch {
    settingsStore.showToast(t('modbus.copyFailed'))
  }
}

/**
 * 清除解析结果
 */
function handleClear() {
  parseResults.value = []
}

/**
 * 导出解析结果为 TXT
 */
function handleExportTxt() {
  const content = parseResults.value.map(item => {
    const time = new Date(item.timestamp).toLocaleString()
    const lines = [`[${time}] 模式: ${item.mode.toUpperCase()}`]
    lines.push(`输入: ${item.input}`)
    
    if (item.result?.success && item.result.frame) {
      const { address, functionCode, data } = item.result.frame
      lines.push(`地址: ${address}`)
      lines.push(`功能码: 0x${functionCode.toString(16).toUpperCase().padStart(2, '0')} (${functionCodeNames[functionCode] || '未知'})`)
      if (data.length > 0) {
        lines.push(`数据: ${data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`)
      }
      if (item.registers.length > 0) {
        lines.push(`寄存器解析 (${dataTypeSettings.value.type} / ${dataTypeSettings.value.byteOrder}):`)
        item.registers.forEach(reg => {
          lines.push(`  地址 ${reg.address}: ${reg.raw} = ${reg.parsed}`)
        })
      }
    } else if (item.error) {
      lines.push(`错误: ${item.error}`)
    }
    
    return lines.join('\n')
  }).join('\n\n')
  
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `modbus_parse_${new Date().getTime()}.txt`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  settingsStore.showToast(t('serial.exportSuccess'))
}

/**
 * 导出解析结果为 CSV (Excel 兼容)
 */
function handleExportExcel() {
  const headers = ['时间', '模式', '输入数据', '从站地址', '功能码', '功能名称', '寄存器地址', '原始HEX', '解析值', '数据类型', '字节序', '状态', '错误信息']
  const rows: string[][] = [headers]
  
  parseResults.value.forEach(item => {
    const time = new Date(item.timestamp).toLocaleString()
    const baseRow = [
      time,
      item.mode.toUpperCase(),
      item.input,
      item.result?.frame?.address?.toString() || '',
      item.result?.frame ? `0x${item.result.frame.functionCode.toString(16).toUpperCase().padStart(2, '0')}` : '',
      item.result?.frame ? (functionCodeNames[item.result.frame.functionCode] || '') : '',
      '',
      '',
      '',
      dataTypeSettings.value.type,
      dataTypeSettings.value.byteOrder,
      item.result?.success ? '成功' : '失败',
      item.error || ''
    ]
    
    if (item.registers.length > 0) {
      item.registers.forEach((reg) => {
        rows.push([
          time,
          item.mode.toUpperCase(),
          item.input,
          item.result?.frame?.address?.toString() || '',
          item.result?.frame ? `0x${item.result.frame.functionCode.toString(16).toUpperCase().padStart(2, '0')}` : '',
          item.result?.frame ? (functionCodeNames[item.result.frame.functionCode] || '') : '',
          reg.address.toString(),
          reg.raw,
          reg.parsed.toString(),
          dataTypeSettings.value.type,
          dataTypeSettings.value.byteOrder,
          '成功',
          ''
        ])
      })
    } else {
      rows.push(baseRow)
    }
  })
  
  const BOM = '\uFEFF'
  const csvContent = BOM + rows.map(row => 
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n')
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `modbus_data_${new Date().getTime()}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  settingsStore.showToast(t('modbus.exportSuccess'))
}

/**
 * 切换结果展开状态
 */
function toggleResultExpand(id: string) {
  expandedResult.value = expandedResult.value === id ? null : id
}

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString()
}
</script>

<template>
  <div class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 text-sm text-slate-800 transition-colors dark:bg-slate-900 dark:text-slate-200">
    <div class="h-14 shrink-0 border-b border-slate-200 bg-white/90 px-4 dark:border-slate-800 dark:bg-slate-900/90">
      <div class="flex h-full items-center justify-between gap-3">
        <div class="min-w-0">
          <h2 class="flex items-center gap-2 truncate text-sm font-semibold">
            <Cpu class="h-4 w-4 text-blue-500" />
            {{ t('modbus.title') }}
          </h2>
          <p class="truncate text-[11px] text-slate-500 dark:text-slate-400">{{ t('modbus.desc') }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <button 
            @click="parseMode = 'rtu'"
            class="rounded-lg border px-3 py-1.5 text-xs transition-colors"
            :class="parseMode === 'rtu' ? 'border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'"
          >
            {{ t('modbus.rtuMode') }}
          </button>
          <button 
            @click="parseMode = 'ascii'"
            class="rounded-lg border px-3 py-1.5 text-xs transition-colors"
            :class="parseMode === 'ascii' ? 'border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'"
          >
            {{ t('modbus.asciiMode') }}
          </button>
        </div>
      </div>
    </div>

    <div class="grid flex-1 min-h-0 grid-cols-[320px_minmax(0,1fr)_340px] overflow-hidden">
      <!-- 请求构建 -->
      <section class="flex min-h-0 flex-col border-r border-slate-200 bg-white/95 dark:border-slate-800 dark:bg-slate-900/95">
        <div class="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">{{ t('modbus.frameBuild') }}</h3>
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">Request</span>
          </div>
        </div>

        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.slaveAddress') }}</label>
              <input v-model.number="buildSettings.address" type="number" min="1" max="247" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.functionCode') }}</label>
              <select v-model.number="buildSettings.functionCode" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800">
                <option v-for="fc in functionCodeOptions" :key="fc.value" :value="fc.value">{{ fc.label }}</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.startAddress') }}</label>
              <input v-model.number="buildSettings.startAddress" type="number" min="0" max="65535" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.quantityValue') }}</label>
              <input v-model.number="buildSettings.quantity" type="number" min="1" max="125" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
            </div>
          </div>

          <div v-if="selectedFunctionCode?.needsValue" class="flex flex-col gap-1">
            <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.writeValue') }}</label>
            <input v-model="buildSettings.writeValue" type="text" :placeholder="t('modbus.writeValuePlaceholder')" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
          </div>

          <button @click="handleBuild" class="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 dark:bg-blue-600 dark:hover:bg-blue-500">
            <Send class="h-4 w-4" />
            {{ t('modbus.buildFrame') }}
          </button>

          <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
            <div class="mb-2 flex items-center justify-between gap-2">
              <span class="text-xs font-medium text-slate-500">{{ t('modbus.buildResult') }}</span>
              <div class="flex items-center gap-1 text-[10px]">
                <span
                  class="rounded-full px-2 py-0.5"
                  :class="isSerialConnected ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'"
                >
                  {{ isSerialConnected ? '串口已连接' : '串口未连接' }}
                </span>
                <button @click="copyToClipboard(buildResult)" :disabled="!buildResult" class="rounded p-1 hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-800">
                  <Copy class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div class="min-h-16 break-all font-mono text-xs text-blue-600 dark:text-blue-400">
              {{ buildResult || '—' }}
            </div>
            <div class="mt-3 grid grid-cols-2 gap-2">
              <button
                @click="handleSendBuiltFrame"
                :disabled="!buildResult || !isSerialConnected || isSendingModbusRequest"
                class="flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/60"
              >
                <Send class="h-3.5 w-3.5" />
                {{ isSendingModbusRequest ? '发送中' : '串口发送' }}
              </button>
              <button
                @click="useBuildResultAsResponseInput"
                :disabled="!buildResult"
                class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-white disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                填入解析
              </button>
            </div>
          </div>

          <div class="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div class="mb-2 flex items-center justify-between gap-2">
              <div>
                <h4 class="text-xs font-medium text-slate-600 dark:text-slate-300">轮询发送</h4>
                <p class="text-[10px] text-slate-400">按当前构建帧周期发送，响应进入流水线</p>
              </div>
              <span
                class="rounded-full px-2 py-0.5 text-[10px]"
                :class="isPollingModbus ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'"
              >
                {{ isPollingModbus ? '运行中' : '已停止' }}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div class="flex flex-col gap-1">
                <label class="text-[10px] text-slate-500">间隔 ms</label>
                <input
                  v-model.number="pollingSettings.intervalMs"
                  type="number"
                  min="100"
                  max="60000"
                  step="100"
                  :disabled="isPollingModbus"
                  class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-[10px] text-slate-500">次数 0=无限</label>
                <input
                  v-model.number="pollingSettings.maxCycles"
                  type="number"
                  min="0"
                  max="999999"
                  :disabled="isPollingModbus"
                  class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>

            <div class="mt-3 grid grid-cols-2 gap-2">
              <button
                v-if="!isPollingModbus"
                @click="startModbusPolling"
                :disabled="!isSerialConnected"
                class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
              >
                开始轮询
              </button>
              <button
                v-else
                @click="stopModbusPolling()"
                class="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/60"
              >
                停止轮询
              </button>
              <div class="flex items-center justify-center rounded-lg bg-slate-50 px-2 py-1.5 text-[10px] text-slate-500 dark:bg-slate-950/60 dark:text-slate-400">
                {{ pollingProgressLabel }}
              </div>
            </div>

            <div class="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
              <span v-if="lastPollingSentAt">最近发送 {{ formatTimestamp(lastPollingSentAt) }}</span>
              <span v-if="lastPollingError" class="text-red-500 dark:text-red-300">{{ lastPollingError }}</span>
            </div>
          </div>

          <div class="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div class="mb-2 flex items-center justify-between gap-2">
              <div>
                <h4 class="text-xs font-medium text-slate-600 dark:text-slate-300">多请求轮询</h4>
                <p class="text-[10px] text-slate-400">启用任务串行发送，按地址/功能码匹配响应</p>
              </div>
              <span
                class="rounded-full px-2 py-0.5 text-[10px]"
                :class="isTaskPolling ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'"
              >
                {{ isTaskPolling ? `第 ${pollingTaskCycle} 轮` : `${pollingTasks.length} 项` }}
              </span>
            </div>

            <div class="grid grid-cols-3 gap-1.5">
              <button
                @click="addCurrentRequestAsPollingTask"
                :disabled="isTaskPolling"
                class="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                加入任务
              </button>
              <button
                v-if="!isTaskPolling"
                @click="startTaskPolling"
                :disabled="!isSerialConnected || pollingTasks.filter(task => task.enabled).length === 0"
                class="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
              >
                启动队列
              </button>
              <button
                v-else
                @click="stopTaskPolling"
                class="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] font-medium text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
              >
                停止队列
              </button>
              <button
                @click="exportPollingTasks"
                :disabled="pollingTasks.length === 0"
                class="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                导出任务
              </button>
            </div>

            <div class="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
              <div class="rounded bg-slate-50 py-1 dark:bg-slate-950/60">
                <div class="font-mono text-slate-700 dark:text-slate-200">{{ taskPollingSummary.sent }}</div>
                <div class="text-slate-400">发送</div>
              </div>
              <div class="rounded bg-emerald-50 py-1 dark:bg-emerald-950/30">
                <div class="font-mono text-emerald-600 dark:text-emerald-300">{{ taskPollingSummary.success }}</div>
                <div class="text-slate-400">成功</div>
              </div>
              <div class="rounded bg-red-50 py-1 dark:bg-red-950/30">
                <div class="font-mono text-red-600 dark:text-red-300">{{ taskPollingSummary.failed }}</div>
                <div class="text-slate-400">失败</div>
              </div>
            </div>

            <div class="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
              <div v-if="pollingTasks.length === 0" class="rounded bg-slate-50 px-2 py-3 text-center text-[10px] text-slate-400 dark:bg-slate-950/60">
                暂无任务，可先构建请求后加入任务
              </div>
              <div
                v-for="task in pollingTasks"
                :key="task.id"
                class="rounded-lg border px-2 py-1.5 text-[10px]"
                :class="activePollingTaskId === task.id
                  ? 'border-blue-300 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/30'
                  : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50'"
              >
                <div class="flex items-center justify-between gap-2">
                  <button
                    @click="togglePollingTask(task.id)"
                    :disabled="isTaskPolling"
                    class="min-w-0 truncate text-left font-medium"
                    :class="task.enabled ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 line-through'"
                  >
                    {{ task.name }}
                  </button>
                  <button
                    @click="removePollingTask(task.id)"
                    :disabled="isTaskPolling"
                    class="text-red-500 disabled:opacity-40"
                  >
                    删除
                  </button>
                </div>
                <div class="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-slate-400">
                  <span>FC {{ task.functionCode }}</span>
                  <span>{{ task.intervalMs }}ms</span>
                  <span>超时 {{ task.timeoutMs }}ms</span>
                  <span>重试 {{ task.retries }}</span>
                </div>
                <div class="mt-1 flex flex-wrap gap-x-2 gap-y-1">
                  <span class="text-emerald-600 dark:text-emerald-300">成功 {{ task.success }}</span>
                  <span class="text-red-600 dark:text-red-300">失败 {{ task.failed }}</span>
                  <span class="text-slate-400">状态 {{ task.status }}</span>
                </div>
                <div v-if="task.lastError" class="mt-1 truncate text-red-500 dark:text-red-300">{{ task.lastError }}</div>
              </div>
            </div>

            <div v-if="pollingResults.length > 0" class="mt-2 border-t border-slate-200 pt-2 text-[10px] dark:border-slate-800">
              <div class="mb-1 flex items-center justify-between text-slate-500">
                <span>最近轮询结果</span>
                <span>{{ pollingResults.length }}</span>
              </div>
              <div class="max-h-20 space-y-1 overflow-y-auto pr-1">
                <div v-for="result in pollingResults.slice(0, 5)" :key="result.id" class="flex items-center justify-between gap-2 text-slate-400">
                  <span class="min-w-0 truncate">{{ result.taskName }}</span>
                  <span :class="result.status === 'success' ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'">
                    {{ result.status }} / {{ result.durationMs }}ms
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <h4 class="mb-2 text-xs font-medium text-slate-500">{{ t('modbus.dataParseSettings') }}</h4>
            <div class="grid grid-cols-2 gap-2">
              <select v-model="dataTypeSettings.type" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800">
                <option v-for="dt in dataTypeOptions" :key="dt.value" :value="dt.value">{{ dt.label }}</option>
              </select>
              <select v-model="dataTypeSettings.byteOrder" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800">
                <option v-for="bo in byteOrderOptions" :key="bo.value" :value="bo.value">{{ bo.label }}</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <!-- 响应解析 -->
      <section class="flex min-h-0 flex-col bg-white dark:bg-slate-900">
        <div class="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div class="flex items-center justify-between gap-3">
            <h3 class="flex items-center gap-2 text-sm font-semibold">
              <FileCode class="h-4 w-4 text-blue-500" />
              {{ t('modbus.dataParse') }}
            </h3>
            <div class="flex items-center gap-2 text-[10px] text-slate-500">
              <span class="rounded-full bg-green-50 px-2 py-0.5 text-green-600 dark:bg-green-950/40 dark:text-green-300">{{ successfulResultCount }} 成功</span>
              <span class="rounded-full bg-red-50 px-2 py-0.5 text-red-600 dark:bg-red-950/40 dark:text-red-300">{{ failedResultCount }} 失败</span>
            </div>
          </div>
        </div>

        <div class="border-b border-slate-200 p-4 dark:border-slate-800">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/50">
            <label class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input v-model="autoParseSerialResponse" type="checkbox" class="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              自动解析串口响应
            </label>
            <div class="flex items-center gap-2 text-[10px] text-slate-500">
              <span
                class="rounded-full px-2 py-0.5"
                :class="isSerialConnected ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'"
              >
                {{ isSerialConnected ? `监听 ${baudRate}bps` : '未连接' }}
              </span>
              <span v-if="lastSerialResponseAt" class="text-slate-400">最近 {{ formatTimestamp(lastSerialResponseAt) }}</span>
            </div>
          </div>
          <textarea v-model="inputHex" :placeholder="t('modbus.inputPlaceholder')" class="h-24 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950/60"></textarea>
          <div class="mt-2 flex items-center justify-end gap-2">
            <button @click="inputHex = ''" class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">{{ t('serial.clear') }}</button>
            <button @click="handleParse" class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
              <FileCode class="h-3.5 w-3.5" />
              {{ t('modbus.parseData') }}
            </button>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <div v-if="!activeParseResult" class="flex h-full items-center justify-center text-slate-400">
            <div class="text-center">
              <Table class="mx-auto mb-3 h-12 w-12 opacity-30" />
              <p class="text-sm">{{ t('modbus.noResults') }}</p>
              <p class="mt-1 text-xs">{{ t('modbus.noResultsHint') }}</p>
            </div>
          </div>

          <div v-else class="space-y-3">
            <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
              <div class="mb-2 flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <component :is="activeParseResult.result?.success ? CheckCircle2 : XCircle" class="h-4 w-4" :class="activeParseResult.result?.success ? 'text-green-500' : 'text-red-500'" />
                  <span class="text-xs text-slate-500">{{ formatTimestamp(activeParseResult.timestamp) }}</span>
                  <span class="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] dark:bg-slate-800">{{ activeParseResult.mode.toUpperCase() }}</span>
                </div>
                <button @click="copyToClipboard(activeParseResult.input)" class="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-800">
                  <Copy class="h-3.5 w-3.5" />
                </button>
              </div>
              <div class="break-all font-mono text-xs text-blue-600 dark:text-blue-400">{{ activeParseResult.input }}</div>
            </div>

            <div v-if="activeParseResult.result?.success && activeParseResult.result.frame" class="space-y-3">
              <div class="grid grid-cols-2 gap-3 text-xs">
                <div class="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                  <div class="text-slate-500">{{ t('modbus.slaveAddress') }}</div>
                  <div class="mt-1 font-mono text-lg font-semibold">{{ activeParseResult.result.frame.address }}</div>
                </div>
                <div class="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                  <div class="text-slate-500">{{ t('modbus.functionCode') }}</div>
                  <div class="mt-1 font-mono text-lg font-semibold">0x{{ activeParseResult.result.frame.functionCode.toString(16).toUpperCase().padStart(2, '0') }}</div>
                  <div class="truncate text-[10px] text-slate-400">{{ functionCodeNames[activeParseResult.result.frame.functionCode] || t('modbus.unknown') }}</div>
                </div>
              </div>

              <div v-if="activeParseResult.result.frame.data.length > 0" class="rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                <span class="text-slate-500">{{ t('modbus.rawData') }}</span>
                <div class="mt-1 break-all font-mono text-green-600 dark:text-green-400">
                  {{ activeParseResult.result.frame.data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ') }}
                </div>
              </div>

              <div v-if="activeParseResult.registers.length > 0" class="rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                <div class="mb-2 flex items-center justify-between">
                  <span class="text-slate-500">{{ t('modbus.registerParse') }}</span>
                  <span class="text-[10px] text-slate-400">{{ dataTypeSettings.type }} / {{ dataTypeSettings.byteOrder }}</span>
                </div>
                <div class="overflow-x-auto">
                  <table class="w-full text-xs">
                    <thead>
                      <tr class="border-b border-slate-200 dark:border-slate-800">
                        <th class="px-2 py-1 text-left font-normal text-slate-500">{{ t('modbus.registerAddress') }}</th>
                        <th class="px-2 py-1 text-left font-normal text-slate-500">HEX</th>
                        <th class="px-2 py-1 text-right font-normal text-slate-500">{{ t('modbus.parsedValue') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="reg in activeParseResult.registers" :key="reg.address" class="border-b border-slate-100 last:border-0 dark:border-slate-800">
                        <td class="px-2 py-1 font-mono">{{ reg.address }}</td>
                        <td class="px-2 py-1 font-mono text-slate-500">{{ reg.raw }}</td>
                        <td class="px-2 py-1 text-right font-mono font-semibold text-blue-600 dark:text-blue-400">{{ reg.parsed }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div class="rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                <span class="text-slate-500">校验码</span>
                <span class="ml-2 font-mono text-purple-600 dark:text-purple-400">{{ activeParseResult.result.frame.checksum.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ') }}</span>
                <span class="ml-1 text-slate-400">({{ activeParseResult.mode === 'rtu' ? 'CRC16' : 'LRC' }})</span>
              </div>
            </div>

            <div v-else class="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {{ activeParseResult.error || '解析失败' }}
            </div>

            <div class="rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
              <span class="text-slate-500">所有校验</span>
              <div class="mt-2 flex flex-wrap gap-2">
                <span v-for="cs in activeParseResult.checksums" :key="cs.type" class="rounded bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                  {{ cs.type }}: <span class="font-mono text-purple-600 dark:text-purple-400">{{ cs.value }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 流水线历史 -->
      <section class="flex min-h-0 flex-col border-l border-slate-200 bg-slate-50/95 dark:border-slate-800 dark:bg-slate-950/80">
        <div class="border-b border-slate-200 px-3 py-3 dark:border-slate-800">
          <div class="flex items-center justify-between gap-2">
            <h3 class="flex items-center gap-2 text-sm font-semibold">
              <Table class="h-4 w-4" />
              {{ t('modbus.parseResults') }}
              <span class="text-xs font-normal text-slate-500">({{ parseResults.length }})</span>
            </h3>
            <div class="flex items-center gap-1">
              <button @click="handleExportExcel" :disabled="parseResults.length === 0" class="rounded p-1.5 hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-800" :title="t('modbus.exportExcel')">
                <FileSpreadsheet class="h-4 w-4" />
              </button>
              <button @click="handleExportTxt" :disabled="parseResults.length === 0" class="rounded p-1.5 hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-800" :title="t('modbus.exportTxt')">
                <Download class="h-4 w-4" />
              </button>
              <button @click="handleClear" :disabled="parseResults.length === 0" class="rounded p-1.5 hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-800" :title="t('modbus.clearResults')">
                <Trash2 class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          <div class="mb-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-xs font-medium text-slate-600 dark:text-slate-300">流水线诊断</span>
              <span
                class="rounded-full px-2 py-0.5 text-[10px]"
                :class="pipelineDiagnostics.failed === 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300'"
              >
                {{ pipelineDiagnostics.successRate }}% 成功
              </span>
            </div>
            <div class="grid grid-cols-4 gap-1 text-center text-[10px]">
              <div class="rounded bg-slate-50 px-1 py-1.5 dark:bg-slate-950/60">
                <div class="font-mono text-xs text-slate-700 dark:text-slate-200">{{ pipelineDiagnostics.total }}</div>
                <div class="text-slate-400">响应</div>
              </div>
              <div class="rounded bg-emerald-50 px-1 py-1.5 dark:bg-emerald-950/30">
                <div class="font-mono text-xs text-emerald-600 dark:text-emerald-300">{{ pipelineDiagnostics.success }}</div>
                <div class="text-slate-400">成功</div>
              </div>
              <div class="rounded bg-red-50 px-1 py-1.5 dark:bg-red-950/30">
                <div class="font-mono text-xs text-red-600 dark:text-red-300">{{ pipelineDiagnostics.failed }}</div>
                <div class="text-slate-400">失败</div>
              </div>
              <div class="rounded bg-amber-50 px-1 py-1.5 dark:bg-amber-950/30">
                <div class="font-mono text-xs text-amber-600 dark:text-amber-300">{{ pipelineDiagnostics.exceptionFrames }}</div>
                <div class="text-slate-400">异常</div>
              </div>
            </div>
            <div class="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-400">
              <span v-if="sentPollingCycles > 0">轮询差值 {{ pollingResponseGap }}</span>
              <span v-if="pipelineDiagnostics.lastError" class="text-red-500 dark:text-red-300">最近错误：{{ pipelineDiagnostics.lastError }}</span>
            </div>
          </div>

          <div v-if="parseResults.length === 0" class="flex h-full items-center justify-center text-center text-slate-400">
            <div>
              <FileCode class="mx-auto mb-3 h-10 w-10 opacity-30" />
              <p class="text-sm">{{ t('modbus.noResults') }}</p>
            </div>
          </div>

          <div v-else class="space-y-2">
            <button
              v-for="item in parseResults"
              :key="item.id"
              @click="toggleResultExpand(item.id)"
              class="w-full rounded-lg border p-3 text-left transition-colors"
              :class="expandedResult === item.id
                ? 'border-blue-300 bg-white shadow-sm dark:border-blue-900/60 dark:bg-slate-900'
                : 'border-slate-200 bg-white/70 hover:bg-white dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-900'"
            >
              <div class="flex items-center gap-2">
                <component :is="item.result?.success ? CheckCircle2 : XCircle" class="h-4 w-4 shrink-0" :class="item.result?.success ? 'text-green-500' : 'text-red-500'" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] text-slate-500">{{ formatTimestamp(item.timestamp) }}</span>
                    <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] dark:bg-slate-800">{{ item.mode.toUpperCase() }}</span>
                  </div>
                  <div class="mt-1 truncate font-mono text-xs text-blue-600 dark:text-blue-400">{{ item.input }}</div>
                </div>
                <component :is="expandedResult === item.id ? ChevronDown : ChevronUp" class="h-3.5 w-3.5 text-slate-400" />
              </div>
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
