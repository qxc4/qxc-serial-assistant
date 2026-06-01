<script setup lang="ts">
import { ref, watch, nextTick, computed, onUnmounted } from 'vue'
import { useRtt, BACKEND_REQUIREMENTS } from '../composables/useRtt'
import { useWebUsbRtt } from '../composables/useWebUsbRtt'
import { useRttDebugWorkbench } from '../composables/useRttDebugWorkbench'
import { useI18n } from '../composables/useI18n'
import { parseElfImage, parseIntelHex, parseBinaryImage, inspectGlobalVariables, planFlashRanges, createFlashProgrammer } from '../debug-core'
import type { FlashVerifyReport, VariableSpec, VariableValue } from '../debug-core'
import type { ProgramImage } from '../debug-core'
import VirtualList from '../components/VirtualList.vue'
import RttDebugControls from '../components/rtt/RttDebugControls.vue'
import type { RttLogLevel, RttBackend } from '../types/rtt'
import {
  Usb, Unplug, Play, Pause, Send,
  RefreshCw, Download, Trash2, Search,
  AlertCircle, Radio, Terminal, X, HelpCircle,
  PanelRight, BookOpen, Cpu, Zap, Wifi, Check, Info, ChevronUp, ChevronDown
} from 'lucide-vue-next'

/** 连接状态颜色映射（静态常量，提取到模块级别避免每次实例重建） */
const STATE_COLOR_MAP: Record<string, string> = {
  disconnected: 'bg-slate-400',
  connecting: 'bg-yellow-500 animate-pulse',
  connected: 'bg-green-500',
  error: 'bg-red-500',
}

/** 日志级别颜色映射 */
const LEVEL_COLOR_MAP: Record<string, string> = {
  trace: 'text-slate-500 dark:text-slate-400',
  debug: 'text-blue-600 dark:text-blue-400',
  info: 'text-green-600 dark:text-green-400',
  warn: 'text-yellow-600 dark:text-yellow-400',
  error: 'text-red-600 dark:text-red-400',
}

/** 日志级别背景色映射 */
const LEVEL_BG_MAP: Record<string, string> = {
  trace: 'bg-slate-100 dark:bg-slate-800/50',
  debug: 'bg-blue-50 dark:bg-blue-900/20',
  info: 'bg-green-50 dark:bg-green-900/20',
  warn: 'bg-yellow-50 dark:bg-yellow-900/20',
  error: 'bg-red-50 dark:bg-red-900/20',
}

const { t } = useI18n()

// WebSocket RTT (传统方式)
const wsRtt = useRtt()

// WebUSB RTT (直接连接)
const webUsbRtt = useWebUsbRtt()

/** 当前使用的后端：产品路线转向纯浏览器调试 */
const backend = ref<RttBackend>('webusb')
/** 是否使用 WebUSB 模式 */
const isWebUsbMode = computed(() => backend.value === 'webusb')

/** 当前后端的使用条件 */
const currentBackendRequirements = computed(() => {
  return BACKEND_REQUIREMENTS[backend.value]
})


// ==================== 统一的状态接口 ====================

/** 统一的连接状态 */
const connectionState = computed(() => {
  if (isWebUsbMode.value) {
    // WebUSB 状态映射
    const stateMap: Record<string, string> = {
      disconnected: 'disconnected',
      requesting: 'connecting',
      connecting: 'connecting',
      connected: 'connected',
      scanning: 'connecting',
      running: 'connected',
      error: 'error',
    }
    return stateMap[webUsbRtt.state.value] || 'disconnected'
  }
  return wsRtt.connectionState.value
})

/** 是否已连接 */
const isConnected = computed(() => {
  if (isWebUsbMode.value) {
    return webUsbRtt.isConnected.value
  }
  return wsRtt.isConnected.value
})

/** 通道列表 */
const channels = computed(() => {
  if (isWebUsbMode.value) {
    return webUsbRtt.channels.value
  }
  return wsRtt.channels.value
})

/** 过滤器 */
const filter = computed(() => wsRtt.filter.value)

/** 是否暂停 */
const isPaused = computed(() => {
  if (isWebUsbMode.value) {
    return webUsbRtt.isPaused.value
  }
  return wsRtt.isPaused.value
})

/** 自动滚动 */
const autoScroll = ref(true)

/** 错误消息 */
const errorMessage = computed(() => {
  if (isWebUsbMode.value) {
    return webUsbRtt.error.value?.message || ''
  }
  return wsRtt.errorMessage.value
})

/** 日志统计 */
const logStats = computed(() => wsRtt.logStats.value)

/** 过滤后的日志 */
const filteredLogs = computed(() => {
  if (isWebUsbMode.value) {
    // WebUSB 模式：本地过滤
    let logs = webUsbRtt.logs.value
    const f = filter.value

    // 级别过滤
    if (f.levels.length < 5) {
      logs = logs.filter(log => f.levels.includes(log.level))
    }

    // 通道过滤
    if (f.channels.length > 0) {
      logs = logs.filter(log => f.channels.includes(log.channel))
    }

    // 文本搜索
    if (f.searchText.trim()) {
      const query = f.searchText.toLowerCase()
      logs = logs.filter(log => log.text.toLowerCase().includes(query))
    }

    return logs
  }
  return wsRtt.filteredLogs.value
})

// ==================== probe-rs 配置 ====================

const elfPath = wsRtt.elfPath
const chipModel = wsRtt.chipModel
const protocol = wsRtt.protocol
const selectedProbe = wsRtt.selectedProbe
const probes = wsRtt.probes

// ==================== OpenOCD 配置 ====================

const openocdHost = wsRtt.openocdHost
const openocdPort = wsRtt.openocdPort

// ==================== J-Link 配置 ====================

const jlinkHost = wsRtt.jlinkHost
const jlinkPort = wsRtt.jlinkPort

// ==================== WebUSB 配置 ====================

/** WebUSB SWD 频率选项 */
const frequencyOptions = [
  { value: 1000000, label: '1 MHz' },
  { value: 2000000, label: '2 MHz' },
  { value: 4000000, label: '4 MHz' },
  { value: 8000000, label: '8 MHz' },
  { value: 16000000, label: '16 MHz' },
]

/** WebUSB 配置 */
const webUsbFrequency = ref(4000000)
const webUsbProtocol = ref<'swd' | 'jtag'>('swd')
const rttScanStartInput = ref(formatHexAddress(webUsbRtt.scanRange.value.start))
const rttScanEndInput = ref(formatHexAddress(webUsbRtt.scanRange.value.end))
const rttScanStepInput = ref(webUsbRtt.scanRange.value.stepSize)
const webUsbScanRangeError = ref('')

/** WebUSB 探针信息显示 */
const webUsbProbeName = computed(() => {
  return webUsbRtt.probe.value?.displayName || '未选择设备'
})

/** WebUSB 调试链路自检 */
const webDebugSelfChecks = computed(() => {
  const isUsbReady = webUsbRtt.isSupported.value
  const hasProbe = Boolean(webUsbRtt.probe.value)
  const hasChannels = channels.value.length > 0
  const logCount = isWebUsbMode.value ? webUsbRtt.logs.value.length : logStats.value.total

  return [
    {
      label: '浏览器 WebUSB',
      detail: isUsbReady ? '可用' : '需要 Chrome/Edge 桌面端',
      state: isUsbReady ? 'ok' : 'warn',
    },
    {
      label: 'USB 授权',
      detail: hasProbe ? webUsbProbeName.value : '等待选择探针',
      state: hasProbe ? 'ok' : 'idle',
    },
    {
      label: '探针连接',
      detail: isConnected.value ? connectionState.value : '未连接',
      state: isConnected.value ? 'ok' : 'idle',
    },
    {
      label: 'RTT 扫描',
      detail: hasChannels ? `${channels.value.length} 个通道` : '等待 Control Block',
      state: hasChannels ? 'ok' : 'idle',
    },
    {
      label: '日志流',
      detail: logCount > 0 ? `${logCount} 条` : '暂无数据',
      state: logCount > 0 ? 'ok' : 'idle',
    },
    {
      label: 'Bridge 路线',
      detail: '纯浏览器直连',
      state: 'ok',
    },
  ]
})
const showDebugSelfCheckDetails = ref(false)
const debugSelfCheckSummary = computed(() => {
  const items = webDebugSelfChecks.value
  const warnCount = items.filter(item => item.state === 'warn').length
  const okCount = items.filter(item => item.state === 'ok').length
  const idleCount = items.filter(item => item.state === 'idle').length
  return {
    total: items.length,
    warnCount,
    okCount,
    idleCount,
    hasWarn: warnCount > 0,
    hasIdle: idleCount > 0,
  }
})
const debugSelfCheckFocusItems = computed(() => {
  const warns = webDebugSelfChecks.value.filter(item => item.state === 'warn')
  if (warns.length > 0) return warns
  return webDebugSelfChecks.value.filter(item => item.state === 'idle').slice(0, 2)
})

const workbenchStatusChips = computed(() => {
  const runState = isConnected.value ? (isPaused.value ? 'paused' : 'running') : 'idle'
  const rttState = channels.value.length > 0 ? 'ready' : (isConnected.value ? 'scanning' : 'idle')

  return [
    {
      key: 'connection',
      label: '连接',
      value: connectionState.value,
      tone: isConnected.value ? 'ok' : (connectionState.value === 'error' ? 'error' : 'idle'),
    },
    {
      key: 'run',
      label: '运行',
      value: runState,
      tone: runState === 'running' ? 'ok' : (runState === 'paused' ? 'warn' : 'idle'),
    },
    {
      key: 'rtt',
      label: 'RTT',
      value: rttState,
      tone: rttState === 'ready' ? 'ok' : (rttState === 'scanning' ? 'warn' : 'idle'),
    },
    {
      key: 'flash',
      label: '烧录',
      value: flashStatus.value,
      tone: flashStatus.value === 'success'
        ? 'ok'
        : flashStatus.value === 'error'
          ? 'error'
          : flashStatus.value === 'programming'
            ? 'warn'
            : 'idle',
    },
  ] as const
})

/** 发送输入框内容 */
const sendInput = ref('')

/** 发送目标通道 */
const sendChannel = ref(0)

/** 虚拟列表引用 */
const virtualListRef = ref<InstanceType<typeof VirtualList> | null>(null)

