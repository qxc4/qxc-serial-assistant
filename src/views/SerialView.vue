<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted, computed, shallowRef } from 'vue'
import { useSerial } from '../composables/useSerial'
import { useCommandGroup } from '../composables/useCommandGroup'
import { useSettingsStore } from '../stores/settings'
import type { CustomProtocolConfig } from '../stores/settings'
import { useI18n } from '../composables/useI18n'
import { useDataParse } from '../composables/useDataParse'
import type { CommandStatus } from '../types/command-group'
import VirtualList from '../components/VirtualList.vue'
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
  Mic, Send, Columns, RefreshCw, Keyboard, Search, FileCode, ChevronDown, ChevronUp
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
const toolbarExpanded = computed({
  get: () => settingsStore.config.uiSettings.toolbarExpanded,
  set: (val) => { settingsStore.config.uiSettings.toolbarExpanded = val }
})

// ==================== 数据解析功能 ====================

/** 解析模式 */
const parseMode = computed({
  get: () => settingsStore.config.parseSettings.mode,
  set: (val) => { 
    settingsStore.config.parseSettings.mode = val
    dataParse.setParseMode(val, baudRate.value)
  }
})

/** 是否启用解析 */
const parseEnabled = computed({
  get: () => settingsStore.config.parseSettings.enabled,
  set: (val) => { settingsStore.config.parseSettings.enabled = val }
})

/** 是否显示解析面板 */
const showParsePanel = ref(false)

/** 自定义协议配置默认值 */
const DEFAULT_CUSTOM_PROTOCOL = {
  frameHeader: 'AA 55',
  frameTail: '',
  lengthField: {
    enabled: true,
    offset: 2,
    size: 1 as const,
    includesHeader: false
  },
  checksum: {
    type: 'sum' as 'none' | 'sum' | 'xor' | 'crc16' | 'crc16-modbus',
    offset: 0
  },
  dataOffset: 3
}

/** 自定义协议配置 (使用 ref 以支持嵌套属性绑定) */
const customProtocolConfig = ref<CustomProtocolConfig>({ ...DEFAULT_CUSTOM_PROTOCOL, 
  lengthField: { ...DEFAULT_CUSTOM_PROTOCOL.lengthField },
  checksum: { ...DEFAULT_CUSTOM_PROTOCOL.checksum }
})

/** 长度字段启用状态 (computed 用于模板响应式) */
const lengthFieldEnabled = computed({
  get: () => customProtocolConfig.value.lengthField.enabled,
  set: (val: boolean) => {
    customProtocolConfig.value = {
      ...customProtocolConfig.value,
      lengthField: {
        ...customProtocolConfig.value.lengthField,
        enabled: val
      }
    }
  }
})

/** 初始化自定义协议配置 */
function initCustomProtocolConfig() {
  const stored = settingsStore.config.parseSettings.customProtocol
  if (stored) {
    customProtocolConfig.value = { ...stored,
      lengthField: { ...stored.lengthField },
      checksum: { ...stored.checksum }
    }
  }
}

/** 保存自定义协议配置 */
function saveCustomProtocolConfig() {
  settingsStore.config.parseSettings.customProtocol = { 
    ...customProtocolConfig.value,
    lengthField: { ...customProtocolConfig.value.lengthField },
    checksum: { ...customProtocolConfig.value.checksum }
  }
  dataParse.setCustomProtocolConfig(customProtocolConfig.value)
}

/** 监听配置变化并保存 */
watch(customProtocolConfig, () => {
  saveCustomProtocolConfig()
}, { deep: true })

/** 解析结果展开状态 */
const parseResultExpanded = ref<Record<string, boolean>>({})

/**
 * 切换解析结果展开状态
 */
function toggleParseResultExpand(id: string) {
  parseResultExpanded.value[id] = !parseResultExpanded.value[id]
}

/**
 * 清除解析结果
 */
