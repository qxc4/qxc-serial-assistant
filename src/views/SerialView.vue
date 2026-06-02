<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted, computed, shallowRef, type ComponentPublicInstance } from 'vue'
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
  useSerialSessions,
  useSerialReplay,
  useQuickCommands,
  useSerialParsePanel,
} from '../features/serial'
import VirtualList from '../components/VirtualList.vue'
import SerialSessionReplayPanel from '../components/serial/SerialSessionReplayPanel.vue'
import SerialSessionStrip from '../components/serial/SerialSessionStrip.vue'
import SerialParseResultsPanel from '../components/serial/SerialParseResultsPanel.vue'
import SerialSendPanel from '../components/serial/SerialSendPanel.vue'
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
  Download, Trash2, Bluetooth,
  Usb, Plus, Play, Pause, Trash,
  PanelLeft, PanelBottom, PanelRight, Maximize,
  ListOrdered, Save, FolderOpen, Square,
  ChevronRight, Clock, AlertCircle, CheckCircle2, XCircle, Loader2,
  Mic, Send, Columns, RefreshCw, Keyboard, Search, FileCode
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
const virtualListRef = ref<InstanceType<typeof VirtualList> | null>(null)

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
  const data = receivedData.value
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
const serialSessionDiagnostics = computed(() => summarizeSerialSession(receivedData.value, serialDiagnosticNow.value))
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
  addSerialSessionSlot,
  removeSerialSessionSlot,
  setActiveSerialSession,
} = useSerialSessions({
  txBytes,
  rxBytes,
  dataCount,
  isConnected,
  showToast: message => settingsStore.showToast(message),
})

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

/**
 * 执行指令组（将串口发送函数传入）
 */
