<script setup lang="ts">
import { ref, watch, nextTick, computed, onUnmounted } from 'vue'
import { useWebUsbRtt } from '../composables/useWebUsbRtt'
import { useRttDebugWorkbench } from '../composables/useRttDebugWorkbench'
import { useI18n } from '../composables/useI18n'
import { createIdleRttHardwareCheckSteps, createMockRttHardwareCheckDefinitions, parseElfImage, parseIntelHex, parseBinaryImage, inspectGlobalVariables, createFlashDryRunReport, createFlashProgrammer, runRttHardwareChecks, serializeRttHardwareCheckReport, summarizeFlashOperationProgress, createVariableSpecsFromSymbols, summarizeVariableImage, getFlashFamilyProfile, detectFlashFamilyFromText, createUnsupportedFlashFamilyMessage, createJLinkDiagnosticReport } from '../debug-core'
import type { FlashChipFamily, FlashDryRunReport, FlashVerifyReport, RttHardwareCheckDefinition, RttHardwareCheckReport, RttHardwareCheckStep, VariableSpec, VariableValue } from '../debug-core'
import type { ProgramImage } from '../debug-core'
import { RTT_SOURCE_FILES, RTT_SOURCE_REPOSITORY_URL, downloadRttSourceFile, type RttSourceFile } from '../debug-core/rttSourceDownloads'
import { createProbeCapabilityMatrix } from '../debug-core/probeCapabilityMatrix'
import { RTT_SIDE_PANEL_TABS, type RttSidePanelTabKey } from '../debug-core/rttSidePanelTabs'
import {
  RTT_LEVEL_BG_MAP,
  RTT_LEVEL_COLOR_MAP,
  RTT_STATE_COLOR_MAP,
  rttBackendOptions,
  rttFrequencyOptions,
  rttLevelOptions,
} from '../features/rtt'
import VirtualList from '../components/VirtualList.vue'
import RttDebugControls from '../components/rtt/RttDebugControls.vue'
import RttFlashProgrammerPanel from '../components/rtt/RttFlashProgrammerPanel.vue'
import RttJLinkDiagnosticPanel from '../components/rtt/RttJLinkDiagnosticPanel.vue'
import RttWorkbenchHeader from '../components/rtt/RttWorkbenchHeader.vue'
import RttSidePanelShell from '../components/rtt/RttSidePanelShell.vue'
import RttLogFilterPanel from '../components/rtt/RttLogFilterPanel.vue'
import type { RttLogLevel, RttBackend, RttFilter } from '../types/rtt'
import {
  Send,
  RefreshCw, Download,
  AlertCircle, Terminal,
  BookOpen, Check, Info, ChevronUp, ChevronDown
} from 'lucide-vue-next'

const { t } = useI18n()

// WebUSB RTT (直接连接)
const webUsbRtt = useWebUsbRtt()

/** 当前使用的后端：产品路线转向纯浏览器调试 */
const backend = ref<RttBackend>('webusb')
/** 是否使用 WebUSB 模式 */
const isWebUsbMode = computed(() => backend.value === 'webusb')

/** 当前后端的使用条件 */
const currentBackendRequirements = computed(() => ({
  title: 'WebUSB 直连',
  requirements: [
    'Chrome/Edge 89+ 浏览器',
    'ST-Link V2 / V2-1 / V3 调试器',
    '目标程序已集成 RTT（SEGGER_RTT.c/h）',
    '目标程序正在运行',
  ],
}))


// ==================== 统一的状态接口 ====================

/** 统一的连接状态 */
const connectionState = computed(() => {
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
})

/** 是否已连接 */
const isConnected = computed(() => webUsbRtt.isConnected.value)

/** 通道列表 */
const channels = computed(() => webUsbRtt.channels.value)

/** 过滤器 */
const filter = ref<RttFilter>({
  levels: ['debug', 'info', 'warn', 'error', 'trace'],
  channels: [],
  searchText: '',
})

/** 是否暂停 */
const isPaused = computed(() => webUsbRtt.isPaused.value)

/** 自动滚动 */
const autoScroll = ref(true)

/** 错误消息 */
const errorMessage = computed(() => webUsbRtt.error.value?.message || '')

/** 日志统计 */
const logStats = computed(() => ({
  total: webUsbRtt.logs.value.length,
  errors: webUsbRtt.logs.value.filter(log => log.level === 'error').length,
  warnings: webUsbRtt.logs.value.filter(log => log.level === 'warn').length,
}))

/** 过滤后的日志 */
const filteredLogs = computed(() => {
  let logs = webUsbRtt.logs.value
  const f = filter.value

  if (f.levels.length < 5) {
    logs = logs.filter(log => f.levels.includes(log.level))
  }

  if (f.channels.length > 0) {
    logs = logs.filter(log => f.channels.includes(log.channel))
  }

  if (f.searchText.trim()) {
    const query = f.searchText.toLowerCase()
    logs = logs.filter(log => log.text.toLowerCase().includes(query))
  }

  return logs
})