/** 是否显示右侧面板 */
const showRightPanel = ref(true)

/** 是否显示帮助面板 */
const showHelpPanel = ref(false)
const variableElfInputRef = ref<HTMLInputElement | null>(null)
const variableElfName = ref('')
const variableSpecs = ref<VariableSpec[]>([])
const variableValues = ref<VariableValue[]>([])
const variableError = ref('')
const variableLoading = ref(false)
const variableFilterText = ref('')
const variableAutoRefresh = ref(false)
const variableRefreshMs = ref(500)
let variableRefreshTimer: ReturnType<typeof setInterval> | null = null
const firmwareInputRef = ref<HTMLInputElement | null>(null)
const firmwareName = ref('')
const firmwareImage = ref<ProgramImage | null>(null)
const firmwareBaseAddressInput = ref('0x08000000')
const flashPageSizeInput = ref(2048)
const flashChipFamily = ref<'stm32f1' | 'stm32f4'>('stm32f1')
const flashStartAddressInput = ref('0x08000000')
const flashEndAddressInput = ref('0x08080000')
const detectedChipLabel = ref('')
const flashPlanSummary = ref<{ erasePages: number; programSections: number; verifyBytes: number } | null>(null)
const flashStatus = ref<'idle' | 'planning' | 'ready' | 'programming' | 'success' | 'error'>('idle')
const flashError = ref('')
const flashProgress = ref(0)
const flashStage = ref<'idle' | 'erase' | 'program' | 'verify' | 'done'>('idle')
const flashHint = ref('')
const flashVerifyReport = ref<FlashVerifyReport | null>(null)
const {
  debugControlState,
  debugControlError,
  breakpointInput,
  hardwareBreakpoints,
  breakpointRestoreStatus,
  coreRegisterItems,
  memoryViewAddressInput,
  memoryViewLengthInput,
  memoryViewHexLines,
  memoryViewError,
  pcFocusRequestId,
  registerWriteName,
  registerWriteValueInput,
  refreshCoreRegisters,
  handleDebugAction,
  addHardwareBreakpoint,
  removeHardwareBreakpoint,
  clearAllHardwareBreakpoints,
  readMemoryPreview,
  writeCoreRegisterValue,
} = useRttDebugWorkbench({
  isConnected,
  memory: {
    readMemory: (address, bytes) => webUsbRtt.readMemory(address, bytes),
    writeMemory: (address, data) => webUsbRtt.writeMemory(address, data),
  },
  parseHexAddress,
  formatHexAddress,
})
type FlashDiagCode = 'permission' | 'disconnected' | 'range' | 'verify' | 'protected' | 'config' | 'generic'
const flashDiagnosis = computed(() => {
  const message = flashError.value.trim()
  if (!message) return null

  const lower = message.toLowerCase()
  const has = (...keywords: string[]) => keywords.some(k => lower.includes(k))
  let code: FlashDiagCode = 'generic'
  if (has('notallowederror', 'permission', 'denied', '授权')) code = 'permission'
  else if (has('disconnect', 'not connected', 'device unavailable', '掉线', '断开')) code = 'disconnected'
  else if (has('outside flash regions', 'out of range', '地址范围', '起始地址', '结束地址')) code = 'range'
  else if (has('verify', 'mismatch', '校验')) code = 'verify'
  else if (has('read protected', 'write protected', '保护')) code = 'protected'
  else if (has('family', 'page size', 'chip', '配置')) code = 'config'

  const actions: Record<FlashDiagCode, string[]> = {
    permission: ['重新选择 WebUSB 设备并授权访问调试探针。', '关闭占用探针的软件（如 ST-Link Utility/IDE）后重试。'],
    disconnected: ['检查 USB 线缆和供电，确认探针与目标板连接稳定。', '断开后重新连接，再执行“生成计划 -> 执行写入”。'],
    range: ['核对 Flash 起始/结束地址是否覆盖固件 section 地址。', '确认页大小和芯片族匹配目标 MCU。'],
    verify: ['先执行擦除后重试写入。', '降低 SWD 频率并再次烧录。'],
    protected: ['检查目标芯片读写保护（RDP/WRP）状态。', '必要时先解锁或全片擦除后重试。'],
    config: ['点击“识别芯片”自动填充，再人工复核页大小与地址范围。', '若芯片族不在支持范围，先使用受支持芯片验证流程。'],
    generic: ['检查连接状态与芯片参数后重试。', '保留报错文本用于后续定位。'],
  }

  const titles: Record<FlashDiagCode, string> = {
    permission: '权限问题',
    disconnected: '连接中断',
    range: '地址范围错误',
    verify: '校验失败',
    protected: '芯片保护',
    config: '配置不匹配',
    generic: '通用错误',
  }

  return { code, title: titles[code], actions: actions[code] }
})

const filteredVariableValues = computed(() => {
  const keyword = variableFilterText.value.trim().toLowerCase()
  if (!keyword) return variableValues.value
  return variableValues.value.filter(item =>
    item.name.toLowerCase().includes(keyword) ||
    item.address.toString(16).toLowerCase().includes(keyword)
  )
})

