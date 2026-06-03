<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted, computed, shallowRef } from 'vue'
import { useSerial } from '../composables/useSerial'
import { useCommandGroup } from '../composables/useCommandGroup'
import { useSettingsStore } from '../stores/settings'
import { useI18n } from '../composables/useI18n'
import { useDataParse } from '../composables/useDataParse'
import type { CommandStatus } from '../types/command-group'
import {
  baudRatePresets,
  createLineEndingOptions,
  formatSerialDuration,
  createSerialSessionSnapshot,
  previewLineEndingValue,
  resolveLineEndingValue,
  summarizeSerialSession,
  useSerialMultiSession,
  useSerialReplay,
  useQuickCommands,
  useSerialParsePanel,
} from '../features/serial'
import SerialParseResultsPanel from '../components/serial/SerialParseResultsPanel.vue'
import SerialSendPanel from '../components/serial/SerialSendPanel.vue'
import SerialLogPanel from '../components/serial/SerialLogPanel.vue'
import SerialMiddleToolbar from '../components/serial/SerialMiddleToolbar.vue'
import SerialTopToolbar from '../components/serial/SerialTopToolbar.vue'
import SerialConnectionDrawer from '../components/serial/SerialConnectionDrawer.vue'
import SerialQuickCommandPanel from '../components/serial/SerialQuickCommandPanel.vue'
import SerialCommandGroupPanel from '../components/serial/SerialCommandGroupPanel.vue'
import { 
  matchesShortcutFast, 
  preparseShortcuts,
  rafThrottle,
  debounce 
} from '../utils/performance'
import { keyResponseTimer, measureSync } from '../composables/usePerformanceMonitor'
import { 
  BatchDOMUpdater
} from '../composables/useButtonOptimizer'
import { 
  Play,
  ListOrdered, Save,
  ChevronRight, Clock, AlertCircle, CheckCircle2, XCircle, Loader2,
  RefreshCw, Keyboard
} from 'lucide-vue-next'

const settingsStore = useSettingsStore()
const { t } = useI18n()
const dataParse = useDataParse()

const { 
  isSupported, 
  isConnected, 
  baudRate, 
  dataBits, 
  stopBits, 
  parity, 
  receivedData, 
  txBytes,
  rxBytes,
  showTimestamp,
  receiveEncoding,
  sendEncoding,
  isReconnecting,
  reconnectAttempts,
  dataCount,
  canReconnect,
  connect, 
  disconnect, 
  reconnect,
  send, 
  clearData,
  exportData,
  redecodeAllData,
  onDataReceive
} = useSerial()

// Layout & View states - 从 store 获取持久化状态
const activeTab = ref<'serial'|'bluetooth'>('serial')
const activeRightTab = ref<'quick'|'group'>('quick')
const virtualListRef = ref<InstanceType<typeof SerialLogPanel> | null>(null)

/** 搜索关键词 */
const searchQuery = ref('')

/** 防抖后的搜索关键词 */
const debouncedSearchQuery = ref('')

/** 防抖搜索处理函数 */
const debouncedSearch = debounce((value: string) => {
  debouncedSearchQuery.value = value
}, 150)

/** 监听搜索关键词变化 */
watch(searchQuery, (value) => {
  debouncedSearch(value)
})

/** 根据显示模式和搜索关键词过滤接收数据（优化版） */
const filteredReceivedData = computed(() => {
  const data = activeSessionLogs.value
  const mode = displayMode.value
  const query = debouncedSearchQuery.value.toLowerCase().trim()
  const hasSearch = query.length > 0
  const isRxMode = mode === 'rx'
  const isTxMode = mode === 'tx'
  
  if (!isRxMode && !isTxMode && !hasSearch) {
    return data
  }
  
  return data.filter(item => {
    if (isRxMode && item.direction !== 'rx') return false
    if (isTxMode && item.direction !== 'tx') return false
    if (hasSearch && !item.data.toLowerCase().includes(query)) return false
    return true
  })
})

/** 处理虚拟滚动事件（使用 raf 节流） */
const handleVirtualScroll = rafThrottle((_scrollTop: number) => {
  // 滚动相关逻辑
})