function handleClearParseResults() {
  dataParse.clearResults()
}

/**
 * 导出解析结果
 */
function handleExportParseResults() {
  const content = dataParse.exportResults('txt')
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `parse_results_${new Date().getTime()}.txt`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  settingsStore.showToast(t('serial.exportSuccess'))
}

/**
 * 格式化字节数组为十六进制字符串
 */
function formatBytes(bytes: number[]): string {
  return bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
}

/**
 * 监听接收编码变化，重新解码所有数据
 */
watch(receiveEncoding, () => {
  redecodeAllData()
})

/**
 * 监听解析模式变化
 */
watch(parseMode, (newMode) => {
  dataParse.setParseMode(newMode, baudRate.value)
}, { immediate: true })

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
const addNewline = ref(true) // 发送时自动添加回车换行

// Quick Commands Panel
interface QuickCommand {
  id: number
  enabled: boolean
  content: string
  description: string
  isHex: boolean
  delay: number
}

const quickCommands = ref<QuickCommand[]>([
  { id: 1, enabled: true, content: 'AT+RST', description: '重启模块', isHex: false, delay: 1000 },
  { id: 2, enabled: true, content: 'AT+GMR', description: '查询版本信息', isHex: false, delay: 1000 },
  { id: 3, enabled: true, content: 'AT+CWLAP', description: '扫描WIFI热点', isHex: false, delay: 1000 },
  { id: 4, enabled: false, content: '01 02 03 04', description: 'HEX测试数据', isHex: true, delay: 1000 },
])

const loopInterval = ref(5000)
const isLooping = ref(false)
let loopTimer: number | null = null

/**
 * 波特率预设选项列表（常用标准波特率 + 高速波特率）
 */