watch(channels, channelList => {
  if (filter.value.channels.length === 0 && channelList.length > 0) {
    filter.value = {
      ...filter.value,
      channels: channelList.map(channel => channel.number),
    }
  }
})

// ==================== WebUSB 配置 ====================

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
const probeCapabilityMatrix = computed(() => {
  return createProbeCapabilityMatrix(webUsbRtt.probe.value?.probeType)
})
const jlinkDiagnosticReport = computed(() => createJLinkDiagnosticReport(webUsbRtt.probe.value?.probeType === 'jlink'))

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
      label: '连接路线',
      detail: '纯浏览器直连',
      state: 'ok',
    },
  ]
})
const showDebugSelfCheckDetails = ref(false)
const hardwareCheckSteps = ref<RttHardwareCheckStep[]>(createIdleRttHardwareCheckSteps())
const hardwareCheckReport = ref<RttHardwareCheckReport | null>(null)
const hardwareCheckRunning = ref(false)
const hardwareCheckError = ref('')
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
const activeRightPanelTab = ref<RttSidePanelTabKey>('diagnostics')

/** 是否显示帮助面板 */
const showHelpPanel = ref(false)
const variableElfInputRef = ref<HTMLInputElement | null>(null)
const variableElfName = ref('')
const variableProgramImage = ref<ProgramImage | null>(null)
const variableSpecs = ref<VariableSpec[]>([])
const variableValues = ref<VariableValue[]>([])
const variableError = ref('')
const variableLoading = ref(false)
const variableFilterText = ref('')
const variableAutoRefresh = ref(false)
const variableRefreshMs = ref(500)
let variableRefreshTimer: ReturnType<typeof setInterval> | null = null
const rttSourceDownloadingId = ref('')
const rttSourceDownloadMessage = ref('')
const rttSourceDownloadError = ref('')
const firmwareInputRef = ref<HTMLInputElement | null>(null)
const firmwareName = ref('')
const firmwareImage = ref<ProgramImage | null>(null)
const firmwareBaseAddressInput = ref('0x08000000')
const flashPageSizeInput = ref(2048)
const flashChipFamily = ref<FlashChipFamily>('stm32f1')
const flashStartAddressInput = ref('0x08000000')
const flashEndAddressInput = ref('0x08080000')
const detectedChipLabel = ref('')
const flashPlanSummary = ref<{ erasePages: number; programSections: number; verifyBytes: number } | null>(null)
const flashDryRunReport = ref<FlashDryRunReport | null>(null)
const flashStatus = ref<'idle' | 'planning' | 'ready' | 'programming' | 'success' | 'error'>('idle')
const flashError = ref('')
const flashProgress = ref(0)
const flashStage = ref<'idle' | 'erase' | 'program' | 'verify' | 'done'>('idle')
const flashHint = ref('')
const flashVerifyReport = ref<FlashVerifyReport | null>(null)
const flashOperationSummary = ref('')
const flashFamilyProfile = computed(() => getFlashFamilyProfile(flashChipFamily.value))
const {
  debugControlState,
  debugControlError,
  breakpointInput,
  hardwareBreakpoints,
  breakpointRestoreStatus,
  breakpointSlotStatus,
  coreRegisterItems,
  isRefreshingCoreRegisters,
  lastCoreRegisterRefreshAt,
  coreRegisterRefreshCount,
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
const currentPcValue = computed(() => coreRegisterItems.value.find(item => item.name === 'PC')?.value ?? 0)
const variableImageSummary = computed(() =>
  variableProgramImage.value ? summarizeVariableImage(variableProgramImage.value, currentPcValue.value) : null
)
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
    {
      label: '芯片族算法',
      state: flashFamilyProfile.value.stlinkEraseSupported ? 'ok' : 'warn',
      detail: flashFamilyProfile.value.stlinkEraseSupported
        ? `${flashFamilyProfile.value.label} 可执行擦除`
        : `${flashFamilyProfile.value.label} 当前仅 dry-run/规划`,
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
    const report = createFlashDryRunReport({
      regions: [region],
      sections: firmwareImage.value.sections,
    })
    items.push({
      label: '写入计划',
      state: report.plan.programSections.length > 0 && report.warnings.length === 0 ? 'ok' : 'warn',
      detail: `${report.plan.erasePages.length} 页 / ${report.plan.programSections.length} 段 / ${report.totalVerifyBytes}B`,
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

/** 当前连接状态指示灯颜色 */
const stateIndicator = computed(() => RTT_STATE_COLOR_MAP[connectionState.value] ?? 'bg-slate-400')

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

function updateHardwareCheckStep(step: RttHardwareCheckStep): void {
  hardwareCheckSteps.value = hardwareCheckSteps.value.map(item => item.key === step.key ? step : item)
}

function createRealHardwareCheckDefinitions(): RttHardwareCheckDefinition[] {
  const ramAddress = webUsbRtt.scanRange.value.start

  return [
    {
      key: 'browser',
      label: '浏览器能力',
      suggestion: '请使用 Chrome/Edge 桌面端，并通过 HTTPS 或 localhost 访问。',
      async run() {
        if (!webUsbRtt.isSupported.value) throw new Error('WebUSB 不可用')
        return 'WebUSB 可用'
      },
    },
    {
      key: 'probe',
      label: '探针识别',
      suggestion: '重新插拔探针，确认浏览器 USB 授权窗口选择了正确设备。',
      async run() {
        if (!webUsbRtt.probe.value) throw new Error('尚未授权 USB 探针')
        return `${webUsbRtt.probe.value.displayName} (${webUsbRtt.probe.value.identifier})`
      },
    },
    {
      key: 'target-id',
      label: 'DPIDR / CPUID',
      suggestion: '降低 SWD 频率，检查 SWDIO/SWCLK/NRST/GND 和目标供电。',
      async run() {
        const info = webUsbRtt.chipInfo.value || await webUsbRtt.readChipInfo()
        return `${info.name} / ${info.core}`
      },
    },
    {
      key: 'ram-read',
      label: 'RAM 读取',
      suggestion: '检查芯片是否读保护、目标是否复位保持或地址范围是否正确。',
      async run() {
        const bytes = await webUsbRtt.readMemory(ramAddress, 16)
        return `${formatHexAddress(ramAddress)} 读取 ${bytes.length} bytes`
      },
    },
    {
      key: 'ram-write',
      label: 'RAM 写回读',
      suggestion: '确认测试地址位于可写 SRAM，避免覆盖应用关键数据。',
      async run() {
        const before = await webUsbRtt.readMemory(ramAddress, 16)
        await webUsbRtt.writeMemory(ramAddress, before)
        const after = await webUsbRtt.readMemory(ramAddress, 16)
        if (before.some((byte, index) => byte !== after[index])) {
          throw new Error(`${formatHexAddress(ramAddress)} 写回读校验不一致`)
        }
        return `${formatHexAddress(ramAddress)} 写回读校验成功`
      },
    },
    {
      key: 'rtt-scan',
      label: 'RTT CB 扫描',
      suggestion: '确认固件已链接 SEGGER_RTT.c，扫描范围覆盖 RTT Control Block 所在 RAM。',
      async run() {
        if (channels.value.length === 0) throw new Error('未发现 RTT 通道')
        return `发现 ${channels.value.length} 个 RTT 通道`
      },
    },
    {
      key: 'up-channel',
      label: 'Up 通道读取',
      suggestion: '确认目标程序正在运行并持续写入 RTT 日志。',
      async run() {
        if (webUsbRtt.logs.value.length === 0) throw new Error('尚未读取到 RTT Up 日志')
        return `已读取 ${webUsbRtt.logs.value.length} 条 RTT 日志`
      },
    },
    {
      key: 'down-channel',
      label: 'Down 通道写入',
      suggestion: '确认目标固件启用了 Down buffer，并处理主机写入数据。',
      async run() {
        if (channels.value.length === 0) throw new Error('未发现 Down 通道')
        await webUsbRtt.send('qxc-self-check\n', channels.value[0]?.number ?? 0)
        return `已向 Ch${channels.value[0]?.number ?? 0} 写入自检文本`
      },
    },
  ]
}

async function runHardwareCheck(mode: 'real' | 'mock'): Promise<void> {
  hardwareCheckRunning.value = true
  hardwareCheckError.value = ''
  hardwareCheckSteps.value = createIdleRttHardwareCheckSteps()
  try {
    const definitions = mode === 'mock'
      ? createMockRttHardwareCheckDefinitions()
      : createRealHardwareCheckDefinitions()
    hardwareCheckReport.value = await runRttHardwareChecks(definitions, mode, updateHardwareCheckStep)
  } catch (error) {
    hardwareCheckError.value = error instanceof Error ? error.message : String(error)
  } finally {
    hardwareCheckRunning.value = false
  }
}

function exportHardwareCheckReport(): void {
  if (!hardwareCheckReport.value) return
  const blob = new Blob([serializeRttHardwareCheckReport(hardwareCheckReport.value)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `rtt_hardware_check_${hardwareCheckReport.value.mode}_${Date.now()}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
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

    const specs = createVariableSpecsFromSymbols(symbols, 64)

    variableProgramImage.value = image
    variableSpecs.value = specs
    variableValues.value = []
    if (specs.length === 0) {
      variableError.value = 'ELF 中未找到可读取的全局对象符号'
      return
    }

    await refreshVariableValues()
  } catch (error) {
    variableError.value = error instanceof Error ? error.message : String(error)
    variableProgramImage.value = null
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

  return { name: `${flashFamilyProfile.value.label} main flash`, start, end, pageSize }
}

function applyFlashFamilyDefaults(family: FlashChipFamily): void {
  const profile = getFlashFamilyProfile(family)
  flashChipFamily.value = family
  flashPageSizeInput.value = profile.pageSize
  flashStartAddressInput.value = formatHexAddress(profile.start)
  flashEndAddressInput.value = formatHexAddress(profile.end)
  flashHint.value = `已应用 ${profile.label} 配置：${profile.note}`
}

async function handleFirmwareSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  flashStatus.value = 'planning'
  flashError.value = ''
  firmwareName.value = file.name
  flashDryRunReport.value = null

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
    flashDryRunReport.value = null
    flashVerifyReport.value = null
    flashOperationSummary.value = ''
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
    const report = createFlashDryRunReport({
      regions: [region],
      sections: firmwareImage.value.sections,
    })
    const plan = report.plan
    flashPlanSummary.value = {
      erasePages: plan.erasePages.length,
      programSections: plan.programSections.length,
      verifyBytes: report.totalVerifyBytes,
    }
    flashStatus.value = plan.programSections.length > 0 ? 'ready' : 'error'
    flashError.value = ''
    flashProgress.value = 0
    flashStage.value = 'idle'
    flashHint.value = ''
    flashVerifyReport.value = null
    flashOperationSummary.value = ''
    flashDryRunReport.value = report
    if (plan.programSections.length === 0) {
      flashError.value = 'Dry-run 未找到可写入的固件 section'
    }
    if (report.warnings.length > 0) {
      flashHint.value = `Dry-run 警告: ${report.warnings.join(' ')}`
    }
  } catch (error) {
    flashStatus.value = 'error'
    flashError.value = error instanceof Error ? error.message : String(error)
    flashPlanSummary.value = null
    flashDryRunReport.value = null
    flashVerifyReport.value = null
    flashOperationSummary.value = ''
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
    const profile = detectFlashFamilyFromText(`${info.name} ${info.core}`)
    if (profile) {
      applyFlashFamilyDefaults(profile.family)
      flashHint.value = `已自动建议 ${profile.label} 配置。${profile.note}`
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
  flashOperationSummary.value = ''

  try {
    webUsbRtt.setFlashChipFamily(flashChipFamily.value)
    const unsupportedMessage = createUnsupportedFlashFamilyMessage(flashFamilyProfile.value)
    if (unsupportedMessage) {
      throw new Error(unsupportedMessage)
    }
    const sections = firmwareImage.value.sections
    const region = flashRegionConfig()
    const report = createFlashDryRunReport({
      regions: [region],
      sections,
    })
    flashDryRunReport.value = report
    const plan = report.plan
    if (plan.programSections.length === 0) {
      throw new Error('Dry-run 未找到可写入的固件 section')
    }
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
      const address = plan.erasePages[i]!
      flashOperationSummary.value = summarizeFlashOperationProgress({
        stage: 'erase',
        completed: i + 1,
        total: plan.erasePages.length,
        address,
      })
      await programmer.erasePages([address])
      flashProgress.value = Math.round(((i + 1) / eraseTotal) * 35)
    }

    flashStage.value = 'program'
    const sectionTotal = Math.max(plan.programSections.length, 1)
    for (let i = 0; i < plan.programSections.length; i++) {
      const section = plan.programSections[i]!
      flashOperationSummary.value = summarizeFlashOperationProgress({
        stage: 'program',
        completed: i + 1,
        total: plan.programSections.length,
        sectionName: section.name,
        bytes: section.data.length,
      })
      await programmer.programSections([section])
      flashProgress.value = 35 + Math.round(((i + 1) / sectionTotal) * 40)
    }

    flashStage.value = 'verify'
    const verifyBytes = plan.verifyRanges.reduce((sum, item) => sum + item.length, 0)
    flashOperationSummary.value = summarizeFlashOperationProgress({
      stage: 'verify',
      completed: verifyBytes,
      total: verifyBytes,
      bytes: verifyBytes,
    })
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
    flashOperationSummary.value = `完成: ${verifyReport.checkedBytes}B 已校验`
    flashHint.value = '烧录完成，建议复位后观察日志与变量区。'
    flashStatus.value = 'success'
  } catch (error) {
    flashStatus.value = 'error'
    flashError.value = error instanceof Error ? error.message : String(error)
    flashHint.value = '失败建议：检查芯片族、页大小、地址范围；必要时先手动擦除再重试。'
  }
}

watch([variableAutoRefresh, variableRefreshMs], resetVariableRefreshTimer)
watch(flashChipFamily, family => {
  const profile = getFlashFamilyProfile(family)
  flashPageSizeInput.value = profile.pageSize
  flashStartAddressInput.value = formatHexAddress(profile.start)
  flashEndAddressInput.value = formatHexAddress(profile.end)
  flashHint.value = `已切换到 ${profile.label}：${profile.note}`
})
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
  filter.value = { ...filter.value, levels }
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
  filter.value = { ...filter.value, channels: chs }
}

/**
 * 更新日志搜索文本
 */
function setSearchText(searchText: string): void {
  filter.value = { ...filter.value, searchText }
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
  }
}

/**
 * 处理断开
 */
async function handleDisconnect(): Promise<void> {
  await webUsbRtt.disconnect()
}

/**
 * 处理发送按钮点击
 */
function handleSend(): void {
  if (!sendInput.value.trim() || !isConnected.value) return

  webUsbRtt.send(sendInput.value, sendChannel.value)
  sendInput.value = ''
}

/**
 * 处理清空日志
 */
function handleClearLogs(): void {
  webUsbRtt.clearLogs()
}

/**
 * 处理暂停/恢复
 */
function handleTogglePause(): void {
  webUsbRtt.togglePause()
}

/**
 * 处理导出日志
 */
function handleExport(): void {
  const content = filteredLogs.value.map(log => {
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
  const content = JSON.stringify({
    exportTime: Date.now(),
    backend: 'webusb',
    probe: webUsbRtt.probe.value
      ? {
          displayName: webUsbRtt.probe.value.displayName,
          vendorId: webUsbRtt.probe.value.vendorId,
          productId: webUsbRtt.probe.value.productId,
          serialNumber: webUsbRtt.probe.value.serialNumber,
        }
      : null,
    scanRange: webUsbRtt.scanRange.value,
    channels: channels.value,
    filter: filter.value,
    logs: filteredLogs.value,
  }, null, 2)
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

async function handleDownloadRttSource(file: RttSourceFile): Promise<void> {
  rttSourceDownloadingId.value = file.id
  rttSourceDownloadMessage.value = ''
  rttSourceDownloadError.value = ''

  try {
    const result = await downloadRttSourceFile(file)
    rttSourceDownloadMessage.value = `已下载 ${result.fileName} (${result.bytes}B)`
  } catch (error) {
    rttSourceDownloadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    rttSourceDownloadingId.value = ''
  }
}

/**
 * 选择 WebUSB 设备
 */
async function handleSelectWebUsbDevice(): Promise<void> {
  await webUsbRtt.requestDevice()
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
  <div class="apple-workbench flex h-full min-h-0 overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
    <!-- 主内容区 -->
    <div class="flex-1 flex flex-col min-w-0 min-h-0">
      <RttWorkbenchHeader
        v-model:backend="backend"
        v-model:show-top-config-details="showTopConfigDetails"
        v-model:web-usb-protocol="webUsbProtocol"
        v-model:web-usb-frequency="webUsbFrequency"
        v-model:rtt-scan-start-input="rttScanStartInput"
        v-model:rtt-scan-end-input="rttScanEndInput"
        v-model:rtt-scan-step-input="rttScanStepInput"
        v-model:auto-scroll="autoScroll"
        v-model:show-help-panel="showHelpPanel"
        v-model:show-right-panel="showRightPanel"
        :connection-state="connectionState"
        :state-indicator="stateIndicator"
        :is-connected="isConnected"
        :is-paused="isPaused"
        :connect-btn-text="connectBtnText"
        :is-web-usb-mode="isWebUsbMode"
        :rtt-backend-options="rttBackendOptions"
        :rtt-frequency-options="rttFrequencyOptions"
        :channels-length="channels.length"
        :workbench-status-chips="workbenchStatusChips"
        :log-stats="logStats"
        :web-usb-probe-name="webUsbProbeName"
        :has-web-usb-probe="Boolean(webUsbRtt.probe.value)"
        :web-usb-supported="webUsbRtt.isSupported.value"
        :web-usb-scan-range-error="webUsbScanRangeError"
        :error-message="errorMessage"
        :t="t"
        @connect-toggle="handleConnectToggle"
        @toggle-pause="handleTogglePause"
        @select-web-usb-device="handleSelectWebUsbDevice"
        @apply-web-usb-scan-range="applyWebUsbScanRange"
        @clear-logs="handleClearLogs"
        @export-logs="handleExport"
        @clear-error="webUsbRtt.clearError()"
      />
      <!-- 主内容区域 -->
      <div class="flex-1 flex min-h-0 min-w-0 overflow-hidden gap-2 p-2">
        <!-- 日志区域 -->
        <div class="apple-content flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
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
                  :class="RTT_LEVEL_BG_MAP[(item as any).level]"
                >
                  <!-- 时间戳 -->
                  <span class="text-slate-400 dark:text-slate-500 w-20 shrink-0 select-none">
                    {{ formatTimestamp((item as any).timestamp) }}
                  </span>

                  <!-- 级别标签 -->
                  <span
                    class="w-12 shrink-0 font-semibold select-none"
                    :class="RTT_LEVEL_COLOR_MAP[(item as any).level]"
                  >
                    {{ (item as any).level.toUpperCase() }}
                  </span>

                  <!-- 通道标签 -->
                  <span class="text-slate-400 dark:text-slate-500 w-10 shrink-0 select-none">
                    Ch{{ (item as any).channel }}
                  </span>

                  <!-- 日志内容 -->
                  <span class="flex-1 min-w-0 truncate" :class="RTT_LEVEL_COLOR_MAP[(item as any).level]">
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
          <div class="apple-toolbar shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white/85 dark:bg-slate-900/85 px-4 py-2">
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
          class="apple-inspector w-96 shrink-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 min-h-0 overflow-y-auto"
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

                <div class="p-3 mb-4 rounded-lg border-2 border-green-500 bg-green-50 dark:bg-green-900/30 shadow-md">
                  <div class="flex items-center gap-2 mb-1">
                    <Zap class="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span class="font-bold text-green-700 dark:text-green-300">WebUSB 纯浏览器直连</span>
                  </div>
                  <p class="text-[10px] text-slate-500 dark:text-slate-400">无需本地服务、脚本或桌面代理。</p>
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
                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <div class="font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                      <span class="text-red-500">❌</span> 未找到 RTT 控制块
                    </div>
                    <div class="text-slate-500 dark:text-slate-400 text-[10px] mb-2">无法在目标内存中定位 RTT 控制块</div>
                    <div class="p-2 bg-green-50 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300 text-[10px]">
                      <strong>✅ 解决：</strong>确保目标程序已正确初始化 RTT，且正在运行
                    </div>
                  </div>

                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <div class="font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                      <span class="text-red-500">❌</span> WebUSB 授权失败
                    </div>
                    <div class="text-slate-500 dark:text-slate-400 text-[10px] mb-2">浏览器无法访问 USB 设备</div>
                    <div class="p-2 bg-green-50 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300 text-[10px]">
                      <strong>✅ 解决：</strong>使用 HTTPS 或 localhost，并允许浏览器访问 USB 设备
                    </div>
                  </div>

                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <div class="font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                      <span class="text-red-500">❌</span> 探针连接失败
                    </div>
                    <div class="text-slate-500 dark:text-slate-400 text-[10px] mb-2">无法连接到调试探针</div>
                    <div class="p-2 bg-green-50 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300 text-[10px]">
                      <strong>✅ 解决：</strong>检查 USB 连接、驱动程序安装，确认探针型号支持
                    </div>
                  </div>

                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <div class="font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                      <span class="text-red-500">❌</span> 固件文件无效
                    </div>
                    <div class="text-slate-500 dark:text-slate-400 text-[10px] mb-2">导入的 BIN/HEX/ELF 文件无法解析或地址范围不匹配</div>
                    <div class="p-2 bg-green-50 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300 text-[10px]">
                      <strong>✅ 解决：</strong>重新选择固件，并核对 Flash 起始地址、结束地址和页大小
                    </div>
                  </div>
                </div>
              </div>

              <!-- 相关链接 -->
              <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <h4 class="font-bold text-slate-700 dark:text-slate-300 mb-2 text-sm">🔗 相关链接</h4>
                <div class="space-y-1.5">
                  <a href="https://kb.segger.com/RTT" target="_blank" class="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 hover:underline">
                    <span>📚</span> SEGGER RTT 官方文档
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧工具栏 -->
    <RttSidePanelShell
      v-model:active-tab="activeRightPanelTab"
      :visible="showRightPanel"
      :tabs="RTT_SIDE_PANEL_TABS"
    >

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

      <RttLogFilterPanel
        v-show="activeRightPanelTab === 'diagnostics'"
        :search-text="filter.searchText"
        :selected-levels="filter.levels"
        :selected-channels="filter.channels"
        :channels="channels"
        :level-options="rttLevelOptions"
        :level-bg-map="RTT_LEVEL_BG_MAP"
        :t="t"
        @update:search-text="setSearchText"
        @toggle-level="toggleLevelFilter"
        @toggle-channel="toggleChannelFilter"
      />

      <!-- SEGGER RTT 库文件下载 -->
      <div v-show="activeRightPanelTab === 'resources'" class="p-3 border-b border-slate-200 dark:border-slate-800">
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="min-w-0">
            <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400">RTT 库文件</h3>
            <p class="text-[10px] text-slate-400 dark:text-slate-500 truncate">
              从 SEGGER 官方 GitHub 获取，不随本站打包分发
            </p>
          </div>
          <a
            :href="RTT_SOURCE_REPOSITORY_URL"
            target="_blank"
            rel="noopener noreferrer"
            class="shrink-0 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
          >
            官方仓库
          </a>
        </div>

        <div class="space-y-1.5">
          <button
            v-for="file in RTT_SOURCE_FILES"
            :key="file.id"
            @click="handleDownloadRttSource(file)"
            :disabled="Boolean(rttSourceDownloadingId)"
            class="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-left text-[10px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            :title="file.description"
          >
            <span class="min-w-0">
              <span class="block truncate font-mono text-slate-700 dark:text-slate-200">{{ file.fileName }}</span>
              <span class="block truncate text-slate-400 dark:text-slate-500">{{ file.path }}</span>
            </span>
            <RefreshCw
              v-if="rttSourceDownloadingId === file.id"
              class="w-3.5 h-3.5 shrink-0 animate-spin text-blue-500"
            />
            <Download v-else class="w-3.5 h-3.5 shrink-0 text-slate-400" />
          </button>
        </div>

        <p class="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
          集成：把以上文件加入 MCU 工程，业务代码包含 <span class="font-mono">SEGGER_RTT.h</span>，调用 <span class="font-mono">SEGGER_RTT_WriteString()</span> 或 <span class="font-mono">SEGGER_RTT_printf()</span>。
        </p>
        <p v-if="rttSourceDownloadMessage" class="mt-1 text-[10px] text-green-600 dark:text-green-400">
          {{ rttSourceDownloadMessage }}
        </p>
        <p v-if="rttSourceDownloadError" class="mt-1 text-[10px] text-red-600 dark:text-red-400 break-words">
          {{ rttSourceDownloadError }}
        </p>
      </div>

      <RttJLinkDiagnosticPanel
        v-show="activeRightPanelTab === 'resources'"
        :report="jlinkDiagnosticReport"
      />

      <!-- 导出选项 -->
      <div v-show="activeRightPanelTab === 'resources'" class="p-3 border-b border-slate-200 dark:border-slate-800">
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
        v-show="activeRightPanelTab === 'diagnostics'"
        :is-connected="isConnected"
        :debug-control-state="debugControlState"
        :debug-control-error="debugControlError"
        v-model:breakpoint-input="breakpointInput"
        :hardware-breakpoints="hardwareBreakpoints"
        :breakpoint-restore-status="breakpointRestoreStatus"
        :breakpoint-slot-status="breakpointSlotStatus"
        :core-register-items="coreRegisterItems"
        :is-refreshing-core-registers="isRefreshingCoreRegisters"
        :last-core-register-refresh-at="lastCoreRegisterRefreshAt"
        :core-register-refresh-count="coreRegisterRefreshCount"
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
      <div v-show="activeRightPanelTab === 'variables'" class="p-3 border-b border-slate-200 dark:border-slate-800">
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
        <p class="text-[10px] text-slate-400 dark:text-slate-500 mb-1">
          {{ variableSpecs.length }} 个变量 / {{ filteredVariableValues.length }} 条显示
          <template v-if="variableImageSummary">
            · 函数 {{ variableImageSummary.functionSymbols }} · 对象 {{ variableImageSummary.objectSymbols }}
          </template>
        </p>
        <div v-if="variableImageSummary" class="mb-2 grid grid-cols-2 gap-1 text-[10px] text-slate-500 dark:text-slate-400">
          <div class="rounded border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900">
            PC 函数：
            <span class="font-mono text-slate-700 dark:text-slate-200">
              {{ variableImageSummary.currentFunction?.name ?? '-' }}
            </span>
          </div>
          <div class="rounded border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900">
            primitive {{ variableImageSummary.readableVariables }} / best-effort {{ variableImageSummary.bestEffortVariables }}
          </div>
        </div>

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
            <span class="truncate text-slate-600 dark:text-slate-300" :title="item.note ? `${item.name}: ${item.note}` : item.name">
              {{ item.name }}({{ item.type }})
              <span v-if="item.displayKind && item.displayKind !== 'primitive'" class="text-[9px] text-amber-600 dark:text-amber-300">
                {{ item.displayKind }}
              </span>
            </span>
            <span class="text-slate-500 dark:text-slate-400">{{ formatVariableAddress(item.address) }}</span>
            <span v-if="item.error" class="text-red-500 dark:text-red-400 truncate text-right" :title="item.error">ERR</span>
            <span v-else class="text-slate-500 dark:text-slate-400 text-right" :title="formatVariableValue(item)">{{ formatVariableValue(item) }}</span>
          </div>
        </div>
      </div>

      <RttFlashProgrammerPanel
        v-show="activeRightPanelTab === 'flash'"
        v-model:firmware-base-address-input="firmwareBaseAddressInput"
        v-model:flash-page-size-input="flashPageSizeInput"
        v-model:flash-chip-family="flashChipFamily"
        v-model:flash-start-address-input="flashStartAddressInput"
        v-model:flash-end-address-input="flashEndAddressInput"
        :firmware-name="firmwareName"
        :has-firmware-image="Boolean(firmwareImage)"
        :flash-precheck-items="flashPrecheckItems"
        :flash-status="flashStatus"
        :is-connected="isConnected"
        :detected-chip-label="detectedChipLabel"
        :flash-plan-summary="flashPlanSummary"
        :flash-dry-run-report="flashDryRunReport"
        :flash-stage="flashStage"
        :flash-progress="flashProgress"
        :flash-operation-summary="flashOperationSummary"
        :flash-verify-report="flashVerifyReport"
        :flash-error="flashError"
        :flash-diagnosis="flashDiagnosis"
        :flash-hint="flashHint"
        :format-hex-address="formatHexAddress"
        @open-firmware-picker="openFirmwarePicker"
        @plan-firmware-programming="planFirmwareProgramming"
        @program-firmware="programFirmware"
        @detect-flash-chip-family="detectFlashChipFamily"
      />

      <!-- 纯 Web 调试链路自检 -->
      <div v-show="activeRightPanelTab === 'diagnostics'" class="p-3 border-b border-slate-200 dark:border-slate-800">
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
            :class="probeCapabilityMatrix.summary.tone === 'ok'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
              : probeCapabilityMatrix.summary.tone === 'warn'
                ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'"
          >
            {{ probeCapabilityMatrix.summary.label }}
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

        <div
          v-if="probeCapabilityMatrix.warning"
          class="mb-2 rounded-lg border border-yellow-200 bg-yellow-50 px-2 py-1.5 text-[10px] text-yellow-700 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300"
        >
          {{ probeCapabilityMatrix.warning }}
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
          <div class="rounded-lg border border-slate-200 dark:border-slate-800 p-2">
            <div class="flex items-center justify-between gap-2 text-[10px]">
              <span class="font-medium text-slate-600 dark:text-slate-300">探针能力矩阵</span>
              <span
                class="truncate text-right"
                :class="probeCapabilityMatrix.summary.tone === 'ok'
                  ? 'text-green-600 dark:text-green-400'
                  : probeCapabilityMatrix.summary.tone === 'warn'
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-slate-500 dark:text-slate-400'"
              >
                {{ probeCapabilityMatrix.summary.detail }}
              </span>
            </div>
            <div class="mt-2 grid grid-cols-2 gap-1">
              <div
                v-for="capability in probeCapabilityMatrix.capabilities"
                :key="capability.key"
                class="rounded border px-1.5 py-1"
                :class="capability.state === 'ok'
                  ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-900/20 dark:text-green-300'
                  : capability.state === 'warn'
                    ? 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-300'
                    : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400'"
                :title="capability.detail"
              >
                <div class="flex items-center justify-between gap-1 text-[10px]">
                  <span>{{ capability.label }}</span>
                  <span class="uppercase">{{ capability.state }}</span>
                </div>
                <div class="mt-0.5 truncate text-[9px] opacity-80">{{ capability.detail }}</div>
              </div>
            </div>
          </div>

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

      <!-- 硬件验收向导 -->
      <div v-show="activeRightPanelTab === 'diagnostics'" class="p-3 border-b border-slate-200 dark:border-slate-800">
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="min-w-0">
            <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400">硬件验收向导</h3>
            <p class="text-[10px] text-slate-400 dark:text-slate-500">浏览器 → 探针 → 目标 → RAM → RTT 通道</p>
          </div>
          <span
            v-if="hardwareCheckReport"
            class="shrink-0 rounded px-1.5 py-0.5 text-[10px]"
            :class="hardwareCheckReport.summary.failed === 0
              ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
              : 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400'"
          >
            {{ hardwareCheckReport.summary.passed }}/{{ hardwareCheckReport.steps.length }}
          </span>
        </div>

        <div class="grid grid-cols-3 gap-1.5 mb-2">
          <button
            @click="runHardwareCheck('real')"
            :disabled="hardwareCheckRunning"
            class="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300"
          >
            真实自检
          </button>
          <button
            @click="runHardwareCheck('mock')"
            :disabled="hardwareCheckRunning"
            class="rounded border border-slate-300 px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Mock 预演
          </button>
          <button
            @click="exportHardwareCheckReport"
            :disabled="!hardwareCheckReport"
            class="rounded border border-slate-300 px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            导出报告
          </button>
        </div>

        <div v-if="hardwareCheckError" class="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {{ hardwareCheckError }}
        </div>

        <div class="space-y-1.5">
          <div
            v-for="step in hardwareCheckSteps"
            :key="step.key"
            class="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] dark:border-slate-800 dark:bg-slate-950/50"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium text-slate-600 dark:text-slate-300">{{ step.label }}</span>
              <span
                class="rounded px-1.5 py-0.5"
                :class="{
                  'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400': step.status === 'idle' || step.status === 'skip',
                  'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300': step.status === 'running',
                  'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400': step.status === 'pass',
                  'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400': step.status === 'fail',
                }"
              >
                {{ step.status }}
              </span>
            </div>
            <div class="mt-1 truncate text-slate-500 dark:text-slate-400" :title="step.detail">{{ step.detail }}</div>
            <div v-if="step.status === 'fail'" class="mt-1 text-yellow-600 dark:text-yellow-400">{{ step.suggestion }}</div>
          </div>
        </div>
      </div>

      <!-- 连接信息 -->
      <div v-show="activeRightPanelTab === 'diagnostics'" class="p-3 mt-auto">
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
          <div class="flex justify-between">
            <span>{{ t('rtt.channels') }}</span>
            <span class="text-slate-700 dark:text-slate-300">{{ channels.length }}</span>
          </div>
        </div>
      </div>
    </RttSidePanelShell>
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