// 从 store 获取持久化的 UI 状态
const displayMode = computed({
  get: () => settingsStore.config.uiSettings.displayMode,
  set: (val) => { settingsStore.config.uiSettings.displayMode = val }
})
const autoScroll = computed({
  get: () => settingsStore.config.uiSettings.autoScroll,
  set: (val) => { settingsStore.config.uiSettings.autoScroll = val }
})
const showLeftPanel = computed({
  get: () => settingsStore.config.uiSettings.showLeftPanel,
  set: (val) => { settingsStore.config.uiSettings.showLeftPanel = val }
})
const showRightPanel = computed({
  get: () => settingsStore.config.uiSettings.showRightPanel,
  set: (val) => { settingsStore.config.uiSettings.showRightPanel = val }
})
const showBottomPanel = computed({
  get: () => settingsStore.config.uiSettings.showBottomPanel,
  set: (val) => { settingsStore.config.uiSettings.showBottomPanel = val }
})
const connectionSummary = computed(() => {
  if (isReconnecting.value) {
    return `${t('serial.reconnecting')} ${reconnectAttempts.value}/5`
  }
  if (isConnected.value) {
    return `${baudRate.value} bps · ${dataBits.value}${t('serial.dataBitsUnit')} · ${parity.value} · ${stopBits.value}${t('serial.stopBitsUnit')}`
  }
  if (canReconnect.value) {
    return t('serial.enablePort')
  }
  return t('serial.waitingConnect')
})
const serialDiagnosticNow = ref(Date.now())
let serialDiagnosticTimer: ReturnType<typeof setInterval> | null = null
const serialSessionDiagnostics = computed(() => summarizeSerialSession(activeSessionLogs.value, serialDiagnosticNow.value))
const serialResponseState = computed(() => {
  if (serialSessionDiagnostics.value.txEntries === 0) return '等待发送'
  return serialSessionDiagnostics.value.receiveAfterLastTx ? '最近有响应' : '等待响应'
})
const toolbarExpanded = computed({
  get: () => settingsStore.config.uiSettings.toolbarExpanded,
  set: (val) => { settingsStore.config.uiSettings.toolbarExpanded = val }
})
const {
  serialSessionController,
  serialSessions,
  activeSerialSessionId,
  activeSerialSession,
  activeRuntime,
  activeSessionLogs,
  isActiveSessionConnected,
  addSerialSessionSlot,
  removeSerialSessionSlot,
  setActiveSerialSession,
  connectActiveSerialSession,
  disconnectActiveSerialSession,
  sendActiveSerialSession,
  clearActiveSessionLogs,
} = useSerialMultiSession({
  defaultLogs: receivedData,
  txBytes,
  rxBytes,
  dataCount,
  isConnected,
  serialOptions: () => ({
    baudRate: baudRate.value,
    dataBits: dataBits.value as 7 | 8,
    stopBits: stopBits.value as 1 | 2,
    parity: parity.value as 'none' | 'even' | 'odd',
  }),
  showToast: message => settingsStore.showToast(message),
})
const activeDataCount = computed(() => activeSessionLogs.value.length)
const activeConnectionSummary = computed(() => {
  if (!activeRuntime.value) return connectionSummary.value
  if (activeRuntime.value.state.isConnected) return activeRuntime.value.state.connectionLabel
  return t('serial.waitingConnect')
})

function clearActiveSerialData(): void {
  if (activeRuntime.value) {
    clearActiveSessionLogs()
    return
  }
  clearData()
}