async function executeCommandGroup() {
  if (!isConnected.value) return
  await cg.executeGroup(async (data, isHex) => {
    await send(data, isHex)
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
  sessionReplayFileInputRef,
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
  openSessionReplayFile,
  handleSessionReplayFileSelected,
  startSessionReplay,
  stopSessionReplay,
} = useSerialReplay({
  send,
  isConnected,
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
  send,
  isConnected,
  showToast: message => settingsStore.showToast(message),
  measureSync,
})

function bindSessionReplayFileInput(el: Element | ComponentPublicInstance | null) {
  sessionReplayFileInputRef.value = el instanceof HTMLInputElement ? el : null
}

/**
 * 是否使用自定义波特率输入模式
 */
const isCustomBaudRate = ref(false)

/**
 * 手动输入的波特率值
 */
const customBaudRateInput = ref('')

/**
 * 切换到自定义波特率模式，将当前波特率填入输入框
 */
const enableCustomBaudRate = () => {
  isCustomBaudRate.value = true
  customBaudRateInput.value = String(baudRate.value)
}

/**
 * 确认应用自定义波特率值
 */
const applyCustomBaudRate = () => {
  const val = parseInt(customBaudRateInput.value, 10)
  if (!isNaN(val) && val > 0) {
    baudRate.value = val
  }
}

/**
 * 选择预设波特率时关闭自定义模式
 */
const selectPresetBaudRate = (val: number) => {
  isCustomBaudRate.value = false
  baudRate.value = val
}

// Watchers & Handlers
watch(receivedData, async () => {
  if (autoScroll.value && virtualListRef.value) {
    await nextTick()
    virtualListRef.value.scrollToBottom()
  }
})

const handleSend = () => {
  if (sendInput.value.trim() === '') return
  
  if (!isConnected.value) {
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
    send(data, isHexSend.value)
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
    clearData()
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
    if (isConnected.value) {
      disconnect()
      if (isLooping.value) toggleLoopSend()
    } else if (canReconnect.value) {
      reconnect()
    } else {
      connect()
    }
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
      
      <!-- Left Drawer: Connection Settings -->
      <Transition name="serial-drawer">
      <div v-if="showLeftPanel" class="apple-sidebar absolute inset-y-0 left-0 z-30 w-80 max-w-[calc(100vw-1rem)] shrink-0 bg-white/95 dark:bg-slate-800/95 border-r border-slate-200 dark:border-slate-700 shadow-2xl backdrop-blur flex min-h-0 flex-col">
        <!-- Tabs -->
        <div class="flex h-12 border-b dark:border-slate-700 text-center">
          <div 
            class="flex-1 cursor-pointer flex justify-center items-center gap-2 border-b-2 transition-colors"
            :class="activeTab === 'serial' ? 'border-blue-600 font-semibold text-blue-600' : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900'"
            @click="activeTab = 'serial'"
          >
            <Usb class="w-4 h-4" /> {{ t('serial.serialTab') }}
          </div>
          <div 
            class="flex-1 cursor-pointer flex justify-center items-center gap-2 text-slate-400 hover:bg-slate-50 dark:bg-slate-900 border-b-2 border-transparent"
            @click="settingsStore.showToast(t('serial.bluetoothComingSoon'))"
          >
            <Bluetooth class="w-4 h-4" /> {{ t('serial.bluetoothTab') }}
          </div>
          <button
            @click="showLeftPanel = false"
            class="w-11 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title="关闭连接抽屉"
          >
            <XCircle class="w-4 h-4" />
          </button>
        </div>

        <!-- Settings Form -->
        <div class="p-4 flex min-h-0 flex-col gap-4 overflow-y-auto">
          <div>
            <h2 class="font-bold text-base mb-1">{{ t('serial.serialSettings') }}</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">{{ t('serial.serialSettingsDesc') }}</p>
          </div>

          <div v-if="!isSupported" class="text-xs text-red-600 bg-red-50 p-2 rounded">
            {{ t('serial.notSupported') }}
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('settings.baudRate') }}</label>
            <div v-if="!isCustomBaudRate" class="flex gap-1">
              <select 
                :value="baudRate" 
                :disabled="isConnected" 
                @change="selectPresetBaudRate(($event.target as HTMLSelectElement).value as unknown as number)"
                class="flex-1 border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm"
              >
                <option v-for="rate in baudRatePresets" :key="rate" :value="rate">{{ rate }}</option>
              </select>
              <button 
                @click="enableCustomBaudRate"
                :disabled="isConnected"
                class="px-3 py-2 border dark:border-slate-700 rounded bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-50"
                :title="t('serial.customBaud')"
              >
                {{ t('serial.customBaud') }}
              </button>
            </div>
            <div v-else class="flex gap-1">
              <input 
                type="number" 
                :value="customBaudRateInput"
                :disabled="isConnected"
                @input="(e: Event) => { customBaudRateInput = (e.target as HTMLInputElement).value; applyCustomBaudRate() }"
                min="1"
                :placeholder="t('serial.customBaud')"
                class="flex-1 border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm"
              />
              <button 
                @click="isCustomBaudRate = false"
                :disabled="isConnected"
                class="px-3 py-2 border dark:border-slate-700 rounded bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs transition-colors disabled:opacity-50"
              >
                {{ t('serial.apply') }}
              </button>
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('settings.dataBits') }}</label>
            <select v-model="dataBits" :disabled="isConnected" class="border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border dark:border-slate-700-blue-500">
              <option :value="8">8</option>
              <option :value="7">7</option>
            </select>
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('settings.parity') }}</label>
            <select v-model="parity" :disabled="isConnected" class="border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border dark:border-slate-700-blue-500">
              <option value="none">{{ t('settings.none') }}</option>
              <option value="even">{{ t('settings.even') }}</option>
              <option value="odd">{{ t('settings.odd') }}</option>
            </select>
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('settings.stopBits') }}</label>
            <select v-model="stopBits" :disabled="isConnected" class="border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border dark:border-slate-700-blue-500">
              <option :value="1">1</option>
              <option :value="2">2</option>
            </select>
          </div>

          <button 
            v-if="isConnected"
            @click="disconnect" 
            :disabled="!isSupported"
            class="mt-4 py-3 rounded-md text-white font-medium transition-colors w-full bg-red-500 hover:bg-red-600"
          >
            {{ t('serial.disconnect') }}
          </button>
          <div v-else-if="canReconnect" class="mt-4 flex gap-2 w-full">
            <button 
              @click="reconnect" 
              :disabled="!isSupported"
              class="flex-1 py-3 rounded-md text-white font-medium transition-colors bg-green-500 hover:bg-green-600 disabled:opacity-50"
            >
              {{ t('serial.enablePort') }}
            </button>
            <button 
              @click="connect" 
              :disabled="!isSupported"
              class="flex-1 py-3 rounded-md text-white font-medium transition-colors bg-slate-900 hover:bg-slate-800 disabled:opacity-50"
            >
              {{ t('serial.changePort') }}
            </button>
          </div>
          <button 
            v-else
            @click="connect" 
            :disabled="!isSupported"
            class="mt-4 py-3 rounded-md text-white font-medium transition-colors w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50"
          >
            {{ t('serial.selectPort') }}
          </button>
          
          <!-- 数据解析配置 -->
          <div class="mt-6 pt-4 border-t dark:border-slate-700">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-sm flex items-center gap-2">
                <FileCode class="w-4 h-4" />
                {{ t('serial.dataParse') }}
              </h3>
              <label class="flex items-center gap-1 cursor-pointer">
                <input 
                  type="checkbox" 
                  v-model="parseEnabled"
                  class="w-4 h-4 rounded border-slate-300"
                />
                <span class="text-xs text-slate-600 dark:text-slate-400">{{ t('serial.enable') }}</span>
              </label>
            </div>
            
            <div class="flex flex-col gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('serial.parseMode') }}</label>
                <select 
                  v-model="parseMode"
                  :disabled="!parseEnabled"
                  class="border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm disabled:opacity-50"
                >
                  <option value="none">{{ t('serial.noParse') }}</option>
                  <optgroup :label="t('serial.modbusProtocol')">
                    <option value="modbus-rtu">{{ t('serial.modbusRtu') }}</option>
                    <option value="modbus-ascii">{{ t('serial.modbusAscii') }}</option>
                  </optgroup>
                  <optgroup :label="t('serial.displayModeGroup')">
                    <option value="hex-display">{{ t('serial.hexDisplay') }}</option>
                    <option value="ascii-display">{{ t('serial.asciiDisplay') }}</option>
                  </optgroup>
                  <optgroup :label="t('serial.customProtocol')">
                    <option value="custom-frame">{{ t('serial.customFrame') }}</option>
                  </optgroup>
                </select>
              </div>
              
              <!-- 自定义协议配置 -->
              <div v-if="parseMode === 'custom-frame'" class="space-y-2 p-2 bg-slate-50 dark:bg-slate-900 rounded border dark:border-slate-700">
                <div class="flex flex-col gap-1">
                  <label class="text-xs text-slate-500">{{ t('serial.frameHeader') }}</label>
                  <input 
                    v-model="customProtocolConfig.frameHeader"
                    type="text"
                    placeholder="如: AA 55"
                    class="border dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800 font-mono w-full"
                  />
                </div>
                
                <div class="flex flex-col gap-1">
                  <label class="text-xs text-slate-500">{{ t('serial.frameTail') }}</label>
                  <input 
                    v-model="customProtocolConfig.frameTail"
                    type="text"
                    placeholder="如: 0D 0A"
                    class="border dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800 font-mono w-full"
                  />
                </div>
                
                <div class="flex flex-col gap-1">
                  <label class="text-xs text-slate-500">{{ t('serial.dataOffset') }}</label>
                  <input 
                    v-model.number="customProtocolConfig.dataOffset"
                    type="number"
                    min="0"
                    class="border dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800 w-full"
                  />
                </div>
                
                <div class="flex flex-col gap-1">
                  <label class="text-xs text-slate-500">{{ t('serial.checksumMethod') }}</label>
                  <select 
                    v-model="customProtocolConfig.checksum.type"
                    class="border dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800 w-full"
                  >
                    <option value="none">{{ t('serial.noChecksum') }}</option>
                    <option value="sum">{{ t('serial.sumChecksum') }}</option>
                    <option value="xor">{{ t('serial.xorChecksum') }}</option>
                    <option value="crc16">{{ t('serial.crc16Checksum') }}</option>
                    <option value="crc16-modbus">{{ t('serial.crc16ModbusChecksum') }}</option>
                  </select>
                </div>
                
                <div class="flex items-center gap-2">
                  <input 
                    type="checkbox"
                    v-model="lengthFieldEnabled"
                    class="w-3 h-3"
                  />
                  <label class="text-xs text-slate-500">{{ t('serial.enableLengthField') }}</label>
                </div>
                
                <div v-show="lengthFieldEnabled" class="space-y-2">
                  <div class="flex flex-col gap-1">
                    <label class="text-xs text-slate-500">{{ t('serial.lengthOffset') }}</label>
                    <input 
                      v-model.number="customProtocolConfig.lengthField.offset"
                      type="number"
                      min="0"
                      class="border dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800 w-full"
                    />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-xs text-slate-500">{{ t('serial.lengthBytes') }}</label>
                    <select 
                      v-model.number="customProtocolConfig.lengthField.size"
                      class="border dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800 w-full"
                    >
                      <option :value="1">{{ t('serial.oneByte') }}</option>
                      <option :value="2">{{ t('serial.twoBytes') }}</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <button 
                @click="showParsePanel = !showParsePanel"
                :disabled="!parseEnabled || parseMode === 'none'"
                class="w-full py-2 rounded border dark:border-slate-700 text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <FileCode class="w-4 h-4" />
                {{ showParsePanel ? t('serial.hideParseResults') : t('serial.showParseResults') }}
                <span v-if="dataParse.resultCount.value > 0" class="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
                  {{ dataParse.resultCount.value }}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
      </Transition>

      <!-- Middle Panel: Data View & Send -->
      <div class="apple-content flex-1 flex flex-col bg-white dark:bg-slate-800 min-w-0">
        <!-- Top Toolbar -->
        <div class="apple-toolbar border-b dark:border-slate-700 bg-slate-50/85 dark:bg-slate-900/85 shrink-0 px-3 py-2">
          <div class="flex items-center gap-2">
            <button
              @click="showLeftPanel = true"
              class="min-w-0 max-w-[240px] rounded-lg border px-2.5 py-1.5 text-left transition-colors flex items-center gap-2"
              :class="isConnected
                ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'"
              title="打开连接抽屉"
            >
              <Usb class="h-4 w-4 shrink-0" />
              <span class="min-w-0">
                <span class="block truncate text-[11px] font-semibold">
                  {{ isConnected ? t('serial.connected') : t('serial.serialSettings') }}
                </span>
                <span class="block truncate text-[10px] opacity-75">{{ connectionSummary }}</span>
              </span>
            </button>

            <div class="relative min-w-0 flex-1 max-w-sm">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                v-model="searchQuery"
                type="text"
                :placeholder="t('serial.searchPlaceholder')"
                class="w-full pl-9 pr-7 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-shadow"
              />
              <button
                v-if="searchQuery"
                @click="searchQuery = ''"
                class="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <XCircle class="w-3.5 h-3.5" />
              </button>
            </div>

            <div class="hidden md:flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 px-2 py-1 rounded bg-white dark:bg-slate-800 border dark:border-slate-700">
              <span>{{ filteredReceivedData.length }}</span>
              <span>/</span>
              <span>{{ dataCount.toLocaleString() }}</span>
            </div>

            <div class="hidden xl:flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              <span
                class="rounded-full px-2 py-0.5"
                :class="serialSessionDiagnostics.receiveAfterLastTx ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300'"
              >
                {{ serialResponseState }}
              </span>
              <span>TX {{ serialSessionDiagnostics.txEntries }}</span>
              <span>RX {{ serialSessionDiagnostics.rxEntries }}</span>
              <span>静默 {{ formatSerialDuration(serialSessionDiagnostics.silenceMs) }}</span>
              <span v-if="serialSessionDiagnostics.averageTxIntervalMs !== null">
                均隔 {{ formatSerialDuration(serialSessionDiagnostics.averageTxIntervalMs) }}
              </span>
            </div>

            <div class="flex items-center gap-1 text-slate-600 dark:text-slate-400">
              <button @click="showLeftPanel = !showLeftPanel" :class="showLeftPanel ? 'text-slate-900 dark:text-slate-100 bg-slate-200 dark:bg-slate-700' : 'text-slate-400'" class="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors" title="切换连接抽屉"><PanelLeft class="w-4 h-4" /></button>
              <button @click="showBottomPanel = !showBottomPanel" :class="showBottomPanel ? 'text-slate-900 dark:text-slate-100 bg-slate-200 dark:bg-slate-700' : 'text-slate-400'" class="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors" title="切换底部栏"><PanelBottom class="w-4 h-4" /></button>
              <button @click="showRightPanel = !showRightPanel" :class="showRightPanel ? 'text-slate-900 dark:text-slate-100 bg-slate-200 dark:bg-slate-700' : 'text-slate-400'" class="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors" title="切换右侧栏"><PanelRight class="w-4 h-4" /></button>
              <button @click="showLeftPanel = false; showRightPanel = false; showBottomPanel = false" class="p-1.5 text-slate-400 hover:text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors" title="最大化视图"><Maximize class="w-4 h-4" /></button>
            </div>
          </div>
          <div class="mt-2 flex items-center gap-2">
            <SerialSessionStrip
              class="min-w-0 flex-1"
              :sessions="serialSessions"
              :active-session-id="activeSerialSessionId"
              :max-sessions="serialSessionController.state.maxSessions"
              :is-connected="isConnected"
              @add-session="addSerialSessionSlot"
              @remove-session="removeSerialSessionSlot"
              @set-active-session="setActiveSerialSession"
            />
            <div
              v-if="activeSerialSession"
              class="hidden shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 lg:block"
            >
              {{ activeSerialSession.connectionLabel }}
            </div>
          </div>
        </div>

        <!-- Receive Data Area with Virtual Scroll -->
        <div class="flex-1 font-mono text-sm relative min-h-0">
          <VirtualList
            ref="virtualListRef"
            :items="filteredReceivedData"
            :item-height="24"
            :buffer="5"
            key-field="id"
            class="h-full p-4"
            @scroll="handleVirtualScroll"
          >
            <template #default="{ item }">
              <div class="mb-1 whitespace-pre-wrap break-all" style="line-height: 24px;">
                <span v-if="showTimestamp" class="text-slate-500 dark:text-slate-400 mr-2 select-none">
                  [{{ formatTimestamp(item.timestamp) }}] {{ item.direction === 'rx' ? 'RX' : 'TX' }}:
                </span>
                <span :class="item.direction === 'rx' ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'">
                  {{ item.data }}
                </span>
              </div>
            </template>
          </VirtualList>
        </div>

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

        <!-- Middle Toolbar -->
        <div class="px-3 py-1.5 flex items-center gap-2 flex-wrap border-t dark:border-slate-700 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-900 shrink-0">
          <!-- Display Mode Group -->
          <div class="flex items-center gap-1">
            <button 
              class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
              @click="toolbarExpanded.display = !toolbarExpanded.display"
              title="显示模式"
            >
              <ChevronRight class="w-3 h-3 transition-transform" :class="toolbarExpanded.display ? 'rotate-90' : ''"/>
            </button>
            <Transition name="slide">
              <div v-show="toolbarExpanded.display" class="flex gap-1">
                <button 
                  class="px-3 py-1.5 rounded border dark:border-slate-700 text-xs flex items-center gap-1 transition-colors"
                  :class="displayMode === 'rx' ? 'border-blue-300 text-blue-600 bg-blue-50' : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:bg-slate-700'"
                  @click="displayMode = 'rx'"
                  title="仅显示接收"
                >
                  <Mic class="w-3 h-3"/> RX
                </button>
                <button 
                  class="px-3 py-1.5 rounded border dark:border-slate-700 text-xs flex items-center gap-1 transition-colors"
                  :class="displayMode === 'tx' ? 'border-blue-300 text-blue-600 bg-blue-50' : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:bg-slate-700'"
                  @click="displayMode = 'tx'"
                  title="仅显示发送"
                >
                  <Send class="w-3 h-3"/> TX
                </button>
                <button 
                  class="px-3 py-1.5 rounded border dark:border-slate-700 text-xs flex items-center gap-1 transition-colors"
                  :class="displayMode === 'mixed' ? 'border-blue-300 text-blue-600 bg-blue-50' : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:bg-slate-700'"
                  @click="displayMode = 'mixed'"
                  :title="t('serial.mixedDisplay')"
                >
                  <Columns class="w-3 h-3"/> {{ t('serial.modeMixed') }}
                </button>
              </div>
            </Transition>
          </div>
          
          <div class="w-px h-6 bg-slate-300 dark:bg-slate-600"></div>
          
          <!-- Encoding Group -->
          <div class="flex items-center gap-1">
            <button 
              class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
              @click="toolbarExpanded.encoding = !toolbarExpanded.encoding"
              :title="t('serial.encodingSettings')"
            >
              <ChevronRight class="w-3 h-3 transition-transform" :class="toolbarExpanded.encoding ? 'rotate-90' : ''"/>
            </button>
            <Transition name="slide">
              <div v-show="toolbarExpanded.encoding" class="flex gap-1">
                <select 
                  v-model="receiveEncoding" 
                  class="border dark:border-slate-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-slate-800 outline-none"
                  :title="t('serial.rxEncodingFormat')"
                >
                  <option value="utf8">{{ t('serial.rxUtf8') }}</option>
                  <option value="ascii">{{ t('serial.rxAscii') }}</option>
                  <option value="gbk">{{ t('serial.rxGbk') }}</option>
                  <option value="hex">{{ t('serial.rxHex') }}</option>
                </select>
                <select 
                  v-model="sendEncoding" 
                  class="border dark:border-slate-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-slate-800 outline-none"
                  :title="t('serial.txEncodingFormat')"
                >
                  <option value="utf8">{{ t('serial.txUtf8') }}</option>
                  <option value="ascii">{{ t('serial.txAscii') }}</option>
                  <option value="gbk">{{ t('serial.txGbk') }}</option>
                  <option value="hex">{{ t('serial.txHex') }}</option>
                </select>
              </div>
            </Transition>
          </div>
          
          <div class="w-px h-6 bg-slate-300 dark:bg-slate-600"></div>
          
          <!-- Options Group -->
          <div class="flex items-center gap-1">
            <button 
              class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
              @click="toolbarExpanded.options = !toolbarExpanded.options"
              :title="t('serial.displayOptions')"
            >
              <ChevronRight class="w-3 h-3 transition-transform" :class="toolbarExpanded.options ? 'rotate-90' : ''"/>
            </button>
            <Transition name="slide">
              <div v-show="toolbarExpanded.options" class="flex gap-1 items-center">
                <span class="text-[10px] text-slate-500 dark:text-slate-400 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                  {{ dataCount.toLocaleString() }} {{ t('serial.entries') }}
                </span>
                <button 
                  class="px-3 py-1.5 rounded border dark:border-slate-700 text-xs flex items-center gap-1 transition-colors"
                  :class="showTimestamp ? 'border-blue-300 text-blue-600 bg-blue-50' : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:bg-slate-700'"
                  @click="showTimestamp = !showTimestamp"
                >
                  {{ t('serial.timestamp') }}
                </button>
                <button 
                  class="px-3 py-1.5 rounded text-xs flex items-center gap-1 transition-colors"
                  :class="autoScroll ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 border dark:border-slate-700 hover:bg-slate-100 dark:bg-slate-700'"
                  @click="autoScroll = !autoScroll"
                >
                  {{ t('serial.autoScroll') }}
                </button>
                <button class="px-3 py-1.5 rounded border dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:bg-slate-700 text-xs flex items-center gap-1" @click="exportData">
                  <Download class="w-3 h-3" /> {{ t('serial.exportLog') }}
                </button>
              </div>
            </Transition>
          </div>
          
          <div class="w-px h-6 bg-slate-300 dark:bg-slate-600"></div>
          
          <!-- Action Buttons -->
          <div class="flex gap-1.5 ml-auto">
            <button class="px-2.5 py-1.5 rounded bg-slate-800 text-white text-xs flex items-center gap-1 hover:bg-slate-700 transition-colors" @click="clearData">
              <Trash2 class="w-3 h-3" /> {{ t('serial.clearRx') }}
            </button>
            <button class="px-2.5 py-1.5 rounded bg-slate-800 text-white text-xs flex items-center gap-1 hover:bg-slate-700 transition-colors" @click="sendInput = ''">
              <Trash2 class="w-3 h-3" /> {{ t('serial.clearTx') }}
            </button>
          </div>
        </div>

        <SerialSendPanel
          v-model:send-input="sendInput"
          v-model:is-hex-send="isHexSend"
          :visible="showBottomPanel"
          :is-connected="isConnected"
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

        <!-- ===== 快捷输入面板 (原有) ===== -->
        <div v-show="activeRightTab === 'quick'" class="flex min-h-0 flex-col flex-1 overflow-hidden">
          <div class="apple-toolbar h-10 border-b dark:border-slate-700 flex items-center justify-between px-3 bg-white/85 dark:bg-slate-800/85">
            <div class="min-w-0">
              <h2 class="font-semibold text-sm text-slate-700 dark:text-slate-300 truncate">{{ t('serial.quickCommands') }}</h2>
              <p class="text-[10px] text-slate-400">
                {{ enabledQuickCommands.length }} / {{ quickCommands.length }} 可执行
              </p>
            </div>
            <div class="flex items-center gap-1 text-slate-500">
              <button @click="addCommand" class="p-1.5 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" :title="t('serial.addCommand')">
                <Plus class="w-4 h-4"/>
              </button>
              <button
                @click="sendSelected"
                :disabled="!isConnected || !hasRunnableQuickCommands || isSendingQuickCommands"
                class="p-1.5 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded disabled:opacity-50"
                :title="t('serial.executeAll')"
              >
                <Loader2 v-if="isSendingQuickCommands" class="w-4 h-4 animate-spin"/>
                <Play v-else class="w-4 h-4"/>
              </button>
            </div>
          </div>

          <div class="px-3 py-2 flex items-center gap-2 border-b dark:border-slate-700 bg-white/70 dark:bg-slate-800/70">
            <button
              @click="toggleLoopSend"
              :disabled="!isConnected || !hasRunnableQuickCommands"
              class="flex-1 py-1.5 rounded text-xs flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
              :class="isLooping ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-slate-400 text-white hover:bg-slate-500'"
            >
              <component :is="isLooping ? Pause : Play" class="w-3 h-3"/>
              {{ isLooping ? t('serial.stopLoop') : t('serial.loopSend') }}
            </button>
            <div class="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
              <span>{{ t('serial.interval') }}</span>
              <input type="number" v-model="loopInterval" class="w-14 border dark:border-slate-700 rounded px-1 py-1 text-center outline-none">
              <span>ms</span>
            </div>
          </div>

          <div class="border-b border-slate-200 bg-white/80 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/80">
            <div class="mb-1.5 flex items-center justify-between gap-2">
              <div class="min-w-0">
                <h3 class="truncate text-xs font-medium text-slate-600 dark:text-slate-300">协议模板库</h3>
                <p class="truncate text-[10px] text-slate-400">生成快捷命令和解析建议</p>
              </div>
              <button
                @click="applySelectedProtocolTemplate"
                class="shrink-0 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300"
              >
                应用
              </button>
            </div>
            <select
              v-model="selectedProtocolTemplateId"
              class="mb-1.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            >
              <option v-for="template in protocolTemplates" :key="template.id" :value="template.id">
                {{ template.name }}
              </option>
            </select>
            <p class="line-clamp-2 text-[10px] text-slate-500 dark:text-slate-400">
              {{ selectedProtocolTemplate?.description }}
            </p>
            <p v-if="protocolTemplateHint" class="mt-1 line-clamp-2 text-[10px] text-blue-600 dark:text-blue-300">
              {{ protocolTemplateHint }}
            </p>
          </div>

          <input
            :ref="bindSessionReplayFileInput"
            type="file"
            accept=".json,.qxc-session.json,application/json"
            class="hidden"
            @change="handleSessionReplayFileSelected"
          />
          <SerialSessionReplayPanel
            v-model:replay-mode="replayMode"
            v-model:replay-speed="replaySpeed"
            :is-recording-session="isRecordingSession"
            :recorded-replay-events="recordedReplayEvents"
            :loaded-session-recording="loadedSessionRecording"
            :is-replaying-session="isReplayingSession"
            :replay-cursor="replayCursor"
            :replay-events-for-mode="replayEventsForMode"
            :simulated-replay-events="simulatedReplayEvents"
            :can-start-session-replay="canStartSessionReplay"
            @start-session-recording="startSessionRecording"
            @stop-session-recording="stopSessionRecording"
            @export-session-recording="exportSessionRecording"
            @open-session-replay-file="openSessionReplayFile"
            @start-session-replay="startSessionReplay"
            @stop-session-replay="stopSessionReplay"
          />

          <div class="flex-1 min-h-0 overflow-y-auto p-2">
            <div class="flex items-center px-2 py-1 text-[10px] text-slate-500 mb-1 sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
              <div class="w-7 text-center">{{ t('serial.quickCmdEnable') }}</div>
              <div class="flex-1">{{ t('serial.quickCmdContent') }}</div>
              <div class="w-9 text-center">HEX</div>
              <div class="w-14 text-center">{{ t('serial.quickCmdDelay') }}</div>
              <div class="w-16 text-center">{{ t('serial.quickCmdAction') }}</div>
            </div>
            <div v-for="cmd in quickCommands" :key="cmd.id"
              class="flex items-center gap-1.5 px-2 py-1.5 mb-1 bg-white dark:bg-slate-800 rounded border dark:border-slate-700 shadow-sm group text-xs">
              <div class="w-7 flex justify-center">
                <input type="checkbox" v-model="cmd.enabled" class="rounded w-3.5 h-3.5 cursor-pointer">
              </div>
              <div class="flex-1 flex flex-col gap-0.5 min-w-0">
                <input type="text" v-model="cmd.content" :placeholder="t('serial.quickCmdContentPlaceholder')" class="w-full text-xs font-mono bg-transparent border-b border-transparent focus:border-blue-300 outline-none truncate">
                <input type="text" v-model="cmd.description" :placeholder="t('serial.quickCmdNotePlaceholder')" class="w-full text-[9px] text-slate-400 bg-transparent outline-none truncate">
              </div>
              <div class="w-9 flex justify-center">
                <input type="checkbox" v-model="cmd.isHex" class="rounded w-3 h-3 cursor-pointer">
              </div>
              <div class="w-14">
                <input type="number" v-model="cmd.delay" class="w-full text-[10px] text-center border dark:border-slate-700 rounded py-0.5 outline-none focus:border-blue-300 bg-transparent">
              </div>
              <div class="w-16 flex justify-center gap-0.5">
                <button @click="sendCommand(cmd)" :disabled="!isConnected || !cmd.content.trim()" class="p-1 text-slate-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded disabled:opacity-50" :title="t('serial.quickCmdSend')">
                  <Send class="w-3.5 h-3.5"/>
                </button>
                <button @click="deleteCommand(cmd.id)" class="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" :title="t('serial.delete')">
                  <Trash class="w-3.5 h-3.5"/>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- ===== 指令组面板 (新增) ===== -->
        <div v-show="activeRightTab === 'group'" class="flex min-h-0 flex-col flex-1 overflow-hidden">

          <!-- 指令组头部：名称 + 操作按钮 -->
          <div class="border-b dark:border-slate-700 bg-white dark:bg-slate-800">
            <div class="px-4 pt-3 pb-2 flex items-center gap-2">
              <input
                type="text"
                v-model="cg.activeGroup.value.name"
                placeholder="指令组名称..."
                class="flex-1 font-bold text-sm bg-transparent outline-none border-b border-transparent focus:border-blue-400 pb-0.5"
              />
            </div>
            <div class="px-4 pb-2 flex items-center gap-2">
              <input
                type="text"
                v-model="cg.activeGroup.value.description"
                placeholder="描述（可选）..."
                class="flex-1 text-xs text-slate-500 bg-transparent outline-none"
              />
            </div>
          </div>

          <!-- 执行控制栏：进度 + 按钮 -->
          <div class="px-3 py-2 border-b dark:border-slate-700 bg-white dark:bg-slate-800 space-y-2">
            <!-- 进度条 -->
            <div class="flex items-center gap-2">
              <div class="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  class="h-full bg-blue-500 transition-all duration-300 rounded-full"
                  :style="{ width: cg.progressPercent.value + '%' }"
                ></div>
              </div>
              <span class="text-[10px] font-mono text-slate-500 w-8 text-right">{{ cg.progressPercent.value }}%</span>
            </div>

            <!-- 执行控制按钮 -->
            <div class="flex items-center gap-1.5">
              <button
                @click="executeCommandGroup"
                :disabled="!isConnected || cg.executionState.value === 'running' || cg.executionState.value === 'paused'"
                class="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs flex items-center justify-center gap-1 transition-colors"
              >
                <Play class="w-3 h-3"/> {{ t('serial.executeAll') }}
              </button>
              <button
                @click="cg.pauseExecution()"
                :disabled="cg.executionState.value !== 'running'"
                class="py-1.5 px-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded text-xs flex items-center gap-1 transition-colors"
              >
                <Pause class="w-3 h-3"/>
              </button>
              <button
                @click="cg.stopExecution()"
                :disabled="cg.executionState.value === 'idle' || cg.executionState.value === 'completed' || cg.executionState.value === 'stopped'"
                class="py-1.5 px-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded text-xs flex items-center gap-1 transition-colors"
              >
                <Square class="w-3 h-3"/>
              </button>
            </div>

            <!-- 状态统计 -->
            <div class="flex items-center justify-between text-[10px] text-slate-500">
              <span class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-full" :class="{
                  'bg-slate-300': cg.executionState.value === 'idle',
                  'bg-blue-500 animate-pulse': cg.executionState.value === 'running',
                  'bg-amber-500': cg.executionState.value === 'paused',
                  'bg-green-500': cg.executionState.value === 'completed',
                  'bg-red-500': cg.executionState.value === 'stopped'
                }"></span>
                {{ { idle: '空闲', running: '执行中', paused: '已暂停', completed: '已完成', stopped: '已停止' }[cg.executionState.value] }}
              </span>
              <span>✓{{ cg.stats.value.success }} ✗{{ cg.stats.value.failed }} ⏱{{ cg.stats.value.timeout }} ⊘{{ cg.stats.value.skipped }} / {{ cg.stats.value.total }}</span>
            </div>
          </div>

          <!-- 全局设置栏 -->
          <div class="px-3 py-2 border-b dark:border-slate-700 bg-slate-100 dark:bg-slate-900 flex items-center gap-3 text-xs">
            <label class="flex items-center gap-1 text-slate-600 dark:text-slate-400">
              {{ t('serial.failurePolicy') }}
              <select v-model="cg.activeGroup.value.onFailure" class="border dark:border-slate-700 rounded px-1.5 py-0.5 text-xs bg-white dark:bg-slate-800 outline-none">
                <option value="stop-all">{{ t('serial.stopAll') }}</option>
                <option value="skip-continue">{{ t('serial.skipContinue') }}</option>
                <option value="skip-dependents">{{ t('serial.skipDependents') }}</option>
              </select>
            </label>
            <label class="flex items-center gap-1 text-slate-600 dark:text-slate-400 whitespace-nowrap">
              {{ t('serial.globalTimeout') }}
              <input type="number" v-model.number="cg.activeGroup.value.globalTimeout" min="0" class="w-16 border dark:border-slate-700 rounded px-1.5 py-0.5 text-xs bg-white dark:bg-slate-800 outline-none" :placeholder="t('serial.globalTimeoutPlaceholder')">
            </label>
          </div>

          <!-- 指令列表区域 -->
          <div class="flex-1 min-h-0 overflow-y-auto p-2">
            <!-- 表头 -->
            <div class="flex items-center px-2 py-1 text-[10px] text-slate-500 dark:text-slate-400 mb-1 sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
              <div class="w-7 text-center">#</div>
              <div class="w-6 text-center"></div>
              <div class="flex-1">{{ t('serial.contentNote') }}</div>
              <div class="w-8 text-center">H</div>
              <div class="w-12 text-center">{{ t('serial.commandDelay') }}</div>
              <div class="w-12 text-center">{{ t('serial.commandTimeout') }}</div>
              <div class="w-8 text-center">{{ t('serial.commandStatus') }}</div>
              <div class="w-12 text-center">{{ t('serial.commandAction') }}</div>
            </div>

            <!-- 指令项 -->
            <div
              v-for="(cmd, idx) in (cg.activeGroup.value?.commands || [])"
              :key="cmd.id"
              class="flex items-center gap-1 p-1.5 mb-1 bg-white dark:bg-slate-800 rounded border dark:border-slate-700 shadow-sm group text-xs"
              :class="cg.currentExecutingIndex.value === idx ? 'ring-1 ring-blue-400 bg-blue-50/30 dark:bg-blue-900/20' : ''"
            >
              <div class="w-7 text-center text-[10px] text-slate-400 font-mono">{{ idx + 1 }}</div>
              <div class="w-6 flex justify-center">
                <input type="checkbox" v-model="cmd.enabled" class="rounded w-3.5 h-3.5 cursor-pointer">
              </div>
              <div class="flex-1 flex flex-col gap-0.5 min-w-0">
                <input type="text" v-model="cmd.content" :placeholder="t('serial.commandPlaceholder')" class="w-full text-xs font-mono bg-transparent border-b border-transparent focus:border-blue-300 outline-none truncate">
                <input type="text" v-model="cmd.description" :placeholder="t('serial.notePlaceholder')" class="w-full text-[9px] text-slate-400 bg-transparent outline-none truncate">
              </div>
              <div class="w-8 flex justify-center">
                <input type="checkbox" v-model="cmd.isHex" class="rounded w-3 h-3 cursor-pointer" :title="t('serial.hexMode')">
              </div>
              <div class="w-12">
                <input type="number" v-model="cmd.delay" min="0" class="w-full text-[10px] text-center border dark:border-slate-700 rounded py-0.5 outline-none focus:border-blue-300 bg-transparent">
              </div>
              <div class="w-12">
                <input type="number" v-model="cmd.timeout" min="0" class="w-full text-[10px] text-center border dark:border-slate-700 rounded py-0.5 outline-none focus:border-blue-300 bg-transparent" :title="t('serial.singleTimeout')">
              </div>
              <!-- 状态图标 -->
              <div class="w-8 flex justify-center">
                <component
                  v-if="getCmdStatusInfo(cmd.id)"
                  :is="getCmdStatusInfo(cmd.id)!.icon"
                  class="w-3.5 h-3.5"
                  :class="getCmdStatusInfo(cmd.id)!.color"
                  :title="t(getCmdStatusInfo(cmd.id)!.labelKey)"
                />
                <span v-else class="text-slate-300 text-[10px]">-</span>
              </div>
              <div class="w-12 flex justify-center gap-0.5">
                <button @click="cg.removeCommand(cmd.id)" class="p-0.5 text-slate-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash class="w-3 h-3"/>
                </button>
              </div>
            </div>

            <!-- 空状态提示 -->
            <div v-if="(cg.activeGroup.value?.commands || []).length === 0" class="flex flex-col items-center justify-center py-10 text-slate-400">
              <ListOrdered class="w-8 h-8 mb-2 opacity-40"/>
              <p class="text-xs">{{ t('serial.noCommandsHint') }}</p>
            </div>
          </div>

          <!-- 底部工具栏：添加 + 保存/加载 + 日志 -->
          <div class="border-t dark:border-slate-700 bg-white dark:bg-slate-800">
            <!-- 主操作行 -->
            <div class="px-3 py-2 flex items-center gap-1.5 border-b dark:border-slate-700">
              <button @click="cg.addCommand()" class="flex-1 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-xs flex items-center justify-center gap-1 transition-colors">
                <Plus class="w-3 h-3"/> {{ t('serial.addCommand') }}
              </button>
              <button @click="handleSaveClick" class="py-1.5 px-3 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 text-green-700 dark:text-green-400 rounded text-xs flex items-center gap-1 transition-colors">
                <Save class="w-3 h-3"/> {{ t('serial.saveGroup') }}
              </button>
              <button @click="openSaveAsDialog" class="py-1.5 px-3 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 text-blue-700 dark:text-blue-400 rounded text-xs flex items-center gap-1 transition-colors">
                <Save class="w-3 h-3"/> {{ t('serial.saveAs') }}
              </button>
              <button @click="showGroupLoader = !showGroupLoader" class="py-1.5 px-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 rounded text-xs flex items-center gap-1 transition-colors">
                <FolderOpen class="w-3 h-3"/> {{ t('serial.loadGroup') }}
              </button>
              <button @click="cg.clearCommands()" class="py-1.5 px-2 text-slate-400 hover:text-red-500 rounded text-xs transition-colors" :title="t('serial.clearAll')">
                <Trash2 class="w-3.5 h-3.5"/>
              </button>
            </div>

            <!-- 已保存的指令组列表（可折叠） -->
            <div v-if="showGroupLoader && (cg.savedGroups.value?.length || 0) > 0" class="max-h-32 overflow-y-auto border-b dark:border-slate-700">
              <div
                v-for="g in cg.savedGroups.value"
                :key="g.id"
                class="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs cursor-pointer group/item"
                @click="handleLoadGroup(g.id)"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <ListOrdered class="w-3 h-3 text-slate-400 shrink-0"/>
                  <span class="truncate">{{ g.name }}</span>
                  <span class="text-[10px] text-slate-400">({{ g.commands.length }}条)</span>
                </div>
                <button @click.stop="cg.deleteSavedGroup(g.id)" class="p-0.5 text-slate-300 hover:text-red-500 opacity-0 group-hover/item:opacity-100">
                  <XCircle class="w-3.5 h-3.5"/>
                </button>
              </div>
            </div>
            <div v-else-if="showGroupLoader && (cg.savedGroups.value?.length || 0) === 0" class="px-3 py-2 text-xs text-slate-400 text-center">
              {{ t('serial.noSavedGroups') }}
            </div>

            <!-- 执行日志折叠区 -->
            <div>
              <button
                @click="showExecLog = !showExecLog"
                class="w-full px-3 py-1.5 flex items-center justify-between text-xs text-slate-500 hover:text-slate-700 transition-colors"
              >
                <span class="flex items-center gap-1.5">
                  <AlertCircle class="w-3 h-3"/>
                  {{ t('serial.execLog') }}
                  <span class="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-500 dark:text-slate-300">
                    {{ (cg.executionLogs.value || []).length }}
                  </span>
                </span>
                <span class="flex items-center gap-2">
                  <button
                    v-if="(cg.executionLogs.value || []).length > 0"
                    @click.stop="cg.clearLogs()"
                    class="px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    :title="t('serial.clearData')"
                  >
                    {{ t('serial.clearData') }}
                  </button>
                  <ChevronRight class="w-3 h-3 transition-transform" :class="{ 'rotate-90': showExecLog }"/>
                </span>
              </button>
              <div v-if="showExecLog" class="max-h-44 overflow-y-auto px-2.5 pb-2 space-y-1">
                <div
                  v-for="log in recentExecutionLogs"
                  :key="log.id"
                  class="text-[10px] font-mono px-2 py-1 rounded bg-slate-50 dark:bg-slate-900 border dark:border-slate-700 grid grid-cols-[auto_auto_1fr_auto] items-center gap-x-1.5"
                >
                  <span class="text-slate-400 whitespace-nowrap">[{{ new Date(log.startTime).toLocaleTimeString() }}]</span>
                  <span
                    class="font-medium whitespace-nowrap"
                    :class="{
                      'text-green-600': log.status === 'success',
                      'text-red-500': log.status === 'failed',
                      'text-amber-500': log.status === 'timeout',
                      'text-slate-400': log.status === 'skipped'
                    }"
                  >[{{ log.status.toUpperCase() }}]</span>
                  <span class="text-slate-700 dark:text-slate-300 truncate" :title="log.sentData || '(无数据)'">{{ log.sentData || '(无数据)' }}</span>
                  <span class="text-slate-400 whitespace-nowrap">{{ log.duration }}ms</span>
                  <div v-if="log.message" class="col-span-4 text-slate-400 truncate" :title="log.message">— {{ log.message }}</div>
                </div>
                <div v-if="(cg.executionLogs.value || []).length === 0" class="text-[10px] text-slate-400 text-center py-2">
                  {{ t('serial.noExecLog') }}
                </div>
                <div
                  v-if="(cg.executionLogs.value || []).length > executionLogPreviewLimit"
                  class="text-[10px] text-slate-400 text-center py-1"
                >
                  仅显示最近 {{ executionLogPreviewLimit }} 条
                </div>
              </div>
            </div>
          </div>
        </div>
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
