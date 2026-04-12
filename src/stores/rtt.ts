import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  RttLogEntry,
  RttConnectionState,
  RttBackend,
  RttFilter,
  ProbeInfo,
  RttChannel,
  RttConnectConfig,
  BackendCapabilities,
} from '../types/rtt'
import { rttService } from '../services/rttService'

/** 最大保留日志条数 */
const MAX_LOG_ENTRIES = 50000

/** 日志淘汰时保留的条数（避免频繁淘汰） */
const LOG_TRIM_TARGET = 40000

/** 批量更新缓冲区大小 */
const BATCH_SIZE = 100

/** 批量更新间隔（ms） */
const BATCH_INTERVAL = 16

/** 后端使用条件说明 */
export const BACKEND_REQUIREMENTS: Record<string, { title: string; requirements: string[]; setup: string[] }> = {
  'probe-rs': {
    title: 'probe-rs 后端',
    requirements: [
      'probe-rs 工具已安装并添加到 PATH',
      'ELF 文件路径（编译后的固件）',
      '芯片型号（如 STM32F407VGTx）',
      '调试探针已连接（ST-Link / J-Link / DAPLink）',
    ],
    setup: [
      '1. 安装 probe-rs: https://probe.rs/docs/getting-started/installation',
      '2. 编译固件并获取 ELF 文件路径',
      '3. 连接调试探针到目标板',
      '4. 填写芯片型号和 ELF 路径',
      '5. 点击连接',
    ],
  },
  'openocd': {
    title: 'OpenOCD 后端',
    requirements: [
      'OpenOCD 已安装并添加到 PATH',
      'OpenOCD 已启动并连接目标',
      'OpenOCD 配置了 RTT 支持',
      'RTT TCP 服务已启动（默认端口 9090）',
    ],
    setup: [
      '1. 安装 OpenOCD: http://openocd.org/',
      '2. 创建 OpenOCD 配置文件，添加 RTT 支持',
      '3. 启动 OpenOCD: openocd -f your_config.cfg',
      '4. 确保 RTT TCP 服务已启动',
      '5. 填写主机地址和端口',
    ],
  },
  'jlink': {
    title: 'J-Link 后端',
    requirements: [
      'J-Link 调试器已连接',
      'J-Link GDB Server 已启动',
      'RTT 已在 GDB Server 中启用',
      'RTT Telnet 服务已启动（默认端口 19021）',
    ],
    setup: [
      '1. 安装 J-Link 软件: https://www.segger.com/downloads/jlink/',
      '2. 连接 J-Link 调试器到目标板',
      '3. 启动 J-Link GDB Server 并连接目标',
      '4. 在 GDB Server 中启用 RTT',
      '5. 填写主机地址和 Telnet 端口',
    ],
  },
  'webusb': {
    title: 'WebUSB 直连',
    requirements: [
      'Chrome/Edge 89+ 浏览器',
      'ST-Link V2 / V2-1 / V3 调试器',
      '目标程序已集成 RTT（SEGGER_RTT.c/h）',
      '目标程序正在运行',
    ],
    setup: [
      '1. 在 Keil 中集成 RTT 库（参考 rtt-lib/SEGGER_RTT/README.md）',
      '2. 编译并下载程序到目标',
      '3. 确保目标程序正在运行',
      '4. 点击「选择设备」选择 ST-Link',
      '5. 点击连接',
    ],
  },
}