const flashPrecheckItems = computed(() => {
  const items: Array<{ label: string; state: 'ok' | 'warn' | 'error' | 'idle'; detail: string }> = [
    {
      label: '固件',
      state: firmwareImage.value ? 'ok' : 'idle',
      detail: firmwareImage.value ? `${firmwareImage.value.sections.length} 个 section` : '未导入',
    },
    {
      label: '连接',
      state: isConnected.value ? 'ok' : 'warn',
      detail: isConnected.value ? '探针已连接' : '执行写入前需要连接',
    },
  ]

  let region: ReturnType<typeof flashRegionConfig> | null = null
  try {
    region = flashRegionConfig()
    items.push({
      label: 'Flash 区域',
      state: 'ok',
      detail: `${formatHexAddress(region.start)}-${formatHexAddress(region.end)} / ${region.pageSize}B`,
    })
  } catch (error) {
    items.push({
      label: 'Flash 区域',
      state: 'error',
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  if (!firmwareImage.value || !region) {
    items.push({
      label: '写入计划',
      state: 'idle',
      detail: '等待固件与区域配置',
    })
    return items
  }

  try {
    const plan = planFlashRanges({
      regions: [region],
      sections: firmwareImage.value.sections,
    })
    const verifyBytes = plan.verifyRanges.reduce((total, range) => total + range.length, 0)
    items.push({
      label: '写入计划',
      state: plan.programSections.length > 0 ? 'ok' : 'warn',
      detail: `${plan.erasePages.length} 页 / ${plan.programSections.length} 段 / ${verifyBytes}B`,
    })
  } catch (error) {
    items.push({
      label: '写入计划',
      state: 'error',
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  return items
})

/** 是否展开顶部高级配置区 */
const showTopConfigDetails = ref(false)

/** 后端选项 */
const backendOptions: Array<{ value: RttBackend; label: string; icon?: any }> = [
  { value: 'webusb', label: 'WebUSB 调试工作台', icon: Zap },
]

/** 日志级别选项 */
const levelOptions: Array<{ value: RttLogLevel; label: string; color: string }> = [
  { value: 'trace', label: 'TRACE', color: 'text-slate-500' },
  { value: 'debug', label: 'DEBUG', color: 'text-blue-500' },
  { value: 'info', label: 'INFO', color: 'text-green-500' },
  { value: 'warn', label: 'WARN', color: 'text-yellow-500' },
  { value: 'error', label: 'ERROR', color: 'text-red-500' },
]


/** 当前连接状态指示灯颜色 */
const stateIndicator = computed(() => STATE_COLOR_MAP[connectionState.value] ?? 'bg-slate-400')

/** 连接按钮文本 */
const connectBtnText = computed(() => {
  switch (connectionState.value) {
    case 'connected': return t('rtt.disconnect')
    case 'connecting': return t('rtt.connecting')
    default: return t('rtt.connect')
  }
})

/** 是否可以连接 */
const canConnect = computed(() => {
  return connectionState.value === 'disconnected' || connectionState.value === 'error'
})

/**
 * 格式化时间戳
 * @param ts 时间戳
 * @returns 格式化后的时间字符串
 */
function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`
}

function formatHexAddress(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(8, '0')}`
}

function parseHexAddress(value: string): number | null {
  const normalized = value.trim().replace(/^0x/i, '')
  if (!/^[0-9a-fA-F]+$/.test(normalized)) return null
  const parsed = Number.parseInt(normalized, 16)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function applyWebUsbScanRange(): boolean {
  const start = parseHexAddress(rttScanStartInput.value)
  const end = parseHexAddress(rttScanEndInput.value)
  const stepSize = rttScanStepInput.value

  if (start === null || end === null) {
    webUsbScanRangeError.value = '扫描地址必须是十六进制'
    return false
  }

  try {
    webUsbRtt.setScanRange({ start, end, stepSize })
    const normalized = webUsbRtt.scanRange.value
    rttScanStartInput.value = formatHexAddress(normalized.start)
    rttScanEndInput.value = formatHexAddress(normalized.end)
    rttScanStepInput.value = normalized.stepSize
    webUsbScanRangeError.value = ''
    return true
  } catch (error) {
    webUsbScanRangeError.value = error instanceof Error ? error.message : '扫描范围无效'
    return false
  }
}

function openVariableElfPicker(): void {
  variableElfInputRef.value?.click()
}

function toVariableType(size: number): VariableSpec['type'] | null {
  if (size <= 0) return null
  if (size === 1) return 'u8'
  if (size === 2) return 'u16'
  return 'u32'
}

async function handleVariableElfSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  variableError.value = ''
  variableElfName.value = file.name

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const image = parseElfImage(bytes)
    const symbols = image.symbols ?? []

    const specs = symbols
      .filter(symbol => symbol.type === 'object' && symbol.address > 0)
      .map(symbol => ({
        name: symbol.name,
        address: symbol.address,
        type: toVariableType(symbol.size) ?? 'u32',
      }))
      .slice(0, 64)

    variableSpecs.value = specs
    variableValues.value = []
    if (specs.length === 0) {
      variableError.value = 'ELF 中未找到可读取的全局对象符号'
      return
    }

    await refreshVariableValues()
  } catch (error) {
    variableError.value = error instanceof Error ? error.message : String(error)
    variableSpecs.value = []
    variableValues.value = []
  } finally {
    input.value = ''
  }
}

async function refreshVariableValues(): Promise<void> {
  if (!isWebUsbMode.value) {
    variableError.value = '当前仅支持 WebUSB 后端变量读取'
    return
  }
  if (!isConnected.value) {
    variableError.value = '请先连接调试探针'
    return
  }
  if (variableSpecs.value.length === 0) {
    variableError.value = '请先导入含符号的 ELF 文件'
    return
  }

  variableLoading.value = true
  variableError.value = ''
  try {
    variableValues.value = await inspectGlobalVariables(variableSpecs.value, {
      read8: (address, length) => webUsbRtt.readMemory(address, length),
      write8: async () => { throw new Error('write8 not supported in variable inspector') },
      read32: async () => { throw new Error('read32 not supported in variable inspector') },
      write32: async () => { throw new Error('write32 not supported in variable inspector') },
    })
  } catch (error) {
    variableError.value = error instanceof Error ? error.message : String(error)
  } finally {
    variableLoading.value = false
  }
}

function formatVariableValue(item: VariableValue): string {
  if (item.value === null || Number.isNaN(item.value)) return '-'
  if (item.type === 'f32') return `${item.value}`
  const intValue = Math.trunc(item.value)
  return `${intValue} (0x${(intValue >>> 0).toString(16).toUpperCase()})`
}

function formatVariableAddress(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(8, '0')}`
}

function resetVariableRefreshTimer(): void {
  if (variableRefreshTimer) {
    clearInterval(variableRefreshTimer)
    variableRefreshTimer = null
  }
  if (!variableAutoRefresh.value) return
  variableRefreshTimer = setInterval(() => {
    if (!variableLoading.value && variableSpecs.value.length > 0 && isConnected.value) {
      refreshVariableValues()
    }
  }, variableRefreshMs.value)
}

function openFirmwarePicker(): void {
  firmwareInputRef.value?.click()
}

function parseFirmwareBaseAddress(): number {
  const value = firmwareBaseAddressInput.value.trim().toLowerCase()
  const normalized = value.startsWith('0x') ? value.slice(2) : value
  const parsed = Number.parseInt(normalized, 16)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('BIN 基地址无效，请使用十六进制地址')
  }
  return parsed
}

function parseAddressInput(value: string, label: string): number {
  const parsed = parseHexAddress(value)
  if (parsed === null) {
    throw new Error(`${label} 无效，请使用十六进制`)
  }
  return parsed
}

function flashRegionConfig(): { name: string; start: number; end: number; pageSize: number } {
  const start = parseAddressInput(flashStartAddressInput.value, 'Flash 起始地址')
  const end = parseAddressInput(flashEndAddressInput.value, 'Flash 结束地址')
  const pageSize = flashPageSizeInput.value

  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new Error('Flash 页大小无效')
  }
  if (end <= start) {
    throw new Error('Flash 结束地址必须大于起始地址')
  }

  return { name: 'main-flash', start, end, pageSize }
}

async function handleFirmwareSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  flashStatus.value = 'planning'
  flashError.value = ''
  firmwareName.value = file.name

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const lowerName = file.name.toLowerCase()
    if (lowerName.endsWith('.hex')) {
      firmwareImage.value = parseIntelHex(new TextDecoder().decode(bytes))
    } else if (lowerName.endsWith('.elf') || lowerName.endsWith('.axf') || lowerName.endsWith('.out')) {
      firmwareImage.value = parseElfImage(bytes)
    } else {
      firmwareImage.value = parseBinaryImage(bytes, parseFirmwareBaseAddress())
    }
    planFirmwareProgramming()
  } catch (error) {
    flashStatus.value = 'error'
    flashError.value = error instanceof Error ? error.message : String(error)
    firmwareImage.value = null
    flashPlanSummary.value = null
    flashVerifyReport.value = null
  } finally {
    input.value = ''
  }
}

function planFirmwareProgramming(): void {
  if (!firmwareImage.value) {
    flashError.value = '请先导入固件镜像'
    flashStatus.value = 'error'
    return
  }

  try {
    const region = flashRegionConfig()
    const plan = planFlashRanges({
      regions: [region],
      sections: firmwareImage.value.sections,
    })
    flashPlanSummary.value = {
      erasePages: plan.erasePages.length,
      programSections: plan.programSections.length,
      verifyBytes: plan.verifyRanges.reduce((sum, item) => sum + item.length, 0),
    }
    flashStatus.value = 'ready'
    flashError.value = ''
    flashProgress.value = 0
    flashStage.value = 'idle'
    flashHint.value = ''
    flashVerifyReport.value = null
  } catch (error) {
    flashStatus.value = 'error'
    flashError.value = error instanceof Error ? error.message : String(error)
    flashPlanSummary.value = null
    flashVerifyReport.value = null
  }
}

async function detectFlashChipFamily(): Promise<void> {
  if (!isConnected.value) {
    flashError.value = '请先连接调试探针后再识别芯片'
    return
  }

  try {
    const info = await webUsbRtt.readChipInfo()
    detectedChipLabel.value = `${info.name} / ${info.core}`
    const normalized = `${info.name} ${info.core}`.toLowerCase()
    if (normalized.includes('f1') || normalized.includes('m3')) {
      flashChipFamily.value = 'stm32f1'
      flashPageSizeInput.value = 1024
      flashStartAddressInput.value = '0x08000000'
      flashEndAddressInput.value = '0x08080000'
      flashHint.value = '已自动建议 STM32F1 配置（1KB 页，512KB 范围）。'
      return
    }
    if (normalized.includes('f4') || normalized.includes('m4')) {
      flashChipFamily.value = 'stm32f4'
      flashPageSizeInput.value = 16384
      flashStartAddressInput.value = '0x08000000'
      flashEndAddressInput.value = '0x08080000'
      flashHint.value = '已自动建议 STM32F4 配置（16KB 基础页，示例范围）。'
      return
    }
    flashHint.value = '未能自动识别芯片族，请手动确认芯片族。'
  } catch (error) {
    flashError.value = error instanceof Error ? error.message : String(error)
  }
}

async function programFirmware(): Promise<void> {
  if (!isWebUsbMode.value || !isConnected.value) {
    flashStatus.value = 'error'
    flashError.value = '请先连接 WebUSB 调试探针'
    return
  }
  if (!firmwareImage.value) {
    flashStatus.value = 'error'
    flashError.value = '请先导入固件镜像'
    return
  }

  flashStatus.value = 'programming'
  flashError.value = ''
  flashProgress.value = 0
  flashStage.value = 'erase'
  flashHint.value = ''
  flashVerifyReport.value = null

  try {
    webUsbRtt.setFlashChipFamily(flashChipFamily.value)
    const sections = firmwareImage.value.sections
    const region = flashRegionConfig()
    const plan = planFlashRanges({
      regions: [region],
      sections,
    })
    const programmer = createFlashProgrammer(
      {
        erasePage: (address) => webUsbRtt.eraseFlashPage(address),
        program: (address, data) => webUsbRtt.writeMemory(address, data),
        read: (address, length) => webUsbRtt.readMemory(address, length),
      },
      [region],
    )

    const eraseTotal = Math.max(plan.erasePages.length, 1)
    for (let i = 0; i < plan.erasePages.length; i++) {
      await programmer.erasePages([plan.erasePages[i]!])
      flashProgress.value = Math.round(((i + 1) / eraseTotal) * 35)
    }

    flashStage.value = 'program'
    const sectionTotal = Math.max(plan.programSections.length, 1)
    for (let i = 0; i < plan.programSections.length; i++) {
      await programmer.programSections([plan.programSections[i]!])
      flashProgress.value = 35 + Math.round(((i + 1) / sectionTotal) * 40)
    }

    flashStage.value = 'verify'
    const verifyReport = await programmer.verifySectionsDetailed(plan.programSections)
    flashVerifyReport.value = verifyReport
    if (!verifyReport.ok) {
      const mismatch = verifyReport.mismatch
      const detail = mismatch
        ? `${mismatch.sectionName} ${formatHexAddress(mismatch.address)} offset ${mismatch.offset}: expected 0x${mismatch.expected.toString(16).padStart(2, '0')}, actual 0x${mismatch.actual.toString(16).padStart(2, '0')}`
        : '未知地址'
      throw new Error(`校验失败：读回数据与镜像不一致（${detail}）`)
    }
    flashProgress.value = 100
    flashStage.value = 'done'
    flashHint.value = '烧录完成，建议复位后观察日志与变量区。'
    flashStatus.value = 'success'
  } catch (error) {
    flashStatus.value = 'error'
    flashError.value = error instanceof Error ? error.message : String(error)
    flashHint.value = '失败建议：检查芯片族、页大小、地址范围；必要时先手动擦除再重试。'
  }
}

watch([variableAutoRefresh, variableRefreshMs], resetVariableRefreshTimer)
watch(isConnected, connected => {
  if (!connected) {
    variableAutoRefresh.value = false
  }
})

onUnmounted(() => {
  if (variableRefreshTimer) {
    clearInterval(variableRefreshTimer)
    variableRefreshTimer = null
  }
})

/**
 * 切换日志级别过滤
 * @param level 日志级别
 */
function toggleLevelFilter(level: RttLogLevel): void {
  const levels = [...filter.value.levels]
  const idx = levels.indexOf(level)
  if (idx > -1) {
    if (levels.length > 1) {
      levels.splice(idx, 1)
    }
  } else {
    levels.push(level)
  }
  wsRtt.setFilter({ levels })
}

/**
 * 切换通道过滤
 * @param ch 通道号
 */
function toggleChannelFilter(ch: number): void {
  const chs = [...filter.value.channels]
  const idx = chs.indexOf(ch)
  if (idx > -1) {
    if (chs.length > 1) {
      chs.splice(idx, 1)
    }
  } else {
    chs.push(ch)
  }
  wsRtt.setFilter({ channels: chs })
}

/**
 * 处理连接/断开按钮点击
 */
async function handleConnectToggle(): Promise<void> {
  if (isConnected.value) {
    await handleDisconnect()
  } else if (canConnect.value) {
    await handleConnect()
  }
}

/**
 * 处理连接
 */
async function handleConnect(): Promise<void> {
  if (isWebUsbMode.value) {
    // WebUSB 模式
    if (!applyWebUsbScanRange()) return
    const success = await webUsbRtt.connect(webUsbFrequency.value)
    if (!success) {
      console.log('[RTT] WebUSB 连接失败')
    }
  } else {
    // WebSocket 模式
    wsRtt.connect()
  }
}

/**
 * 处理断开
 */
async function handleDisconnect(): Promise<void> {
  if (isWebUsbMode.value) {
    await webUsbRtt.disconnect()
  } else {
    wsRtt.disconnect()
  }
}

/**
 * 处理发送按钮点击
 */
function handleSend(): void {
  if (!sendInput.value.trim() || !isConnected.value) return

  if (isWebUsbMode.value) {
    webUsbRtt.send(sendInput.value, sendChannel.value)
  } else {
    wsRtt.send(sendInput.value, sendChannel.value)
  }
  sendInput.value = ''
}

/**
 * 处理清空日志
 */
function handleClearLogs(): void {
  if (isWebUsbMode.value) {
    webUsbRtt.clearLogs()
  } else {
    wsRtt.clearLogs()
  }
}

/**
 * 处理暂停/恢复
 */
function handleTogglePause(): void {
  if (isWebUsbMode.value) {
    webUsbRtt.togglePause()
  } else {
    wsRtt.togglePause()
  }
}

/**
 * 处理导出日志
 */
function handleExport(): void {
  const logs = isWebUsbMode.value ? webUsbRtt.logs.value : filteredLogs.value
  const content = logs.map(log => {
    const d = new Date(log.timestamp)
    const ts = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`
    return `[${ts}] [${log.level.toUpperCase()}] Ch${log.channel}: ${log.text}`
  }).join('\n')

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `rtt_log_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 处理导出会话
 */
function handleExportSession(): void {
  const content = wsRtt.exportSession()
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `rtt_session_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 选择 WebUSB 设备
 */
async function handleSelectWebUsbDevice(): Promise<void> {
  await webUsbRtt.requestDevice()
}

/**
 * 选择 ELF 文件
 */
function selectElfFile(): void {
  wsRtt.selectElfFile()
}

/** 监听日志变化自动滚动 */
watch(
  () => filteredLogs.value.length,
  async () => {
    if (autoScroll.value && virtualListRef.value) {
      await nextTick()
      virtualListRef.value.scrollToBottom()
    }
  },
)
</script>

<template>
  <div class="flex h-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
    <!-- 主内容区 -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- 顶部控制栏 -->
      <div class="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
        <div class="flex items-center gap-2 flex-wrap">
          <!-- 状态灯 -->
          <div class="flex items-center gap-2">
            <div
              class="w-2.5 h-2.5 rounded-full shrink-0"
              :class="stateIndicator"
            />
            <span class="text-xs text-slate-500 dark:text-slate-400">
              {{ connectionState === 'connected' ? t('rtt.connected') : connectionState === 'connecting' ? t('rtt.connecting') : t('rtt.disconnected') }}
            </span>
          </div>

          <!-- 分隔线 -->
          <div class="w-px h-5 bg-slate-200 dark:bg-slate-700" />

          <!-- 后端选择 -->
          <div class="flex items-center gap-1.5">
            <label class="text-xs text-slate-500 dark:text-slate-400">{{ t('rtt.backend') }}</label>
            <select
              v-model="backend"
              :disabled="isConnected"
              class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option v-for="opt in backendOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <div class="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">
            <span class="uppercase">{{ backend }}</span>
            <span>·</span>
            <span>{{ channels.length }}ch</span>
          </div>

          <button
            @click="showTopConfigDetails = !showTopConfigDetails"
            class="flex items-center gap-1 px-2.5 py-1 rounded text-xs border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            :title="showTopConfigDetails ? '收起高级配置' : '展开高级配置'"
          >
            <component :is="showTopConfigDetails ? ChevronUp : ChevronDown" class="w-3.5 h-3.5" />
            <span>{{ showTopConfigDetails ? '收起配置' : '展开配置' }}</span>
          </button>

          <!-- 分隔线 -->
          <div class="w-px h-5 bg-slate-200 dark:bg-slate-700" />

          <!-- 连接/断开按钮 -->
          <button
            @click="handleConnectToggle"
            :disabled="connectionState === 'connecting'"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all"
            :class="isConnected
              ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-800'
              : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 border border-green-200 dark:border-green-800 disabled:opacity-50'"
          >
            <Unplug v-if="isConnected" class="w-3.5 h-3.5" />
            <Usb v-else class="w-3.5 h-3.5" />
            {{ connectBtnText }}
          </button>

          <!-- 暂停按钮 -->
          <button
            @click="handleTogglePause()"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-all"
            :class="isPaused
              ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'"
            :title="isPaused ? t('rtt.resume') : t('rtt.pause')"
          >
            <Play v-if="isPaused" class="w-3.5 h-3.5" />
            <Pause v-else class="w-3.5 h-3.5" />
          </button>

          <button
            @click="showRightPanel = !showRightPanel"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            :title="t('rtt.togglePanel')"
          >
            <PanelRight class="w-3.5 h-3.5" />
          </button>

          <button
            @click="showHelpPanel = !showHelpPanel"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-all"
            :class="showHelpPanel ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'"
            :title="t('rtt.help')"
          >
            <HelpCircle class="w-3.5 h-3.5" />
          </button>

          <!-- 统计信息 -->
          <div class="ml-auto flex items-center gap-1.5 text-[11px]">
            <span
              v-for="chip in workbenchStatusChips"
              :key="chip.key"
              class="px-2 py-1 rounded border"
              :class="chip.tone === 'ok'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800'
                : chip.tone === 'warn'
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800'
                  : chip.tone === 'error'
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'"
            >
              {{ chip.label }}: {{ chip.value }}
            </span>
            <span class="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{{ logStats.total }} {{ t('rtt.entries') }}</span>
            <span v-if="logStats.errors > 0" class="px-2 py-1 rounded bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400">
              {{ logStats.errors }} {{ t('rtt.errors') }}
            </span>
            <span v-if="logStats.warnings > 0" class="px-2 py-1 rounded bg-yellow-50 dark:bg-yellow-900/20 text-yellow-500 dark:text-yellow-400">
              {{ logStats.warnings }} {{ t('rtt.warnings') }}
            </span>
          </div>
        </div>

        <div v-if="showTopConfigDetails" class="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-3 flex-wrap rounded-md bg-slate-50/70 dark:bg-slate-800/30 px-2.5 py-2">
          <!-- probe-rs 配置 -->
          <template v-if="backend === 'probe-rs'">
            <!-- ELF 文件路径 -->
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">ELF</label>
              <input
                v-model="elfPath"
                :disabled="isConnected"
                type="text"
                placeholder="固件 ELF 文件路径"
                class="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 min-w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                readonly
                @click="selectElfFile"
              />
              <button
                @click="selectElfFile"
                :disabled="isConnected"
                class="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-50 transition-colors"
                title="选择 ELF 文件"
              >
                <Search class="w-3.5 h-3.5" />
              </button>
            </div>
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">{{ t('rtt.chip') }}</label>
              <input
                v-model="chipModel"
                :disabled="isConnected"
                type="text"
                placeholder="STM32F407VGTx"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 w-36 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">{{ t('rtt.protocol') }}</label>
              <select
                v-model="protocol"
                :disabled="isConnected"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="Swd">SWD</option>
                <option value="Jtag">JTAG</option>
              </select>
            </div>
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">{{ t('rtt.probe') }}</label>
              <select
                v-model="selectedProbe"
                :disabled="isConnected"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 max-w-[160px] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="">{{ t('rtt.autoDetect') }}</option>
                <option v-for="probe in probes" :key="probe.identifier" :value="probe.identifier">
                  {{ probe.displayName }}
                </option>
              </select>
              <button
                @click="wsRtt.refreshProbes()"
                :disabled="isConnected"
                class="p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50 transition-colors"
                :title="t('rtt.refreshProbes')"
              >
                <RefreshCw class="w-3.5 h-3.5" />
              </button>
            </div>
          </template>

          <!-- OpenOCD 配置 -->
          <template v-if="backend === 'openocd'">
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">Host</label>
              <input
                v-model="openocdHost"
                :disabled="isConnected"
                type="text"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 w-24 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">Port</label>
              <input
                v-model.number="openocdPort"
                :disabled="isConnected"
                type="number"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 w-16 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
          </template>

          <!-- J-Link 配置 -->
          <template v-if="backend === 'jlink'">
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">Host</label>
              <input
                v-model="jlinkHost"
                :disabled="isConnected"
                type="text"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 w-24 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">Port</label>
              <input
                v-model.number="jlinkPort"
                :disabled="isConnected"
                type="number"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 w-16 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
          </template>

          <!-- WebUSB 配置 -->
          <template v-if="backend === 'webusb'">
            <!-- 选择设备按钮 -->
            <button
              @click="handleSelectWebUsbDevice"
              :disabled="isConnected"
              class="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-all"
              :class="webUsbRtt.probe.value
                ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'"
            >
              <Cpu class="w-3.5 h-3.5" />
              {{ webUsbRtt.probe.value ? webUsbProbeName : '选择设备' }}
            </button>

            <!-- 协议选择 -->
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">协议</label>
              <select
                v-model="webUsbProtocol"
                :disabled="isConnected"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="swd">SWD</option>
                <option value="jtag">JTAG</option>
              </select>
            </div>

            <!-- 频率选择 -->
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">频率</label>
              <select
                v-model.number="webUsbFrequency"
                :disabled="isConnected"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option v-for="opt in frequencyOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <!-- RTT 扫描范围 -->
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">扫描</label>
              <input
                v-model="rttScanStartInput"
                :disabled="isConnected"
                type="text"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 w-28 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                @blur="applyWebUsbScanRange"
              />
              <span class="text-xs text-slate-400 dark:text-slate-500">-</span>
              <input
                v-model="rttScanEndInput"
                :disabled="isConnected"
                type="text"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 w-28 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                @blur="applyWebUsbScanRange"
              />
              <input
                v-model.number="rttScanStepInput"
                :disabled="isConnected"
                type="number"
                min="4"
                step="4"
                title="扫描步长"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 w-16 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                @blur="applyWebUsbScanRange"
              />
              <button
                @click="applyWebUsbScanRange"
                :disabled="isConnected"
                class="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                应用
              </button>
            </div>

            <div v-if="webUsbScanRangeError" class="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
              <AlertCircle class="w-3.5 h-3.5" />
              <span>{{ webUsbScanRangeError }}</span>
            </div>

            <!-- WebUSB 支持提示 -->
            <div v-if="!webUsbRtt.isSupported.value" class="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
              <AlertCircle class="w-3.5 h-3.5" />
              <span>需要 Chrome/Edge 89+</span>
            </div>
          </template>

          <!-- 清空按钮 -->
          <button
            @click="handleClearLogs()"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            :title="t('rtt.clearLogs')"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>

          <!-- 导出按钮 -->
          <button
            @click="handleExport"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            :title="t('rtt.exportLogs')"
          >
            <Download class="w-3.5 h-3.5" />
          </button>

          <!-- 自动滚动开关 -->
          <button
            @click="autoScroll = !autoScroll"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-all"
            :class="autoScroll ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
            :title="t('rtt.autoScroll')"
          >
            <Radio class="w-3.5 h-3.5" />
          </button>

        </div>

        <!-- 错误消息 -->
        <div
          v-if="errorMessage"
          class="mt-2 flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-3 py-1.5"
        >
          <AlertCircle class="w-3.5 h-3.5 shrink-0" />
          <span class="flex-1">{{ errorMessage }}</span>
          <button @click="isWebUsbMode ? webUsbRtt.clearError() : ''" class="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- 主内容区域 -->
      <div class="flex-1 flex min-h-0">
        <!-- 日志区域 -->
        <div class="flex-1 flex flex-col min-w-0">
          <div class="flex-1 min-h-0 bg-white dark:bg-slate-900">
            <VirtualList
              ref="virtualListRef"
              :items="filteredLogs"
              :item-height="22"
              :buffer="20"
              key-field="id"
            >
              <template #default="{ item }">
                <div
                  class="flex items-center px-3 text-xs hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                  :class="LEVEL_BG_MAP[(item as any).level]"
                >
                  <!-- 时间戳 -->
                  <span class="text-slate-400 dark:text-slate-500 w-20 shrink-0 select-none">
                    {{ formatTimestamp((item as any).timestamp) }}
                  </span>

                  <!-- 级别标签 -->
                  <span
                    class="w-12 shrink-0 font-semibold select-none"
                    :class="LEVEL_COLOR_MAP[(item as any).level]"
                  >
                    {{ (item as any).level.toUpperCase() }}
                  </span>

                  <!-- 通道标签 -->
                  <span class="text-slate-400 dark:text-slate-500 w-10 shrink-0 select-none">
                    Ch{{ (item as any).channel }}
                  </span>

                  <!-- 日志内容 -->
                  <span class="flex-1 min-w-0 truncate" :class="LEVEL_COLOR_MAP[(item as any).level]">
                    {{ (item as any).text }}
                  </span>
                </div>
              </template>
            </VirtualList>

            <!-- 空状态 -->
            <div
              v-if="filteredLogs.length === 0"
              class="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500"
            >
              <Terminal class="w-12 h-12 mb-3 opacity-30" />
              <p class="text-sm">{{ t('rtt.noData') }}</p>
              <p class="text-xs mt-1 text-slate-400 dark:text-slate-600">{{ t('rtt.clickConnect') }}</p>
            </div>
          </div>

          <!-- 底部输入区 -->
          <div class="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2">
            <div class="flex items-center gap-2">
              <!-- 通道选择 -->
              <select
                v-model.number="sendChannel"
                :disabled="!isConnected"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 w-16 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option v-for="ch in channels" :key="ch.number" :value="ch.number">
                  Ch{{ ch.number }}
                </option>
                <option v-if="channels.length === 0" :value="0">Ch0</option>
              </select>

              <!-- 输入框 -->
              <input
                v-model="sendInput"
                type="text"
                :placeholder="t('rtt.sendPlaceholder')"
                :disabled="!isConnected"
                class="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                @keydown.enter="handleSend"
              />

              <!-- 发送按钮 -->
              <button
                @click="handleSend"
                :disabled="!isConnected || !sendInput.trim()"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 disabled:opacity-50 transition-all"
              >
                <Send class="w-3.5 h-3.5" />
                {{ t('rtt.send') }}
              </button>
            </div>
          </div>
        </div>

        <!-- 帮助面板 -->
        <div
          v-if="showHelpPanel"
          class="w-96 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto"
        >
          <!-- v-once: 静态内容不需要重复渲染 -->
          <div class="p-4" v-once>
            <h3 class="text-base font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
              <BookOpen class="w-5 h-5" />
              RTT 调试完整指南
            </h3>

            <div class="space-y-5 text-xs text-slate-600 dark:text-slate-400">
              <!-- 快速开始：选择连接方式 -->
              <div class="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <h4 class="font-bold text-blue-800 dark:text-blue-200 mb-3 flex items-center gap-2 text-sm">
                  <Zap class="w-4 h-4" />
                  🚀 快速开始：选择连接方式
                </h4>

                <!-- 连接方式选择按钮组 -->
                <div class="grid gap-2 mb-4 grid-cols-1">
                  <button
                    @click="backend = 'webusb'"
                    class="p-3 rounded-lg border-2 transition-all text-left"
                    :class="backend === 'webusb'
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/30 shadow-md'
                      : 'border-slate-200 dark:border-slate-700 hover:border-green-300 dark:hover:border-green-700'"
                  >
                    <div class="flex items-center gap-2 mb-1">
                      <Zap class="w-4 h-4 text-green-600 dark:text-green-400" />
                      <span class="font-bold text-green-700 dark:text-green-300">WebUSB</span>
                    </div>
                    <p class="text-[10px] text-slate-500 dark:text-slate-400">纯浏览器运行，无需服务</p>
                  </button>

                </div>

                <!-- 当前后端要求提示 -->
                <div v-if="currentBackendRequirements" class="p-3 bg-white/50 dark:bg-slate-800/50 rounded-lg">
                  <div class="flex items-center gap-2 mb-2">
                    <Info class="w-4 h-4 text-blue-500" />
                    <span class="font-medium text-slate-700 dark:text-slate-300">{{ currentBackendRequirements.title }} 使用条件</span>
                  </div>
                  <ul class="space-y-1 text-slate-600 dark:text-slate-400">
                    <li v-for="(req, idx) in currentBackendRequirements.requirements" :key="idx" class="flex items-start gap-1.5">
                      <span class="text-green-500 mt-0.5">✓</span>
                      <span>{{ req }}</span>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- WebUSB 直连教程 -->
              <div class="p-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <h4 class="font-bold text-green-700 dark:text-green-300 mb-3 flex items-center gap-2 text-sm">
                  <Zap class="w-4 h-4" />
                  📱 WebUSB 直连教程（推荐）
                </h4>
                <p class="mb-3 text-slate-600 dark:text-slate-400">无需任何本地服务，像 Web Serial 一样丝滑！</p>

                <!-- 步骤卡片 -->
                <div class="space-y-2">
                  <div class="flex items-start gap-3 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <span class="w-6 h-6 shrink-0 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">1</span>
                    <div>
                      <div class="font-medium text-slate-700 dark:text-slate-300">选择 WebUSB 后端</div>
                      <div class="text-[10px] text-slate-500">点击上方「WebUSB」按钮切换</div>
                    </div>
                  </div>
                  <div class="flex items-start gap-3 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <span class="w-6 h-6 shrink-0 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">2</span>
                    <div>
                      <div class="font-medium text-slate-700 dark:text-slate-300">点击「选择设备」按钮</div>
                      <div class="text-[10px] text-slate-500">浏览器会弹出设备选择对话框</div>
                    </div>
                  </div>
                  <div class="flex items-start gap-3 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <span class="w-6 h-6 shrink-0 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">3</span>
                    <div>
                      <div class="font-medium text-slate-700 dark:text-slate-300">选择您的 ST-Link 探针</div>
                      <div class="text-[10px] text-slate-500">在列表中找到并选择调试器</div>
                    </div>
                  </div>
                  <div class="flex items-start gap-3 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <span class="w-6 h-6 shrink-0 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">4</span>
                    <div>
                      <div class="font-medium text-slate-700 dark:text-slate-300">点击「连接」开始调试</div>
                      <div class="text-[10px] text-slate-500">RTT 日志会自动显示</div>
                    </div>
                  </div>
                </div>

                <!-- 支持设备 -->
                <div class="mt-3 p-2 bg-green-100/50 dark:bg-green-900/30 rounded-lg">
                  <div class="font-medium text-green-700 dark:text-green-300 mb-1">✅ 支持设备：</div>
                  <div class="flex flex-wrap gap-1">
                    <span class="px-2 py-0.5 bg-green-200 dark:bg-green-800 rounded text-green-700 dark:text-green-300 text-[10px] font-medium">ST-Link V2</span>
                    <span class="px-2 py-0.5 bg-green-200 dark:bg-green-800 rounded text-green-700 dark:text-green-300 text-[10px] font-medium">ST-Link V2-1</span>
                    <span class="px-2 py-0.5 bg-green-200 dark:bg-green-800 rounded text-green-700 dark:text-green-300 text-[10px] font-medium">ST-Link V3</span>
                  </div>
                </div>

                <!-- 重要提示 -->
                <div class="mt-3 p-2 bg-yellow-100/50 dark:bg-yellow-900/30 rounded-lg text-yellow-700 dark:text-yellow-300">
                  <strong>⚠️ 注意：</strong>目标程序必须已集成 RTT 库（SEGGER_RTT.c/h）
                </div>
              </div>

              <!-- probe-rs 详细教程 -->
              <div class="p-4 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <h4 class="font-bold text-purple-700 dark:text-purple-300 mb-3 flex items-center gap-2 text-sm">
                  <Wifi class="w-4 h-4" />
                  📦 probe-rs 详细教程
                </h4>

                <!-- 功能亮点 -->
                <div class="mb-3 p-3 bg-purple-100/50 dark:bg-purple-900/30 rounded-lg">
                  <div class="font-medium text-purple-700 dark:text-purple-300 mb-2">✨ 功能亮点</div>
                  <ul class="space-y-1 text-slate-600 dark:text-slate-400">
                    <li class="flex items-center gap-1.5"><span>🎯</span> 支持多种探针：ST-Link、J-Link、DAPLink、FTDI</li>
                    <li class="flex items-center gap-1.5"><span>⚡</span> 跨平台支持：Windows、macOS、Linux</li>
                    <li class="flex items-center gap-1.5"><span>🔍</span> 自动检测 RTT 控制块</li>
                    <li class="flex items-center gap-1.5"><span>📊</span> 多通道支持</li>
                  </ul>
                </div>

                <!-- ⚠️ 重要提示 -->
                <div class="mb-3 p-3 bg-yellow-100/50 dark:bg-yellow-900/30 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div class="font-medium text-yellow-700 dark:text-yellow-300 mb-1">⚠️ 重要提示（v0.31+）</div>
                  <p class="text-yellow-600 dark:text-yellow-400">probe-rs v0.31+ 需要 ELF 文件路径才能连接 RTT。请先编译固件并填写 ELF 路径。</p>
                </div>

                <!-- 支持的探针 -->
                <div class="mb-3 p-3 bg-white/50 dark:bg-slate-800/50 rounded-lg">
                  <div class="font-medium text-slate-700 dark:text-slate-300 mb-2">🔌 支持的探针</div>
                  <div class="flex flex-wrap gap-1.5">
                    <span class="px-2 py-1 bg-purple-200 dark:bg-purple-800 rounded text-purple-700 dark:text-purple-300 text-[10px] font-medium">ST-Link</span>
                    <span class="px-2 py-1 bg-purple-200 dark:bg-purple-800 rounded text-purple-700 dark:text-purple-300 text-[10px] font-medium">J-Link</span>
                    <span class="px-2 py-1 bg-purple-200 dark:bg-purple-800 rounded text-purple-700 dark:text-purple-300 text-[10px] font-medium">DAPLink</span>
                    <span class="px-2 py-1 bg-purple-200 dark:bg-purple-800 rounded text-purple-700 dark:text-purple-300 text-[10px] font-medium">FTDI</span>
                    <span class="px-2 py-1 bg-purple-200 dark:bg-purple-800 rounded text-purple-700 dark:text-purple-300 text-[10px] font-medium">ESP32</span>
                    <span class="px-2 py-1 bg-purple-200 dark:bg-purple-800 rounded text-purple-700 dark:text-purple-300 text-[10px] font-medium">WLink</span>
                  </div>
                </div>

                <!-- 安装步骤 -->
                <div class="space-y-2">
                  <div class="font-medium text-slate-700 dark:text-slate-300 mb-2">📥 安装步骤</div>

                  <div class="flex items-start gap-3 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <span class="w-6 h-6 shrink-0 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">1</span>
                    <div>
                      <div class="font-medium text-slate-700 dark:text-slate-300">下载预编译版本</div>
                      <a href="https://probe.rs/docs/getting-started/installation" target="_blank" class="text-purple-600 dark:text-purple-400 underline hover:no-underline text-[10px]">
                        🔗 probe.rs/docs/getting-started/installation
                      </a>
                    </div>
                  </div>

                  <div class="flex items-start gap-3 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <span class="w-6 h-6 shrink-0 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">2</span>
                    <div>
                      <div class="font-medium text-slate-700 dark:text-slate-300">Windows 下载</div>
                      <code class="text-[10px] bg-purple-100 dark:bg-purple-900/40 px-1 rounded">probe-rs-tools-*.zip</code>
                    </div>
                  </div>

                  <div class="flex items-start gap-3 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <span class="w-6 h-6 shrink-0 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">3</span>
                    <div>
                      <div class="font-medium text-slate-700 dark:text-slate-300">解压到任意目录</div>
                      <code class="text-[10px] bg-purple-100 dark:bg-purple-900/40 px-1 rounded">如 D:\probe-rs\</code>
                    </div>
                  </div>

                  <div class="flex items-start gap-3 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <span class="w-6 h-6 shrink-0 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">4</span>
                    <div>
                      <div class="font-medium text-slate-700 dark:text-slate-300">添加到 PATH 环境变量</div>
                      <div class="text-[10px] text-slate-500">将解压目录添加到系统 PATH</div>
                    </div>
                  </div>
                </div>

                <div class="mt-3 p-2 bg-slate-800 rounded-lg">
                  <div class="text-slate-400 text-[10px] mb-1"># 或使用 Cargo 安装：</div>
                  <code class="text-green-400 text-[10px]">cargo install probe-rs --features cli</code>
                </div>
              </div>

              <!-- OpenOCD 教程 -->
              <div class="p-4 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                <h4 class="font-bold text-orange-700 dark:text-orange-300 mb-3 flex items-center gap-2 text-sm">
                  <Terminal class="w-4 h-4" />
                  🔧 OpenOCD 教程
                </h4>

                <div class="space-y-3">
                  <div class="p-3 bg-orange-100/50 dark:bg-orange-900/30 rounded-lg">
                    <div class="font-medium text-orange-700 dark:text-orange-300 mb-2">📋 使用条件</div>
                    <ul class="space-y-1 text-slate-600 dark:text-slate-400 text-[10px]">
                      <li>✓ OpenOCD 已安装并添加到 PATH</li>
                      <li>✓ OpenOCD 已启动并连接目标</li>
                      <li>✓ OpenOCD 配置了 RTT 支持</li>
                      <li>✓ RTT TCP 服务已启动（默认端口 9090）</li>
                    </ul>
                  </div>

                  <div class="p-3 bg-slate-800 rounded-lg">
                    <div class="text-slate-400 text-[10px] mb-1"># OpenOCD 配置示例</div>
                    <pre class="text-green-400 text-[10px] overflow-x-auto">source [find interface/stlink.cfg]
source [find target/stm32f4x.cfg]

# 启用 RTT
rtt setup 0x20000000 0x10000 "SEGGER RTT"
rtt start

# 启动 TCP 服务
rtt server start 9090 0</pre>
                  </div>
                </div>
              </div>

              <!-- J-Link 教程 -->
              <div class="p-4 bg-gradient-to-br from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
                <h4 class="font-bold text-cyan-700 dark:text-cyan-300 mb-3 flex items-center gap-2 text-sm">
                  <Cpu class="w-4 h-4" />
                  🔌 J-Link 教程
                </h4>

                <div class="space-y-3">
                  <div class="p-3 bg-cyan-100/50 dark:bg-cyan-900/30 rounded-lg">
                    <div class="font-medium text-cyan-700 dark:text-cyan-300 mb-2">📋 使用条件</div>
                    <ul class="space-y-1 text-slate-600 dark:text-slate-400 text-[10px]">
                      <li>✓ J-Link 调试器已连接</li>
                      <li>✓ J-Link GDB Server 已启动</li>
                      <li>✓ RTT 已在 GDB Server 中启用</li>
                      <li>✓ RTT Telnet 服务已启动（默认端口 19021）</li>
                    </ul>
                  </div>

                  <div class="p-3 bg-slate-800 rounded-lg">
                    <div class="text-slate-400 text-[10px] mb-1"># J-Link GDB Server 启动</div>
                    <pre class="text-green-400 text-[10px]">JLinkGDBServer -device STM32F407VG -if SWD -speed 4000 -rtt</pre>
                  </div>
                </div>
              </div>

              <!-- 什么是 RTT -->
              <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <h4 class="font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2 text-sm">
                  <Info class="w-4 h-4" />
                  ❓ 什么是 RTT？
                </h4>
                <p class="text-slate-600 dark:text-slate-400">RTT (Real-Time Transfer) 是 SEGGER 开发的高速调试通信技术，可在不影响实时性的情况下传输调试信息。</p>

                <div class="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div class="p-2 bg-blue-100/50 dark:bg-blue-900/30 rounded-lg">
                    <div class="text-lg font-bold text-blue-600 dark:text-blue-400">2MB/s</div>
                    <div class="text-[10px] text-slate-500">传输速度</div>
                  </div>
                  <div class="p-2 bg-green-100/50 dark:bg-green-900/30 rounded-lg">
                    <div class="text-lg font-bold text-green-600 dark:text-green-400">0μs</div>
                    <div class="text-[10px] text-slate-500">额外延迟</div>
                  </div>
                  <div class="p-2 bg-purple-100/50 dark:bg-purple-900/30 rounded-lg">
                    <div class="text-lg font-bold text-purple-600 dark:text-purple-400">512B</div>
                    <div class="text-[10px] text-slate-500">最小内存</div>
                  </div>
                </div>
              </div>

              <!-- 使用技巧 -->
              <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <h4 class="font-bold text-slate-700 dark:text-slate-300 mb-2 text-sm">💡 使用技巧</h4>
                <ul class="space-y-2">
                  <li class="flex items-start gap-2">
                    <span class="text-green-500 mt-0.5">✓</span>
                    <span>确保目标程序已启用 RTT（SEGGER_RTT.c/h）</span>
                  </li>
                  <li class="flex items-start gap-2">
                    <span class="text-green-500 mt-0.5">✓</span>
                    <span>WebUSB 需要 Chrome/Edge 89+ 浏览器</span>
                  </li>
                  <li class="flex items-start gap-2">
                    <span class="text-green-500 mt-0.5">✓</span>
                    <span>日志过多时可使用过滤器筛选</span>
                  </li>
                  <li class="flex items-start gap-2">
                    <span class="text-green-500 mt-0.5">✓</span>
                    <span>支持导出日志和会话数据</span>
                  </li>
                  <li class="flex items-start gap-2">
                    <span class="text-green-500 mt-0.5">✓</span>
                    <span>按 <kbd class="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[10px]">Ctrl+F</kbd> 快速搜索日志</span>
                  </li>
                </ul>
              </div>

              <!-- 常见错误及解决方案 -->
              <div class="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <h4 class="font-bold text-red-700 dark:text-red-300 mb-3 flex items-center gap-2 text-sm">
                  <AlertCircle class="w-4 h-4" />
                  ⚠️ 常见错误及解决方案
                </h4>

                <div class="space-y-3">
                  <!-- 错误1 -->
                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <div class="font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                      <span class="text-red-500">❌</span> spawn probe-rs ENOENT
                    </div>
                    <div class="text-slate-500 dark:text-slate-400 text-[10px] mb-2">系统未安装 probe-rs 工具</div>
                    <div class="p-2 bg-green-50 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300 text-[10px]">
                      <strong>✅ 解决：</strong>参考上方 probe-rs 安装说明，安装后重启终端
                    </div>
                  </div>

                  <!-- 错误2 -->
                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <div class="font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                      <span class="text-red-500">❌</span> 未找到 RTT 控制块
                    </div>
                    <div class="text-slate-500 dark:text-slate-400 text-[10px] mb-2">无法在目标内存中定位 RTT 控制块</div>
                    <div class="p-2 bg-green-50 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300 text-[10px]">
                      <strong>✅ 解决：</strong>确保目标程序已正确初始化 RTT，且正在运行
                    </div>
                  </div>

                  <!-- 错误3 -->
                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <div class="font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                      <span class="text-red-500">❌</span> WebUSB 授权失败
                    </div>
                    <div class="text-slate-500 dark:text-slate-400 text-[10px] mb-2">浏览器无法访问 USB 设备</div>
                    <div class="p-2 bg-green-50 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300 text-[10px]">
                      <strong>✅ 解决：</strong>使用 HTTPS 或 localhost，并允许浏览器访问 USB 设备
                    </div>
                  </div>

                  <!-- 错误4 -->
                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <div class="font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                      <span class="text-red-500">❌</span> Bridge 连接失败
                    </div>
                    <div class="text-slate-500 dark:text-slate-400 text-[10px] mb-2">无法连接到 RTT Bridge 服务</div>
                    <div class="p-2 bg-green-50 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300 text-[10px]">
                      <strong>✅ 解决：</strong>检查 Bridge 是否已启动，端口是否正确（默认 19022）
                    </div>
                  </div>

                  <!-- 错误5 -->
                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <div class="font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                      <span class="text-red-500">❌</span> 探针连接失败
                    </div>
                    <div class="text-slate-500 dark:text-slate-400 text-[10px] mb-2">无法连接到调试探针</div>
                    <div class="p-2 bg-green-50 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300 text-[10px]">
                      <strong>✅ 解决：</strong>检查 USB 连接、驱动程序安装，确认探针型号支持
                    </div>
                  </div>

                  <!-- 错误6 -->
                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <div class="font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                      <span class="text-red-500">❌</span> ELF 文件路径无效
                    </div>
                    <div class="text-slate-500 dark:text-slate-400 text-[10px] mb-2">指定的 ELF 文件不存在或无法访问</div>
                    <div class="p-2 bg-green-50 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300 text-[10px]">
                      <strong>✅ 解决：</strong>确认文件路径正确，使用「选择文件」按钮浏览选择
                    </div>
                  </div>

                  <!-- 错误7 -->
                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <div class="font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                      <span class="text-red-500">❌</span> 芯片型号不支持
                    </div>
                    <div class="text-slate-500 dark:text-slate-400 text-[10px] mb-2">指定的芯片型号不被支持</div>
                    <div class="p-2 bg-green-50 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300 text-[10px]">
                      <strong>✅ 解决：</strong>检查芯片型号拼写，使用 probe-rs chip list 查看支持的芯片
                    </div>
                  </div>
                </div>
              </div>

              <!-- 相关链接 -->
              <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <h4 class="font-bold text-slate-700 dark:text-slate-300 mb-2 text-sm">🔗 相关链接</h4>
                <div class="space-y-1.5">
                  <a href="https://probe.rs/docs/getting-started/installation" target="_blank" class="flex items-center gap-2 text-purple-600 dark:text-purple-400 hover:underline">
                    <span>📦</span> probe-rs 安装文档
                  </a>
                  <a href="https://www.segger.com/products/debug-probes/j-link/technology/about-real-time-transfer/" target="_blank" class="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 hover:underline">
                    <span>📚</span> SEGGER RTT 官方文档
                  </a>
                  <a href="https://openocd.org/documentation/" target="_blank" class="flex items-center gap-2 text-orange-600 dark:text-orange-400 hover:underline">
                    <span>🔧</span> OpenOCD 文档
                  </a>
                  <a href="https://www.segger.com/downloads/jlink/" target="_blank" class="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline">
                    <span>🔌</span> J-Link 下载
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧工具栏 -->
    <div
      v-if="showRightPanel"
      class="w-56 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col"
    >
      <!-- 搜索 -->
      <div class="p-3 border-b border-slate-200 dark:border-slate-800">
        <div class="relative">
          <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            :value="filter.searchText"
            @input="wsRtt.setFilter({ searchText: ($event.target as HTMLInputElement).value })"
            type="text"
            :placeholder="t('rtt.searchPlaceholder')"
            class="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded pl-8 pr-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <!-- 级别过滤 -->
      <div class="p-3 border-b border-slate-200 dark:border-slate-800">
        <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{{ t('rtt.levelFilter') }}</h3>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="opt in levelOptions"
            :key="opt.value"
            @click="toggleLevelFilter(opt.value)"
            class="px-2 py-1 rounded text-[10px] font-semibold border transition-all"
            :class="filter.levels.includes(opt.value)
              ? `${opt.color} ${LEVEL_BG_MAP[opt.value]} border-current/30`
              : 'text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:text-slate-600 dark:hover:text-slate-300'"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- 通道过滤 -->
      <div class="p-3 border-b border-slate-200 dark:border-slate-800">
        <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{{ t('rtt.channelFilter') }}</h3>
        <div v-if="channels.length > 0" class="flex flex-wrap gap-1.5">
          <button
            v-for="ch in channels"
            :key="ch.number"
            @click="toggleChannelFilter(ch.number)"
            class="px-2 py-1 rounded text-[10px] font-semibold border transition-all"
            :class="filter.channels.includes(ch.number)
              ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800'
              : 'text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:text-slate-600 dark:hover:text-slate-300'"
          >
            Ch{{ ch.number }}
          </button>
        </div>
        <p v-else class="text-[10px] text-slate-400 dark:text-slate-500">{{ t('rtt.noChannels') }}</p>
      </div>

      <input
        ref="variableElfInputRef"
        type="file"
        accept=".elf,.axf,.out"
        class="hidden"
        @change="handleVariableElfSelected"
      />
      <input
        ref="firmwareInputRef"
        type="file"
        accept=".bin,.hex,.elf,.axf,.out"
        class="hidden"
        @change="handleFirmwareSelected"
      />

      <!-- 导出选项 -->
      <div class="p-3 border-b border-slate-200 dark:border-slate-800">
        <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{{ t('rtt.exportOptions') }}</h3>
        <div class="flex flex-col gap-1.5">
          <button
            @click="handleExport"
            class="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            <Download class="w-3.5 h-3.5" />
            {{ t('rtt.exportTxt') }}
          </button>
          <button
            @click="handleExportSession"
            class="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            <Download class="w-3.5 h-3.5" />
            {{ t('rtt.exportSession') }}
          </button>
        </div>
      </div>

      <RttDebugControls
        :is-connected="isConnected"
        :debug-control-state="debugControlState"
        :debug-control-error="debugControlError"
        v-model:breakpoint-input="breakpointInput"
        :hardware-breakpoints="hardwareBreakpoints"
        :breakpoint-restore-status="breakpointRestoreStatus"
        :core-register-items="coreRegisterItems"
        v-model:memory-view-address-input="memoryViewAddressInput"
        v-model:memory-view-length-input="memoryViewLengthInput"
        :memory-view-hex-lines="memoryViewHexLines"
        :memory-view-error="memoryViewError"
        :pc-focus-request-id="pcFocusRequestId"
        v-model:register-write-name="registerWriteName"
        v-model:register-write-value-input="registerWriteValueInput"
        :format-hex-address="formatHexAddress"
        @refresh-core-registers="refreshCoreRegisters"
        @debug-action="handleDebugAction"
        @add-hardware-breakpoint="addHardwareBreakpoint"
        @remove-hardware-breakpoint="removeHardwareBreakpoint"
        @clear-all-hardware-breakpoints="clearAllHardwareBreakpoints"
        @read-memory-preview="readMemoryPreview"
        @write-core-register-value="writeCoreRegisterValue"
      />

      <!-- 变量查看 -->
      <div class="p-3 border-b border-slate-200 dark:border-slate-800">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400">变量</h3>
          <div class="flex items-center gap-1">
            <button
              @click="openVariableElfPicker"
              class="px-2 py-1 rounded text-[10px] border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              导入 ELF
            </button>
            <button
              @click="refreshVariableValues"
              :disabled="variableLoading || !isConnected || variableSpecs.length === 0"
              class="p-1 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
              title="刷新变量"
            >
              <RefreshCw class="w-3 h-3" :class="variableLoading ? 'animate-spin' : ''" />
            </button>
          </div>
        </div>

        <div class="flex items-center gap-1.5 mb-2">
          <input
            v-model="variableFilterText"
            type="text"
            placeholder="筛选变量"
            class="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-[10px] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label class="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
            <input v-model="variableAutoRefresh" type="checkbox" class="w-3 h-3" />
            自动
          </label>
          <select
            v-model.number="variableRefreshMs"
            :disabled="!variableAutoRefresh"
            class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 text-[10px] text-slate-700 dark:text-slate-200 disabled:opacity-50"
          >
            <option :value="200">200ms</option>
            <option :value="500">500ms</option>
            <option :value="1000">1s</option>
          </select>
        </div>

        <p class="text-[10px] text-slate-500 dark:text-slate-400 truncate mb-1" :title="variableElfName || '未导入 ELF'">
          {{ variableElfName || '未导入 ELF' }}
        </p>
        <p class="text-[10px] text-slate-400 dark:text-slate-500 mb-2">
          {{ variableSpecs.length }} 个对象符号 / {{ filteredVariableValues.length }} 条显示
        </p>

        <div v-if="variableError" class="text-[10px] text-red-600 dark:text-red-400 mb-2">
          {{ variableError }}
        </div>

        <div class="grid grid-cols-[1.2fr_1fr_1.6fr] gap-1 text-[10px] text-slate-400 dark:text-slate-500 mb-1">
          <span>名称(类型)</span>
          <span>地址</span>
          <span class="text-right">值</span>
        </div>

        <div v-if="filteredVariableValues.length > 0" class="space-y-1 max-h-40 overflow-auto pr-1">
          <div
            v-for="item in filteredVariableValues"
            :key="`${item.name}-${item.address}`"
            class="grid grid-cols-[1.2fr_1fr_1.6fr] gap-1 items-center text-[10px]"
          >
            <span class="truncate text-slate-600 dark:text-slate-300" :title="item.name">{{ item.name }}({{ item.type }})</span>
            <span class="text-slate-500 dark:text-slate-400">{{ formatVariableAddress(item.address) }}</span>
            <span v-if="item.error" class="text-red-500 dark:text-red-400 truncate text-right" :title="item.error">ERR</span>
            <span v-else class="text-slate-500 dark:text-slate-400 text-right" :title="formatVariableValue(item)">{{ formatVariableValue(item) }}</span>
          </div>
        </div>
      </div>

      <!-- 固件烧录 -->
      <div class="p-3 border-b border-slate-200 dark:border-slate-800">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400">固件烧录(实验)</h3>
          <button
            @click="openFirmwarePicker"
            class="px-2 py-1 rounded text-[10px] border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            选择固件
          </button>
        </div>

        <p class="text-[10px] text-slate-500 dark:text-slate-400 truncate mb-2" :title="firmwareName || '未导入固件'">
          {{ firmwareName || '未导入固件' }}
        </p>

        <div class="grid grid-cols-3 gap-1.5 mb-2">
          <input
            v-model="firmwareBaseAddressInput"
            type="text"
            placeholder="BIN基址(0x...)"
            class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-[10px] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            v-model.number="flashPageSizeInput"
            type="number"
            min="256"
            step="256"
            placeholder="页大小"
            class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-[10px] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            v-model="flashChipFamily"
            class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-[10px] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="stm32f1">STM32F1</option>
            <option value="stm32f4">STM32F4</option>
          </select>
        </div>

        <div class="grid grid-cols-2 gap-1.5 mb-2">
          <input
            v-model="flashStartAddressInput"
            type="text"
            placeholder="Flash起始(0x...)"
            class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-[10px] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            v-model="flashEndAddressInput"
            type="text"
            placeholder="Flash结束(0x...)"
            class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-[10px] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div class="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-2 py-1.5 mb-2">
          <div class="text-[10px] text-slate-400 dark:text-slate-500 mb-1">烧录前检查</div>
          <div class="space-y-1">
            <div
              v-for="item in flashPrecheckItems"
              :key="item.label"
              class="flex items-center justify-between gap-2 text-[10px]"
            >
              <span
                :class="item.state === 'ok'
                  ? 'text-green-600 dark:text-green-400'
                  : item.state === 'warn'
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : item.state === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-500 dark:text-slate-400'"
              >
                {{ item.label }}
              </span>
              <span class="truncate text-right text-slate-500 dark:text-slate-400" :title="item.detail">
                {{ item.detail }}
              </span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-1.5 mb-2">
          <button
            @click="planFirmwareProgramming"
            :disabled="!firmwareImage || flashStatus === 'programming'"
            class="px-2 py-1 rounded text-[10px] border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            生成计划
          </button>
          <button
            @click="programFirmware"
            :disabled="flashStatus !== 'ready' || !isConnected"
            class="px-2 py-1 rounded text-[10px] border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-40 transition-colors"
          >
            执行写入
          </button>
          <button
            @click="detectFlashChipFamily"
            :disabled="!isConnected || flashStatus === 'programming'"
            class="px-2 py-1 rounded text-[10px] border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            识别芯片
          </button>
        </div>

        <div class="text-[10px] text-slate-500 dark:text-slate-400 mb-1">
          识别结果: {{ detectedChipLabel || '未识别' }}
        </div>

        <div v-if="flashPlanSummary" class="text-[10px] text-slate-500 dark:text-slate-400 space-y-0.5 mb-2">
          <div>擦除页: {{ flashPlanSummary.erasePages }}</div>
          <div>写入段: {{ flashPlanSummary.programSections }}</div>
          <div>校验字节: {{ flashPlanSummary.verifyBytes }}</div>
        </div>

        <div class="text-[10px] mb-1" :class="flashStatus === 'error' ? 'text-red-600 dark:text-red-400' : flashStatus === 'success' ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'">
          状态: {{ flashStatus }}
        </div>
        <div class="text-[10px] text-slate-500 dark:text-slate-400 mb-1">
          阶段: {{ flashStage }}
        </div>
        <div class="h-1.5 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden mb-1">
          <div class="h-full bg-blue-500 transition-all duration-200" :style="{ width: `${flashProgress}%` }" />
        </div>
        <div class="text-[10px] text-slate-500 dark:text-slate-400 mb-1">{{ flashProgress }}%</div>
        <div
          v-if="flashVerifyReport"
          class="mb-1 rounded border px-2 py-1.5 text-[10px]"
          :class="flashVerifyReport.ok
            ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
            : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'"
        >
          <div
            class="mb-1"
            :class="flashVerifyReport.ok
              ? 'text-green-700 dark:text-green-300'
              : 'text-red-700 dark:text-red-300'"
          >
            校验: {{ flashVerifyReport.ok ? '通过' : '失败' }} / {{ flashVerifyReport.checkedBytes }}B
          </div>
          <div
            v-if="flashVerifyReport.mismatch"
            class="grid grid-cols-2 gap-x-2 gap-y-0.5 text-red-600 dark:text-red-400"
          >
            <span>段: {{ flashVerifyReport.mismatch.sectionName }}</span>
            <span>偏移: {{ flashVerifyReport.mismatch.offset }}</span>
            <span>地址: {{ formatHexAddress(flashVerifyReport.mismatch.address) }}</span>
            <span>
              {{ `0x${flashVerifyReport.mismatch.expected.toString(16).padStart(2, '0')}` }}
              /
              {{ `0x${flashVerifyReport.mismatch.actual.toString(16).padStart(2, '0')}` }}
            </span>
          </div>
        </div>
        <div v-if="flashError" class="text-[10px] text-red-600 dark:text-red-400 mb-1">
          {{ flashError }}
        </div>
        <div
          v-if="flashDiagnosis"
          class="mb-1 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-2 py-1.5 text-[10px]"
        >
          <div class="text-amber-700 dark:text-amber-300 mb-1">诊断: {{ flashDiagnosis.title }}</div>
          <div
            v-for="(advice, idx) in flashDiagnosis.actions"
            :key="`flash-advice-${idx}`"
            class="text-amber-600 dark:text-amber-400"
          >
            {{ idx + 1 }}. {{ advice }}
          </div>
        </div>
        <div v-if="flashHint" class="text-[10px] text-slate-500 dark:text-slate-400 mb-1">
          {{ flashHint }}
        </div>
        <div class="text-[10px] text-yellow-600 dark:text-yellow-400">
          当前为实验擦页：已支持 STM32F1 页擦除与 STM32F4 扇区擦除(0-7)。
        </div>
      </div>

      <!-- 纯 Web 调试链路自检 -->
      <div class="p-3 border-b border-slate-200 dark:border-slate-800">
        <div class="flex items-center justify-between gap-2 mb-2">
          <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400">调试链路自检</h3>
          <button
            @click="showDebugSelfCheckDetails = !showDebugSelfCheckDetails"
            class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-[10px] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronUp v-if="showDebugSelfCheckDetails" class="w-3 h-3" />
            <ChevronDown v-else class="w-3 h-3" />
            {{ showDebugSelfCheckDetails ? '收起' : '展开' }}
          </button>
        </div>

        <div class="flex items-center gap-1 flex-wrap mb-2 text-[10px]">
          <span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            {{ debugSelfCheckSummary.total }} 项
          </span>
          <span
            class="px-1.5 py-0.5 rounded"
            :class="debugSelfCheckSummary.hasWarn
              ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400'
              : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'"
          >
            告警 {{ debugSelfCheckSummary.warnCount }}
          </span>
          <span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            待完成 {{ debugSelfCheckSummary.idleCount }}
          </span>
        </div>

        <div v-if="!showDebugSelfCheckDetails && debugSelfCheckFocusItems.length > 0" class="space-y-1.5">
          <div
            v-for="item in debugSelfCheckFocusItems"
            :key="`focus-${item.label}`"
            class="flex items-center justify-between gap-2 text-[10px]"
          >
            <span class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <AlertCircle
                v-if="item.state === 'warn'"
                class="w-3 h-3 text-yellow-500 dark:text-yellow-400"
              />
              <Info
                v-else
                class="w-3 h-3 text-slate-400 dark:text-slate-500"
              />
              {{ item.label }}
            </span>
            <span
              class="truncate text-right"
              :class="item.state === 'warn'
                ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-slate-500 dark:text-slate-400'"
            >
              {{ item.detail }}
            </span>
          </div>
        </div>

        <div v-else class="space-y-1.5">
          <div
            v-for="item in webDebugSelfChecks"
            :key="item.label"
            class="flex items-center justify-between gap-2 text-[10px]"
          >
            <span class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <Check
                v-if="item.state === 'ok'"
                class="w-3 h-3 text-green-500 dark:text-green-400"
              />
              <AlertCircle
                v-else-if="item.state === 'warn'"
                class="w-3 h-3 text-yellow-500 dark:text-yellow-400"
              />
              <Info
                v-else
                class="w-3 h-3 text-slate-400 dark:text-slate-500"
              />
              {{ item.label }}
            </span>
            <span
              class="truncate text-right"
              :class="item.state === 'ok'
                ? 'text-green-600 dark:text-green-400'
                : item.state === 'warn'
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : 'text-slate-500 dark:text-slate-400'"
            >
              {{ item.detail }}
            </span>
          </div>
        </div>
      </div>

      <!-- 连接信息 -->
      <div class="p-3 mt-auto">
        <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{{ t('rtt.connectionInfo') }}</h3>
        <div class="space-y-1 text-[10px] text-slate-500 dark:text-slate-400">
          <div class="flex justify-between">
            <span>{{ t('rtt.backend') }}</span>
            <span class="text-slate-700 dark:text-slate-300">{{ backend }}</span>
          </div>
          <div class="flex justify-between">
            <span>{{ t('rtt.status') }}</span>
            <span :class="isConnected ? 'text-green-500 dark:text-green-400' : 'text-slate-400 dark:text-slate-500'">
              {{ connectionState }}
            </span>
          </div>
          <div v-if="backend === 'probe-rs'" class="flex justify-between">
            <span>{{ t('rtt.chip') }}</span>
            <span class="text-slate-700 dark:text-slate-300">{{ chipModel }}</span>
          </div>
          <div class="flex justify-between">
            <span>{{ t('rtt.channels') }}</span>
            <span class="text-slate-700 dark:text-slate-300">{{ channels.length }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