function exportActiveSerialData(): void {
  if (!activeRuntime.value) {
    exportData()
    return
  }
  const dataArray = activeSessionLogs.value
  if (!dataArray.length) return
  const logContent = dataArray.map(item => {
    const direction = item.direction === 'rx' ? 'RX' : 'TX'
    return `[${formatTimestamp(item.timestamp)}] ${direction}: ${item.data}`
  }).join('\n')
  const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `serial_session_${activeSerialSessionId.value}_${Date.now()}.txt`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ==================== 数据解析功能 ====================

const {
  parseMode,
  parseEnabled,
  showParsePanel,
  customProtocolConfig,
  lengthFieldEnabled,
  parseResultExpanded,
  initCustomProtocolConfig,
  toggleParseResultExpand,
  handleClearParseResults,
  handleExportParseResults,
  formatBytes,
} = useSerialParsePanel({
  settings: settingsStore,
  dataParse,
  baudRate,
  t,
})

/**
 * 监听接收编码变化，重新解码所有数据
 */
watch(receiveEncoding, () => {
  redecodeAllData()
})

/**
 * 指令组 composable 实例，管理指令组的完整生命周期
 */
const cg = useCommandGroup()

/**
 * 指令组执行状态对应的图标和颜色映射
 */
const statusIconMap: Record<CommandStatus, { icon: any; color: string; labelKey: string }> = {
  pending: { icon: Clock, color: 'text-slate-400', labelKey: 'serial.statusPending' },
  running: { icon: Loader2, color: 'text-blue-500 animate-spin', labelKey: 'serial.statusRunning' },
  success: { icon: CheckCircle2, color: 'text-green-500', labelKey: 'serial.statusSuccess' },
  failed: { icon: XCircle, color: 'text-red-500', labelKey: 'serial.statusFailed' },
  timeout: { icon: AlertCircle, color: 'text-amber-500', labelKey: 'serial.statusTimeout' },
  skipped: { icon: ChevronRight, color: 'text-slate-400', labelKey: 'serial.statusSkipped' }
}

function encodeActiveSessionPayload(data: string, isHex: boolean): Uint8Array {
  if (isHex) {
    const hexData = data.replace(/\s+/g, '')
    const bytes = new Uint8Array(Math.ceil(hexData.length / 2))
    for (let i = 0; i < bytes.length; i++) {
      const value = parseInt(hexData.slice(i * 2, i * 2 + 2), 16)
      bytes[i] = Number.isNaN(value) ? 0 : value
    }
    return bytes
  }
  if (sendEncoding.value === 'ascii') {
    const bytes = new Uint8Array(data.length)
    for (let i = 0; i < data.length; i++) {
      bytes[i] = data.charCodeAt(i) & 0x7F
    }
    return bytes
  }
  return new TextEncoder().encode(data)
}

async function sendViaActiveSession(data: string, isHex = false): Promise<void> {
  if (!activeRuntime.value) {
    await send(data, isHex)
    return
  }
  await sendActiveSerialSession(encodeActiveSessionPayload(data, isHex))
}

async function toggleActiveSessionConnection(): Promise<void> {
  if (!activeRuntime.value) {
    if (isConnected.value) {
      await disconnect()
      if (isLooping.value) toggleLoopSend()
    } else if (canReconnect.value) {
      await reconnect()
    } else {
      await connect()
    }
    return
  }

  if (activeRuntime.value.state.isConnected) {
    await disconnectActiveSerialSession()
  } else {
    await connectActiveSerialSession()
  }
}

/**
 * 执行指令组（将串口发送函数传入）
 */
async function executeCommandGroup() {
  if (!isActiveSessionConnected.value) return
  await cg.executeGroup(async (data, isHex) => {
    await sendViaActiveSession(data, isHex)
  })
}

/**
 * 获取指定指令的执行状态显示信息
 */
function getCmdStatusInfo(cmdId: number) {
  const status = cg.commandStatusMap.value[cmdId]
  if (!status) return null
  return statusIconMap[status] ?? null
}

/** 是否展示已保存的指令组加载列表 */
const showGroupLoader = ref(false)

/** 是否展开执行日志面板 */
const showExecLog = ref(false)
const executionLogPreviewLimit = 120
const recentExecutionLogs = computed(() =>
  (cg.executionLogs.value || []).slice(-executionLogPreviewLimit).reverse()
)

/** 保存确认对话框状态 */
const showSaveConfirm = ref(false)

/** 另存为对话框状态 */
const showSaveAsDialog = ref(false)

/** 另存为输入的新名称 */
const saveAsName = ref('')

/**
 * 处理保存按钮点击
 */
function handleSaveClick() {
  if (cg.isExistingGroup()) {
    showSaveConfirm.value = true
  } else {
    doSave()
  }
}

/**
 * 执行保存操作
 */
function doSave() {
  const result = cg.saveCurrentGroup()
  if (result.success) {
    settingsStore.showToast(t('serial.saveSuccess'))
  } else if (result.error) {
    settingsStore.showToast(result.error)
  }
  showSaveConfirm.value = false
}

/**
 * 打开另存为对话框
 */
function openSaveAsDialog() {
  saveAsName.value = cg.activeGroup.value.name
  showSaveAsDialog.value = true
  showSaveConfirm.value = false
}

/**
 * 执行另存为操作
 */
function doSaveAs() {
  const result = cg.saveAsGroup(saveAsName.value)
  if (result.success) {
    settingsStore.showToast(t('serial.saveAsSuccess'))
  } else if (result.error) {
    settingsStore.showToast(result.error)
  }
  showSaveAsDialog.value = false
}

/**
 * 加载指令组并显示提示
 */
function handleLoadGroup(groupId: string) {
  const result = cg.loadGroup(groupId)
  if (result.success) {
    settingsStore.showToast(t('serial.loadSuccess'))
    showGroupLoader.value = false
  } else if (result.error) {
    settingsStore.showToast(result.error)
  }
}

// Format timestamp
const formatTimestamp = (timestamp: number) => {
  const date = new Date(timestamp)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`
}

// Send Panel states
const sendInput = ref('')
const isHexSend = ref(false)

/** 行尾配置（从 store 获取持久化状态） */
const lineEndingConfig = computed({
  get: () => settingsStore.config.lineEnding,
  set: (val) => { settingsStore.config.lineEnding = val }
})

/** 行尾类型选项 */
const lineEndingOptions = computed(() => createLineEndingOptions(t))

/**
 * 获取当前行尾字符的实际值
 * @returns 行尾字符字符串
 */
function getLineEndingValue(): string {
  return resolveLineEndingValue(lineEndingConfig.value)
}

/**
 * 获取行尾字符的预览文本
 * @returns 预览字符串
 */
function getLineEndingPreview(): string {
  const config = lineEndingConfig.value
  if (!config.enabled) return ''
  if (config.type === 'custom' && config.customValue.trim()) {
    return config.customValue.trim()
  }
  return previewLineEndingValue(getLineEndingValue())
}

/** 发送数据预览（含行尾字符） */
const sendPreview = computed(() => {
  if (!sendInput.value) return ''
  const ending = getLineEndingPreview()
  if (!ending) return sendInput.value
  return sendInput.value + ' ' + ending
})

const {
  isRecordingSession,
  recordedReplayEvents,
  loadedSessionRecording,
  replayMode,
  replaySpeed,
  isReplayingSession,
  replayCursor,
  simulatedReplayEvents,
  replayEventsForMode,
  canStartSessionReplay,
  recordSerialSessionEvent,
  startSessionRecording,
  stopSessionRecording,
  exportSessionRecording,
  handleSessionReplayFileSelected,
  startSessionReplay,
  stopSessionReplay,
} = useSerialReplay({
  send: sendViaActiveSession,
  isConnected: isActiveSessionConnected,
  createSnapshot: () => createSerialSessionSnapshot({
    baudRate: baudRate.value,
    dataBits: dataBits.value,
    stopBits: stopBits.value,
    parity: parity.value,
    receiveEncoding: receiveEncoding.value,
    sendEncoding: sendEncoding.value,
    lineEnding: lineEndingConfig.value.enabled ? lineEndingConfig.value.type : 'none',
  }),
  showToast: message => settingsStore.showToast(message),
})
const {
  protocolTemplates,
  quickCommands,
  selectedProtocolTemplateId,
  protocolTemplateHint,
  loopInterval,
  isLooping,
  isSendingQuickCommands,
  enabledQuickCommands,
  hasRunnableQuickCommands,
  selectedProtocolTemplate,
  addCommand,
  deleteCommand,
  sendCommand,
  sendSelected,
  applySelectedProtocolTemplate,
  toggleLoopSend,
  cleanupQuickCommands,
} = useQuickCommands({
  send: sendViaActiveSession,
  isConnected: isActiveSessionConnected,
  showToast: message => settingsStore.showToast(message),
  measureSync,
})

/**
 * 是否使用自定义波特率输入模式
 */
const isCustomBaudRate = ref(false)

/**
 * 手动输入的波特率值
 */
const customBaudRateInput = ref('')

// Watchers & Handlers
watch(activeSessionLogs, async () => {
  if (autoScroll.value && virtualListRef.value) {
    await nextTick()
    virtualListRef.value.scrollToBottom()
  }
})

const handleSend = () => {
  if (sendInput.value.trim() === '') return
  
  if (!isActiveSessionConnected.value) {
    settingsStore.showToast(t('serial.notConnected'))
    return
  }
  
  let data = sendInput.value
  
  if (isHexSend.value) {
    const hexData = data.replace(/\s+/g, '')
    if (!/^[0-9A-Fa-f]*$/.test(hexData)) {
      settingsStore.showToast(t('serial.invalidHex'))
      return
    }
  }
  
  if (!isHexSend.value) {
    const ending = getLineEndingValue()
    if (ending) data += ending
  }
  
  try {
    void sendViaActiveSession(data, isHexSend.value)
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : '发送失败'
    settingsStore.showToast(t('serial.sendFailed') + ': ' + errorMsg)
  }
}

// ==================== 快捷键系统 ====================

/** 是否显示快捷键帮助面板 */
const showShortcutsHelp = ref(false)

/** 缓存的快捷键解析结果 */
const cachedShortcuts = shallowRef<Record<string, { ctrl: boolean; shift: boolean; alt: boolean; key: string }>>({})

/** 监听快捷键配置变化，更新缓存 */
watch(
  () => settingsStore.config.shortcutSettings,
  (newSettings) => {
    cachedShortcuts.value = preparseShortcuts(newSettings)
  },
  { immediate: true, deep: true }
)

/** 快捷键映射表 */
const shortcuts = computed(() => {
  const settings = settingsStore.config.shortcutSettings
  return [
    { key: settings.send, descriptionKey: 'serial.shortcutSend', action: 'send' },
    { key: settings.toggleConnect, descriptionKey: 'serial.shortcutConnect', action: 'connect' },
    { key: settings.clearData, descriptionKey: 'serial.shortcutClear', action: 'clearRx' },
    { key: settings.saveGroup, descriptionKey: 'serial.shortcutSave', action: 'saveGroup' },
    { key: settings.toggleExecution, descriptionKey: 'serial.shortcutPause', action: 'pauseResume' },
    { key: settings.stopExecution, descriptionKey: 'serial.shortcutStop', action: 'stopGroup' },
    { key: settings.showHelp, descriptionKey: 'serial.shortcutShowHelp', action: 'help' },
  ]
})

/** 输入元素标签名集合 */
const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/**
 * 处理键盘快捷键（优化版）
 */
function handleKeyboardShortcuts(event: KeyboardEvent) {
  keyResponseTimer.start()
  
  const activeTag = (document.activeElement as HTMLElement)?.tagName
  const isInputFocused = activeTag ? INPUT_TAGS.has(activeTag) : false
  const cached = cachedShortcuts.value
  
  if (matchesShortcutFast(event, cached.send)) {
    event.preventDefault()
    handleSend()
    keyResponseTimer.end()
    return
  }
  
  if (matchesShortcutFast(event, cached.toggleConnect)) {
    event.preventDefault()
    toggleConnect()
    keyResponseTimer.end()
    return
  }
  
  if (matchesShortcutFast(event, cached.clearData)) {
    event.preventDefault()
    clearActiveSerialData()
    keyResponseTimer.end()
    return
  }
  
  if (matchesShortcutFast(event, cached.saveGroup)) {
    event.preventDefault()
    cg.saveCurrentGroup()
    keyResponseTimer.end()
    return
  }
  
  if (matchesShortcutFast(event, cached.toggleExecution) && !isInputFocused) {
    event.preventDefault()
    if (cg.executionState.value === 'running') {
      cg.pauseExecution()
    } else if (cg.executionState.value === 'paused') {
      executeCommandGroup()
    }
    keyResponseTimer.end()
    return
  }
  
  if (matchesShortcutFast(event, cached.stopExecution)) {
    if (showShortcutsHelp.value) {
      showShortcutsHelp.value = false
    } else if (cg.executionState.value === 'running' || cg.executionState.value === 'paused') {
      cg.stopExecution()
    }
    keyResponseTimer.end()
    return
  }
  
  if (matchesShortcutFast(event, cached.showHelp) && !isInputFocused) {
    event.preventDefault()
    showShortcutsHelp.value = !showShortcutsHelp.value
    keyResponseTimer.end()
    return
  }
}

/** 数据接收回调取消注册函数 */
let unregisterDataCallback: (() => void) | null = null

onMounted(() => {
  window.addEventListener('keydown', handleKeyboardShortcuts)
  serialDiagnosticTimer = setInterval(() => {
    serialDiagnosticNow.value = Date.now()
  }, 1000)
  
  // 初始化自定义协议配置
  initCustomProtocolConfig()
  
  // 注册数据接收回调，用于数据解析
  unregisterDataCallback = onDataReceive((data, direction) => {
    if (parseEnabled.value && parseMode.value !== 'none' && direction === 'rx') {
      dataParse.parseData(data)
    }
    recordSerialSessionEvent(data, direction)
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyboardShortcuts)
  if (serialDiagnosticTimer) {
    clearInterval(serialDiagnosticTimer)
    serialDiagnosticTimer = null
  }
  
  // 取消注册数据接收回调
  if (unregisterDataCallback) {
    unregisterDataCallback()
    unregisterDataCallback = null
  }
})

// ==================== 连接与发送功能 ====================

/** DOM 批量更新器实例 */
const domUpdater = new BatchDOMUpdater()

/**
 * 优化的连接/断开切换函数
 * 使用性能监控和即时反馈
 */
const toggleConnect = () => {
  measureSync('toggleConnect', () => {
    void toggleActiveSessionConnection()
  })
}

/**
 * 优化的发送数据函数
 * 添加输入验证和错误处理的性能优化
 */
const optimizedHandleSend = () => {
  measureSync('handleSend', () => {
    handleSend()
  })
}

/** 清理函数 - 在组件卸载时调用 */
function cleanupButtonOptimizations() {
  domUpdater.dispose()
  cleanupQuickCommands()
  stopSessionReplay()
}

// 在 onUnmounted 中调用清理
onUnmounted(cleanupButtonOptimizations)
</script>

<template>
  <div class="apple-workbench flex flex-col h-full min-h-0 w-full overflow-hidden bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans text-sm transition-colors">
    <!-- Toast Notification -->
    <div 
      v-if="settingsStore.toastVisible" 
      class="fixed top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-slate-800 dark:bg-slate-700 text-white text-sm rounded-lg shadow-lg z-50 flex items-center gap-2"
    >
      <CheckCircle2 class="w-4 h-4 text-green-400" />
      {{ settingsStore.toastMessage }}
    </div>
    
    <!-- Top / Main Content Area -->
    <div class="relative flex flex-1 min-h-0 overflow-hidden">
      
      <SerialConnectionDrawer
        v-model:visible="showLeftPanel"
        v-model:active-tab="activeTab"
        v-model:baud-rate="baudRate"
        v-model:data-bits="dataBits"
        v-model:stop-bits="stopBits"
        v-model:parity="parity"
        v-model:is-custom-baud-rate="isCustomBaudRate"
        v-model:custom-baud-rate-input="customBaudRateInput"
        v-model:parse-enabled="parseEnabled"
        v-model:parse-mode="parseMode"
        v-model:length-field-enabled="lengthFieldEnabled"
        v-model:show-parse-panel="showParsePanel"
        :is-supported="isSupported"
        :is-connected="isConnected"
        :can-reconnect="canReconnect"
        :baud-rate-presets="baudRatePresets"
        :custom-protocol-config="customProtocolConfig"
        :parse-result-count="dataParse.resultCount.value"
        :t="t"
        @connect="connect"
        @disconnect="disconnect"
        @reconnect="reconnect"
        @bluetooth-coming-soon="settingsStore.showToast(t('serial.bluetoothComingSoon'))"
      />

      <!-- Middle Panel: Data View & Send -->
      <div class="apple-content flex-1 flex flex-col bg-white dark:bg-slate-800 min-w-0">
        <SerialTopToolbar
          v-model:search-query="searchQuery"
          v-model:show-left-panel="showLeftPanel"
          v-model:show-bottom-panel="showBottomPanel"
          v-model:show-right-panel="showRightPanel"
          :is-connected="isActiveSessionConnected"
          :connection-summary="activeConnectionSummary"
          :filtered-count="filteredReceivedData.length"
          :data-count="activeDataCount"
          :serial-response-state="serialResponseState"
          :serial-session-diagnostics="serialSessionDiagnostics"
          :serial-sessions="serialSessions"
          :active-serial-session-id="activeSerialSessionId"
          :active-serial-session="activeSerialSession"
          :max-sessions="serialSessionController.state.maxSessions"
          :t="t"
          :format-serial-duration="formatSerialDuration"
          @add-session="addSerialSessionSlot"
          @remove-session="removeSerialSessionSlot"
          @set-active-session="setActiveSerialSession"
          @toggle-active-connection="toggleActiveSessionConnection"
        />

        <SerialLogPanel
          ref="virtualListRef"
          :items="filteredReceivedData"
          :show-timestamp="showTimestamp"
          :format-timestamp="formatTimestamp"
          @scroll="handleVirtualScroll"
        />

        <SerialParseResultsPanel
          v-model:visible="showParsePanel"
          :parse-enabled="parseEnabled"
          :parse-mode="parseMode"
          :result-count="dataParse.resultCount.value"
          :parse-stats="dataParse.parseStats.value"
          :parsed-results="dataParse.parsedResults.value"
          :parse-result-expanded="parseResultExpanded"
          :t="t"
          :format-bytes="formatBytes"
          @export-results="handleExportParseResults"
          @clear-results="handleClearParseResults"
          @toggle-result="toggleParseResultExpand"
        />

        <SerialMiddleToolbar
          v-model:display-mode="displayMode"
          v-model:receive-encoding="receiveEncoding"
          v-model:send-encoding="sendEncoding"
          v-model:show-timestamp="showTimestamp"
          v-model:auto-scroll="autoScroll"
          :data-count="activeDataCount"
          :toolbar-expanded="toolbarExpanded"
          :t="t"
          @export-data="exportActiveSerialData"
          @clear-data="clearActiveSerialData"
          @clear-tx="sendInput = ''"
        />

        <SerialSendPanel
          v-model:send-input="sendInput"
          v-model:is-hex-send="isHexSend"
          :visible="showBottomPanel"
          :is-connected="isActiveSessionConnected"
          :line-ending-config="lineEndingConfig"
          :line-ending-options="lineEndingOptions"
          :line-ending-preview="getLineEndingPreview()"
          :send-preview="sendPreview"
          :t="t"
          @send="optimizedHandleSend"
        />
      </div>

      <!-- Right Panel: Quick Commands / Command Group -->
      <div v-show="showRightPanel" class="apple-inspector w-[400px] shrink-0 bg-slate-50/90 dark:bg-slate-900/90 border-l dark:border-slate-700 flex flex-col">
        <!-- Right Panel Tabs -->
        <div class="apple-toolbar flex h-12 border-b dark:border-slate-700 bg-white/85 dark:bg-slate-800/85">
          <button
            class="flex-1 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors border-b-2"
            :class="activeRightTab === 'quick' ? 'text-blue-600 border-blue-600' : 'text-slate-500 hover:text-slate-700 border-transparent'"
            @click="activeRightTab = 'quick'"
          >
            <ListOrdered class="w-3.5 h-3.5"/> {{ t('serial.quickCommands') }}
          </button>
          <button
            class="flex-1 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors border-b-2"
            :class="activeRightTab === 'group' ? 'text-blue-600 border-blue-600' : 'text-slate-500 hover:text-slate-700 border-transparent'"
            @click="activeRightTab = 'group'"
          >
            <Play class="w-3.5 h-3.5"/> {{ t('serial.commandGroup') }}
          </button>
        </div>

        <SerialQuickCommandPanel
          v-show="activeRightTab === 'quick'"
          v-model:selected-protocol-template-id="selectedProtocolTemplateId"
          v-model:loop-interval="loopInterval"
          v-model:replay-mode="replayMode"
          v-model:replay-speed="replaySpeed"
          :quick-commands="quickCommands"
          :enabled-quick-commands="enabledQuickCommands"
          :protocol-templates="protocolTemplates"
          :selected-protocol-template="selectedProtocolTemplate"
          :protocol-template-hint="protocolTemplateHint"
          :is-connected="isConnected"
          :has-runnable-quick-commands="hasRunnableQuickCommands"
          :is-sending-quick-commands="isSendingQuickCommands"
          :is-looping="isLooping"
          :is-recording-session="isRecordingSession"
          :recorded-replay-events="recordedReplayEvents"
          :loaded-session-recording="loadedSessionRecording"
          :is-replaying-session="isReplayingSession"
          :replay-cursor="replayCursor"
          :replay-events-for-mode="replayEventsForMode"
          :simulated-replay-events="simulatedReplayEvents"
          :can-start-session-replay="canStartSessionReplay"
          :t="t"
          @add-command="addCommand"
          @send-selected="sendSelected"
          @toggle-loop-send="toggleLoopSend"
          @apply-selected-protocol-template="applySelectedProtocolTemplate"
          @send-command="sendCommand"
          @delete-command="deleteCommand"
          @session-replay-file-selected="handleSessionReplayFileSelected"
          @start-session-recording="startSessionRecording"
          @stop-session-recording="stopSessionRecording"
          @export-session-recording="exportSessionRecording"
          @start-session-replay="startSessionReplay"
          @stop-session-replay="stopSessionReplay"
        />

        <SerialCommandGroupPanel
          v-show="activeRightTab === 'group'"
          v-model:show-group-loader="showGroupLoader"
          v-model:show-exec-log="showExecLog"
          :cg="cg"
          :is-connected="isConnected"
          :recent-execution-logs="recentExecutionLogs"
          :execution-log-preview-limit="executionLogPreviewLimit"
          :t="t"
          :get-cmd-status-info="getCmdStatusInfo"
          @execute-command-group="executeCommandGroup"
          @save="handleSaveClick"
          @save-as="openSaveAsDialog"
          @load-group="handleLoadGroup"
        />
      </div>
    </div>

    <!-- Bottom Status Bar -->
    <div class="apple-statusbar h-8 border-t dark:border-slate-700 bg-white/85 dark:bg-slate-800/85 flex items-center justify-between px-4 text-xs text-slate-500 dark:text-slate-400">
      <div class="flex items-center gap-3">
        <!-- Reconnecting status -->
        <span v-if="isReconnecting" class="flex items-center gap-1 font-medium text-amber-600">
          <RefreshCw class="w-3 h-3 animate-spin"/>
          {{ t('serial.reconnectingStatus') }} ({{ reconnectAttempts }}/5)...
        </span>
        <!-- Normal connection status -->
        <span v-else class="flex items-center gap-1 font-medium" :class="isConnected ? 'text-green-600' : 'text-blue-600'">
          <span class="w-2 h-2 rounded-full" :class="isConnected ? 'bg-green-500' : 'bg-blue-500'"></span>
          {{ isConnected ? t('serial.connected') : t('serial.waitingConnect') }}
        </span>
        <span v-if="isConnected && !isReconnecting">{{ t('serial.connectedDevice') }}: {{ baudRate }} bps, {{ dataBits }} {{ t('serial.dataBitsUnit') }}, {{ parity }} {{ t('serial.parityCheck') }}, {{ stopBits }} {{ t('serial.stopBitsUnit') }}</span>
      </div>
      <div class="flex gap-4 font-mono">
        <span>Tx: {{ txBytes }} Bytes</span>
        <span>Rx: {{ rxBytes }} Bytes</span>
      </div>
    </div>

    <!-- 快捷键帮助面板 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showShortcutsHelp" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showShortcutsHelp = false">
          <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold flex items-center gap-2">
                <Keyboard class="w-5 h-5"/> 快捷键
              </h3>
              <button @click="showShortcutsHelp = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <XCircle class="w-5 h-5"/>
              </button>
            </div>
            <div class="space-y-2">
              <div v-for="shortcut in shortcuts" :key="shortcut.key" class="flex items-center justify-between py-2 border-b dark:border-slate-700 last:border-0">
                <span class="text-slate-600 dark:text-slate-300">{{ t(shortcut.descriptionKey) }}</span>
                <kbd class="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-mono">{{ shortcut.key }}</kbd>
              </div>
            </div>
            <p class="mt-4 text-xs text-slate-400 text-center">按 <kbd class="px-1 bg-slate-100 dark:bg-slate-700 rounded">?</kbd> 或 <kbd class="px-1 bg-slate-100 dark:bg-slate-700 rounded">Esc</kbd> 关闭</p>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 保存确认对话框 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showSaveConfirm" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showSaveConfirm = false">
          <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <AlertCircle class="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 class="font-bold text-slate-900 dark:text-slate-100">{{ t('serial.saveConfirmTitle') }}</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400">{{ t('serial.saveConfirmMsg') }}</p>
              </div>
            </div>
            <div class="flex gap-2 justify-end">
              <button @click="showSaveConfirm = false" class="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                {{ t('common.cancel') }}
              </button>
              <button @click="openSaveAsDialog" class="px-4 py-2 text-sm bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors">
                {{ t('serial.saveAs') }}
              </button>
              <button @click="doSave" class="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
                {{ t('common.confirm') }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 另存为对话框 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showSaveAsDialog" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showSaveAsDialog = false">
          <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Save class="w-5 h-5" /> {{ t('serial.saveAs') }}
              </h3>
              <button @click="showSaveAsDialog = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <XCircle class="w-5 h-5"/>
              </button>
            </div>
            <div class="mb-4">
              <label class="block text-sm text-slate-600 dark:text-slate-400 mb-1">{{ t('serial.groupName') || '指令组名称' }}</label>
              <input 
                v-model="saveAsName" 
                type="text" 
                class="w-full px-3 py-2 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                :placeholder="t('serial.groupNamePlaceholder') || '请输入名称'"
                @keyup.enter="doSaveAs"
              />
            </div>
            <div class="flex gap-2 justify-end">
              <button @click="showSaveAsDialog = false" class="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                {{ t('common.cancel') }}
              </button>
              <button @click="doSaveAs" class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                {{ t('common.confirm') }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
.slide-enter-active, .slide-leave-active {
  transition: all 0.2s ease;
}
.slide-enter-from, .slide-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}
.serial-drawer-enter-active, .serial-drawer-leave-active {
  transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.2, 0, 0, 1);
}
.serial-drawer-enter-from, .serial-drawer-leave-to {
  opacity: 0;
  transform: translateX(-18px);
}
/* Custom Scrollbar for better UI match */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