export const useRttStore = defineStore('rtt', () => {
  // ==================== State ====================

  /** 日志条目数组 */
  const logs = ref<RttLogEntry[]>([])

  /** 连接状态 */
  const connectionState = ref<RttConnectionState>('disconnected')

  /** 当前后端类型 */
  const backend = ref<RttBackend>('probe-rs')

  /** 选中的探针 */
  const selectedProbe = ref<string>('')

  /** 可用探针列表 */
  const probes = ref<ProbeInfo[]>([])

  /** 可用 RTT 通道列表 */
  const channels = ref<RttChannel[]>([])

  /** 过滤器 */
  const filter = ref<RttFilter>({
    levels: ['debug', 'info', 'warn', 'error', 'trace'],
    channels: [],
    searchText: '',
  })

  /** 是否暂停日志接收 */
  const isPaused = ref(false)

  /** 是否自动滚动 */
  const autoScroll = ref(true)

  /** 错误消息 */
  const errorMessage = ref('')

  /** probe-rs 芯片型号 */
  const chipModel = ref('STM32F407VGTx')

  /** probe-rs ELF 文件路径 */
  const elfPath = ref('')

  /** probe-rs 调试协议 */
  const protocol = ref<'Swd' | 'Jtag'>('Swd')

  /** OpenOCD 主机地址 */
  const openocdHost = ref('127.0.0.1')

  /** OpenOCD 端口 */
  const openocdPort = ref(9090)

  /** J-Link 主机地址 */
  const jlinkHost = ref('127.0.0.1')

  /** J-Link 端口 */
  const jlinkPort = ref(19021)

  /** 后端能力信息 */
  const backendCapabilities = ref<BackendCapabilities[]>([])

  /** 批量更新缓冲区 */
  const batchBuffer = ref<RttLogEntry[]>([])

  /** 批量更新定时器 */
  let batchTimer: ReturnType<typeof setTimeout> | null = null

  /** 日志 ID 计数器 */
  let logIdCounter = 0

  /** 错误日志计数器（增量统计，避免全量扫描） */
  let errorCount = 0

  /** 警告日志计数器（增量统计，避免全量扫描） */
  let warnCount = 0

  // ==================== Getters ====================

  /** 过滤后的日志 */
  const filteredLogs = computed(() => {
    const { levels, channels: filterChannels, searchText } = filter.value
    const hasLevelFilter = levels.length < 5
    const hasChannelFilter = filterChannels.length > 0
    const hasSearch = searchText.trim().length > 0
    const lowerSearch = searchText.toLowerCase().trim()

    if (!hasLevelFilter && !hasChannelFilter && !hasSearch) {
      return logs.value
    }

    return logs.value.filter((entry) => {
      if (hasLevelFilter && !levels.includes(entry.level)) return false
      if (hasChannelFilter && !filterChannels.includes(entry.channel)) return false
      if (hasSearch && !entry.text.toLowerCase().includes(lowerSearch)) return false
      return true
    })
  })

  /** 仅错误日志 */
  const errorLogs = computed(() => {
    return logs.value.filter((entry) => entry.level === 'error')
  })

  /** 日志统计（使用增量计数器，O(1) 复杂度） */
  const logStats = computed(() => {
    return { total: logs.value.length, errors: errorCount, warnings: warnCount }
  })

  /** 是否已连接 */
  const isConnected = computed(() => connectionState.value === 'connected')

  // ==================== Actions ====================

  /**
   * 初始化服务回调
   */
  function initServiceCallbacks(): void {
    rttService.registerCallbacks({
      onConnected: (be) => {
        connectionState.value = 'connected'
        backend.value = be
        errorMessage.value = ''
      },
      onDisconnected: () => {
        connectionState.value = 'disconnected'
      },
      onData: (entry) => {
        if (!isPaused.value) {
          addToBatch(entry)
        }
      },
      onError: (error) => {
        errorMessage.value = error
        if (connectionState.value === 'connecting') {
          connectionState.value = 'error'
        }
      },
      onProbeList: (probeList) => {
        probes.value = probeList
      },
      onChannels: (channelList) => {
        channels.value = channelList
        if (filter.value.channels.length === 0 && channelList.length > 0) {
          filter.value.channels = channelList.map((c) => c.number)
        }
      },
      onFileSelected: (filePath) => {
        elfPath.value = filePath
      },
      onCapabilities: (capabilities) => {
        backendCapabilities.value = capabilities
      },
    })
  }

  /**
   * 添加日志到批量缓冲区
   * @param entry 日志条目
   */
  function addToBatch(entry: RttLogEntry): void {
    batchBuffer.value.push({ ...entry, id: ++logIdCounter })

    if (batchBuffer.value.length >= BATCH_SIZE) {
      flushBatch()
    } else if (!batchTimer) {
      batchTimer = setTimeout(flushBatch, BATCH_INTERVAL)
    }
  }

  /**
   * 刷新批量缓冲区，将日志写入主数组
   * 使用 splice 替代 spread + push，避免大数组参数展开
   */
  function flushBatch(): void {
    if (batchTimer) {
      clearTimeout(batchTimer)
      batchTimer = null
    }

    if (batchBuffer.value.length === 0) return

    const newEntries = batchBuffer.value
    batchBuffer.value = []

    // 增量更新统计计数器
    for (let i = 0; i < newEntries.length; i++) {
      if (newEntries[i].level === 'error') errorCount++
      else if (newEntries[i].level === 'warn') warnCount++
    }

    // 使用 splice 插入，避免 spread 展开大数组
    const startIdx = logs.value.length
    logs.value.splice(startIdx, 0, ...newEntries)

    // 超过上限时淘汰旧日志，使用 splice 替代 slice 避免全量复制
    if (logs.value.length > MAX_LOG_ENTRIES) {
      const removeCount = logs.value.length - LOG_TRIM_TARGET
      const removed = logs.value.splice(0, removeCount)
      // 重新计算淘汰日志中的计数器
      for (let i = 0; i < removed.length; i++) {
        if (removed[i].level === 'error') errorCount--
        else if (removed[i].level === 'warn') warnCount--
      }
    }
  }

  /**
   * 建立 RTT 连接
   */
  function connect(): void {
    if (connectionState.value === 'connected' || connectionState.value === 'connecting') return

    // 验证配置
    const validationError = validateConfig()
    if (validationError) {
      errorMessage.value = validationError
      connectionState.value = 'error'
      return
    }

    connectionState.value = 'connecting'
    errorMessage.value = ''

    if (!rttService.isWsConnected) {
      rttService.connectWs()
    }

    const config = buildConnectConfig()
    rttService.connectRtt(config)
  }

  /**
   * 验证连接配置
   * @returns 错误消息，无错误返回空字符串
   */
  function validateConfig(): string {
    switch (backend.value) {
      case 'probe-rs':
        if (!elfPath.value.trim()) {
          return 'probe-rs 需要 ELF 文件路径。请点击文件路径输入框选择编译好的固件文件（.elf/.axf/.out）。'
        }
        if (!chipModel.value.trim()) {
          return '请填写芯片型号（如 STM32F407VGTx）'
        }
        break
      case 'openocd':
        if (!openocdHost.value.trim()) {
          return '请填写 OpenOCD 主机地址'
        }
        if (!openocdPort.value || openocdPort.value <= 0) {
          return '请填写有效的 OpenOCD 端口号'
        }
        break
      case 'jlink':
        if (!jlinkHost.value.trim()) {
          return '请填写 J-Link 主机地址'
        }
        if (!jlinkPort.value || jlinkPort.value <= 0) {
          return '请填写有效的 J-Link 端口号'
        }
        break
      case 'webusb':
        // WebUSB 由浏览器直接管理，无需额外配置验证
        break
    }
    return ''
  }

  /**
   * 断开 RTT 连接
   */
  function disconnect(): void {
    rttService.disconnectRtt()
    connectionState.value = 'disconnected'
  }

  /**
   * 发送数据到 MCU
   * @param data 文本数据
   * @param channel 目标通道号
   */
  function send(data: string, channel?: number): void {
    rttService.sendData(data, channel)
  }

  /**
   * 清空日志并重置所有计数器
   */
  function clearLogs(): void {
    flushBatch()
    logs.value = []
    logIdCounter = 0
    errorCount = 0
    warnCount = 0
  }

  /**
   * 设置过滤器
   * @param newFilter 新的过滤器配置
   */
  function setFilter(newFilter: Partial<RttFilter>): void {
    filter.value = { ...filter.value, ...newFilter }
  }

  /**
   * 切换暂停状态
   */
  function togglePause(): void {
    isPaused.value = !isPaused.value
  }

  /**
   * 刷新探针列表
   */
  function refreshProbes(): void {
    if (!rttService.isWsConnected) {
      rttService.connectWs()
    }
    rttService.listProbes()
  }

  /**
   * 选择 ELF 文件
   */
  function selectElfFile(): void {
    if (!rttService.isWsConnected) {
      rttService.connectWs()
    }
    rttService.selectFile([
      { name: 'ELF/AXF Files', extensions: ['elf', 'axf', 'out'] },
      { name: 'ELF Files', extensions: ['elf'] },
      { name: 'AXF Files', extensions: ['axf'] },
      { name: 'All Files', extensions: ['*'] },
    ])
  }

  /**
   * 检测后端能力
   */
  function checkCapabilities(): void {
    if (!rttService.isWsConnected) {
      rttService.connectWs()
    }
    rttService.checkCapabilities()
  }

  /**
   * 获取当前后端的能力信息
   */
  function getCurrentBackendCapability(): BackendCapabilities | undefined {
    return backendCapabilities.value.find((c) => c.name === backend.value)
  }

  /**
   * 检查当前后端是否可用
   */
  function isCurrentBackendAvailable(): boolean {
    const capability = getCurrentBackendCapability()
    return capability?.available ?? false
  }

  /**
   * 导出日志
   * @returns 导出的文本内容
   */
  function exportLogs(): string {
    flushBatch()
    const formatTimestamp = (ts: number) => {
      const d = new Date(ts)
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`
    }

    return filteredLogs.value
      .map((e) => `[${formatTimestamp(e.timestamp)}] [${e.level.toUpperCase().padEnd(5)}] [Ch${e.channel}] ${e.text}`)
      .join('\n')
  }

  /**
   * 导出 RTT 会话
   * @returns 会话导出对象
   */
  function exportSession(): string {
    flushBatch()
    const session = {
      exportTime: Date.now(),
      config: buildConnectConfig(),
      logs: filteredLogs.value,
    }
    return JSON.stringify(session, null, 2)
  }

  /**
   * 构建连接配置
   * @returns 连接配置对象
   */
  function buildConnectConfig(): RttConnectConfig {
    switch (backend.value) {
      case 'probe-rs':
        return {
          backend: 'probe-rs',
          probeRs: {
            elfPath: elfPath.value,
            chip: chipModel.value,
            protocol: protocol.value,
            probe: selectedProbe.value || undefined,
          },
        }
      case 'openocd':
        return {
          backend: 'openocd',
          openocd: {
            host: openocdHost.value,
            port: openocdPort.value,
            channel: 0,
          },
        }
      case 'jlink':
        return {
          backend: 'jlink',
          jlink: {
            host: jlinkHost.value,
            port: jlinkPort.value,
            channel: 0,
          },
        }
      case 'webusb':
        return {
          backend: 'webusb',
        }
      default:
        return {
          backend: 'probe-rs',
        }
    }
  }

  /**
   * 断开所有连接并清理资源
   */
  function cleanup(): void {
    flushBatch()
    if (connectionState.value === 'connected') {
      disconnect()
    }
    rttService.disconnectWs()
  }

  // 初始化服务回调
  initServiceCallbacks()

  return {
    // State
    logs,
    connectionState,
    backend,
    selectedProbe,
    probes,
    channels,
    filter,
    isPaused,
    autoScroll,
    errorMessage,
    elfPath,
    chipModel,
    protocol,
    openocdHost,
    openocdPort,
    jlinkHost,
    jlinkPort,
    backendCapabilities,

    // Getters
    filteredLogs,
    errorLogs,
    logStats,
    isConnected,

    // Actions
    connect,
    disconnect,
    send,
    clearLogs,
    setFilter,
    togglePause,
    refreshProbes,
    selectElfFile,
    checkCapabilities,
    getCurrentBackendCapability,
    isCurrentBackendAvailable,
    exportLogs,
    exportSession,
    cleanup,
    addToBatch,
    flushBatch,
    buildConnectConfig,
    validateConfig,
  }
})