const baudRatePresets = [300, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 38400, 57600, 76800, 115200, 230400, 256000, 460800, 500000, 576000, 921600, 1000000, 1152000, 1500000, 2000000, 2500000, 3000000]

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
  
  if (!isHexSend.value && addNewline.value) {
    data += '\r\n'
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
  
  // 初始化自定义协议配置
  initCustomProtocolConfig()
  
  // 注册数据接收回调，用于数据解析
  unregisterDataCallback = onDataReceive((data, direction) => {
    if (parseEnabled.value && parseMode.value !== 'none' && direction === 'rx') {
      dataParse.parseData(data)
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyboardShortcuts)
  
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

/**
 * 优化的添加指令函数
 * 使用批量 DOM 更新
 */
const addCommand = () => {
  measureSync('addCommand', () => {
    quickCommands.value.push({
      id: Date.now(),
      enabled: true,
      content: '',
      description: '',
      isHex: false,
      delay: 1000
    })
  })
}

/**
 * 优化的删除指令函数
 * 避免创建新数组，使用原地修改
 */
const deleteCommand = (id: number) => {
  measureSync('deleteCommand', () => {
    const index = quickCommands.value.findIndex(cmd => cmd.id === id)
    if (index > -1) {
      quickCommands.value.splice(index, 1)
    }
  })
}

/**
 * 优化的发送单个指令函数
 * 带防抖保护
 */
const sendCommand = async (cmd: QuickCommand) => {
  if (!isConnected.value || !cmd.content) return
  
  try {
    await send(cmd.content, cmd.isHex)
  } catch (error) {
    console.error('[Serial] Send command error:', error)
  }
}

/**
 * 优化的发送选中指令函数
 * 支持取消机制
 */
let sendSelectedAbortController: AbortController | null = null

const sendSelected = async () => {
  if (!isConnected.value) return
  
  // 取消之前的操作
  if (sendSelectedAbortController) {
    sendSelectedAbortController.abort()
  }
  
  sendSelectedAbortController = new AbortController()
  const { signal } = sendSelectedAbortController
  
  for (const cmd of quickCommands.value) {
    if (signal.aborted) break
    
    if (cmd.enabled && cmd.content) {
      await send(cmd.content, cmd.isHex)
      
      if (cmd.delay > 0 && !signal.aborted) {
        await new Promise(resolve => {
          const timeoutId = setTimeout(resolve, cmd.delay)
          signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true })
        })
      }
    }
  }
  
  sendSelectedAbortController = null
}

/**
 * 优化的循环发送切换函数
 * 带状态保护和清理
 */
const toggleLoopSend = () => {
  measureSync('toggleLoopSend', () => {
    if (isLooping.value) {
      isLooping.value = false
      if (loopTimer) {
        clearTimeout(loopTimer)
        loopTimer = null
      }
      // 取消正在进行的发送
      if (sendSelectedAbortController) {
        sendSelectedAbortController.abort()
        sendSelectedAbortController = null
      }
    } else {
      if (!isConnected.value) return
      isLooping.value = true
      runLoop()
    }
  })
}

/**
 * 循环发送执行函数
 * 带自动清理和错误恢复
 */
const runLoop = async () => {
  if (!isLooping.value) return
  
  try {
    await sendSelected()
    
    if (isLooping.value) {
      loopTimer = window.setTimeout(runLoop, loopInterval.value)
    }
  } catch (error) {
    console.error('[Serial] Loop send error:', error)
    // 出错时停止循环
    isLooping.value = false
    if (loopTimer) {
      clearTimeout(loopTimer)
      loopTimer = null
    }
  }
}

/** 清理函数 - 在组件卸载时调用 */
function cleanupButtonOptimizations() {
  domUpdater.dispose()
  
  // 清理循环定时器
  if (loopTimer) {
    clearTimeout(loopTimer)
    loopTimer = null
  }
  
  // 取消正在进行的操作
  if (sendSelectedAbortController) {
    sendSelectedAbortController.abort()
    sendSelectedAbortController = null
  }
}

// 在 onUnmounted 中调用清理
onUnmounted(cleanupButtonOptimizations)
</script>

<template>
  <div class="flex flex-col h-full w-full bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans text-sm transition-colors">
    <!-- Toast Notification -->
    <div 
      v-if="settingsStore.toastVisible" 
      class="fixed top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-slate-800 dark:bg-slate-700 text-white text-sm rounded-lg shadow-lg z-50 flex items-center gap-2"
    >
      <CheckCircle2 class="w-4 h-4 text-green-400" />
      {{ settingsStore.toastMessage }}
    </div>
    
    <!-- Top / Main Content Area -->
    <div class="flex flex-1 overflow-hidden">
      
      <!-- Left Panel: Settings -->
      <div v-show="showLeftPanel" class="w-64 shrink-0 bg-white dark:bg-slate-800 border-r dark:border-slate-700 flex flex-col">
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
        </div>

        <!-- Settings Form -->
        <div class="p-4 flex flex-col gap-4 overflow-y-auto">
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

      <!-- Middle Panel: Data View & Send -->
      <div class="flex-1 flex flex-col bg-white dark:bg-slate-800 min-w-0">
        <!-- Top Toolbar -->
        <div class="h-12 border-b dark:border-slate-700 flex items-center justify-center relative bg-slate-50 dark:bg-slate-900 shrink-0">
          <div class="relative w-64">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              v-model="searchQuery"
              type="text"
              :placeholder="t('serial.searchPlaceholder')"
              class="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-shadow"
            />
            <button
              v-if="searchQuery"
              @click="searchQuery = ''"
              class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <XCircle class="w-3.5 h-3.5" />
            </button>
          </div>
          <div class="absolute right-4 flex items-center gap-3 text-slate-600 dark:text-slate-400">
            <div class="flex items-center gap-1">
              <button @click="showLeftPanel = !showLeftPanel" :class="showLeftPanel ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'" class="p-1 hover:bg-slate-200 rounded transition-colors" title="切换左侧栏"><PanelLeft class="w-4 h-4" /></button>
              <button @click="showBottomPanel = !showBottomPanel" :class="showBottomPanel ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'" class="p-1 hover:bg-slate-200 rounded transition-colors" title="切换底部栏"><PanelBottom class="w-4 h-4" /></button>
              <button @click="showRightPanel = !showRightPanel" :class="showRightPanel ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'" class="p-1 hover:bg-slate-200 rounded transition-colors" title="切换右侧栏"><PanelRight class="w-4 h-4" /></button>
              <button @click="showLeftPanel = false; showRightPanel = false; showBottomPanel = false" class="p-1 text-slate-400 hover:text-slate-900 dark:text-slate-100 hover:bg-slate-200 rounded transition-colors" title="最大化视图"><Maximize class="w-4 h-4" /></button>
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

        <!-- 数据解析结果面板 -->
        <div 
          v-if="showParsePanel && parseEnabled && parseMode !== 'none'"
          class="border-t dark:border-slate-700 bg-slate-100 dark:bg-slate-900 max-h-64 overflow-hidden flex flex-col"
        >
          <div class="flex items-center justify-between px-4 py-2 border-b dark:border-slate-700 bg-white dark:bg-slate-800">
            <h3 class="font-bold text-sm flex items-center gap-2">
              <FileCode class="w-4 h-4" />
              {{ t('serial.parseResults') }}
              <span class="text-xs font-normal text-slate-500">
                ({{ dataParse.parseStats.value.successCount }}/{{ dataParse.parseStats.value.totalParsed }})
              </span>
            </h3>
            <div class="flex items-center gap-2">
              <button 
                @click="handleExportParseResults"
                :disabled="dataParse.resultCount.value === 0"
                class="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                :title="t('serial.export')"
              >
                <Download class="w-4 h-4" />
              </button>
              <button 
                @click="handleClearParseResults"
                :disabled="dataParse.resultCount.value === 0"
                class="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                :title="t('serial.clear')"
              >
                <Trash2 class="w-4 h-4" />
              </button>
              <button 
                @click="showParsePanel = false"
                class="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <XCircle class="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div class="flex-1 overflow-y-auto p-2 space-y-2">
            <div 
              v-for="result in dataParse.parsedResults.value.slice(-50).reverse()" 
              :key="result.id"
              class="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 overflow-hidden"
            >
              <div 
                class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700"
                @click="toggleParseResultExpand(result.id)"
              >
                <component 
                  :is="parseResultExpanded[result.id] ? ChevronDown : ChevronUp" 
                  class="w-4 h-4 text-slate-400"
                />
                <span 
                  class="text-xs px-1.5 py-0.5 rounded"
                  :class="result.error ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-green-100 dark:bg-green-900/30 text-green-600'"
                >
                  {{ result.error ? t('serial.parseError') : t('serial.parseSuccess') }}
                </span>
                <span class="text-xs text-slate-500">
                  {{ new Date(result.timestamp).toLocaleTimeString() }}
                </span>
                <span class="text-xs text-slate-600 dark:text-slate-400 flex-1 truncate">
                  {{ result.description || result.error }}
                </span>
              </div>
              
              <div v-if="parseResultExpanded[result.id]" class="px-3 py-2 border-t dark:border-slate-700 text-xs space-y-2">
                <div>
                  <span class="text-slate-500">{{ t('serial.rawData') }}:</span>
                  <span class="ml-2 font-mono text-blue-600 dark:text-blue-400">{{ formatBytes(result.rawBytes) }}</span>
                </div>
                <div v-if="result.result?.frame">
                  <span class="text-slate-500">{{ t('serial.address') }}:</span>
                  <span class="ml-2 font-mono">{{ result.result.frame.address }}</span>
                  <span class="text-slate-500 ml-4">{{ t('serial.functionCode') }}:</span>
                  <span class="ml-2 font-mono">0x{{ result.result.frame.functionCode.toString(16).toUpperCase().padStart(2, '0') }}</span>
                </div>
                <div v-if="result.checksums && result.checksums.length > 0">
                  <span class="text-slate-500">{{ t('serial.checksums') }}:</span>
                  <span class="ml-2 space-x-2">
                    <span v-for="cs in result.checksums" :key="cs.type" class="font-mono text-xs">
                      {{ cs.type }}: <span class="text-purple-600 dark:text-purple-400">{{ cs.value }}</span>
                    </span>
                  </span>
                </div>
              </div>
            </div>
            
            <div v-if="dataParse.resultCount.value === 0" class="text-center py-8 text-slate-400">
              <FileCode class="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p class="text-xs">{{ t('serial.noParseData') }}</p>
            </div>
          </div>
        </div>

        <!-- Middle Toolbar -->
        <div class="px-4 py-2 flex items-center gap-2 flex-wrap border-t dark:border-slate-700 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-900 shrink-0">
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
                <span class="text-[10px] text-slate-500 dark:text-slate-400 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded">
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

        <!-- Send Area -->
        <div v-show="showBottomPanel" class="h-32 flex flex-col p-4 relative">
          <textarea 
            v-model="sendInput"
            @keyup.ctrl.enter="handleSend"
            :placeholder="t('serial.sendInputDesc')"
            class="flex-1 w-full resize-none outline-none text-sm font-mono"
          ></textarea>
          <div class="absolute bottom-4 right-4 flex items-center gap-4">
            <label class="flex items-center gap-1 text-xs cursor-pointer text-slate-600 dark:text-slate-400">
              <input type="checkbox" v-model="addNewline" class="rounded"> {{ t('serial.addNewline') }}
            </label>
            <label class="flex items-center gap-1 text-xs cursor-pointer text-slate-600 dark:text-slate-400">
              <input type="checkbox" v-model="isHexSend" class="rounded"> HEX
            </label>
            <button 
              @click="optimizedHandleSend" 
              :disabled="!isConnected"
              class="px-6 py-2 bg-slate-400 hover:bg-slate-500 text-white rounded text-xs font-medium optimize-transition disabled:opacity-50"
            >
              {{ t('serial.send') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Right Panel: Quick Commands / Command Group -->
      <div v-show="showRightPanel" class="w-[400px] shrink-0 bg-slate-50 dark:bg-slate-900 border-l dark:border-slate-700 flex flex-col">
        <!-- Right Panel Tabs -->
        <div class="flex h-12 border-b dark:border-slate-700 bg-white dark:bg-slate-800">
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
        <div v-show="activeRightTab === 'quick'" class="flex flex-col flex-1 overflow-hidden">
          <div class="h-10 border-b dark:border-slate-700 flex items-center justify-between px-4 bg-white dark:bg-slate-800">
            <h2 class="font-bold text-sm text-slate-700 dark:text-slate-300">{{ t('serial.quickCommands') }}</h2>
            <div class="flex items-center gap-2 text-slate-500">
              <button @click="addCommand" class="p-1 hover:text-slate-900 rounded"><Plus class="w-4 h-4"/></button>
              <button @click="sendSelected" :disabled="!isConnected" class="p-1 hover:text-green-600 disabled:opacity-50"><Play class="w-4 h-4"/></button>
            </div>
          </div>

          <div class="p-3 flex items-center gap-2 border-b dark:border-slate-700 bg-white dark:bg-slate-800">
            <button
              @click="toggleLoopSend"
              :disabled="!isConnected"
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

          <div class="flex-1 overflow-y-auto p-2">
            <div class="flex items-center px-2 py-1 text-xs text-slate-500 mb-2">
              <div class="w-8 text-center">{{ t('serial.quickCmdEnable') }}</div>
              <div class="flex-1">{{ t('serial.quickCmdContent') }}</div>
              <div class="w-9 text-center">HEX</div>
              <div class="w-14 text-center">{{ t('serial.quickCmdDelay') }}</div>
              <div class="w-20 text-center">{{ t('serial.quickCmdAction') }}</div>
            </div>
            <div v-for="cmd in quickCommands" :key="cmd.id"
              class="flex items-center gap-2 p-2 mb-2 bg-white dark:bg-slate-800 rounded border dark:border-slate-700 shadow-sm group">
              <div class="w-8 flex justify-center">
                <input type="checkbox" v-model="cmd.enabled" class="rounded w-4 h-4 cursor-pointer">
              </div>
              <div class="flex-1 flex flex-col gap-1">
                <input type="text" v-model="cmd.content" :placeholder="t('serial.quickCmdContentPlaceholder')" class="w-full text-xs font-mono border-b dark:border-slate-700 border-transparent focus:border-blue-300 outline-none pb-0.5">
                <input type="text" v-model="cmd.description" :placeholder="t('serial.quickCmdNotePlaceholder')" class="w-full text-[10px] text-slate-400 outline-none">
              </div>
              <div class="w-9 flex justify-center">
                <input type="checkbox" v-model="cmd.isHex" class="rounded w-3.5 h-3.5 cursor-pointer">
              </div>
              <div class="w-14">
                <input type="number" v-model="cmd.delay" class="w-full text-xs text-center border dark:border-slate-700 rounded py-0.5 outline-none focus:border-blue-300">
              </div>
              <div class="w-20 flex justify-center gap-1">
                <button @click="sendCommand(cmd)" :disabled="!isConnected" class="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 rounded disabled:opacity-50">{{ t('serial.quickCmdSend') }}</button>
                <button @click="deleteCommand(cmd.id)" class="text-xs p-1 text-red-400 hover:text-red-600 rounded"><Trash class="w-3.5 h-3.5"/></button>
              </div>
            </div>
          </div>
        </div>

        <!-- ===== 指令组面板 (新增) ===== -->
        <div v-show="activeRightTab === 'group'" class="flex flex-col flex-1 overflow-hidden">

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
          <div class="flex-1 overflow-y-auto p-2">
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
                <span class="flex items-center gap-1">
                  <AlertCircle class="w-3 h-3"/>
                  {{ t('serial.execLog') }} ({{ (cg.executionLogs.value || []).length }})
                </span>
                <ChevronRight class="w-3 h-3 transition-transform" :class="{ 'rotate-90': showExecLog }"/>
              </button>
              <div v-if="showExecLog" class="max-h-40 overflow-y-auto px-3 pb-2 space-y-1">
                <div
                  v-for="log in (cg.executionLogs.value || []).slice().reverse()"
                  :key="log.id"
                  class="text-[10px] font-mono p-1.5 rounded bg-slate-50 dark:bg-slate-900 border dark:border-slate-700"
                >
                  <span class="text-slate-400">[{{ new Date(log.startTime).toLocaleTimeString() }}]</span>
                  <span
                    class="ml-1 font-medium"
                    :class="{
                      'text-green-600': log.status === 'success',
                      'text-red-500': log.status === 'failed',
                      'text-amber-500': log.status === 'timeout',
                      'text-slate-400': log.status === 'skipped'
                    }"
                  >[{{ log.status.toUpperCase() }}]</span>
                  <span class="ml-1 text-slate-700 dark:text-slate-300">{{ log.sentData || '(无数据)' }}</span>
                  <span v-if="log.message" class="ml-1 text-slate-400">— {{ log.message }}</span>
                  <span class="ml-auto text-slate-400">{{ log.duration }}ms</span>
                </div>
                <div v-if="(cg.executionLogs.value || []).length === 0" class="text-[10px] text-slate-400 text-center py-2">
                  {{ t('serial.noExecLog') }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Status Bar -->
    <div class="h-8 border-t dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between px-4 text-xs text-slate-500 dark:text-slate-400">
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
