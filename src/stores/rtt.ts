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
} from '../types/rtt'
import { rttService } from '../services/rttService'

/** 最大保留日志条数 */
const MAX_LOG_ENTRIES = 50000

/** 批量更新缓冲区大小 */
const BATCH_SIZE = 100

/** 批量更新间隔（ms） */
const BATCH_INTERVAL = 16

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

  /** 批量更新缓冲区 */
  const batchBuffer = ref<RttLogEntry[]>([])

  /** 批量更新定时器 */
  let batchTimer: ReturnType<typeof setTimeout> | null = null

  /** 日志 ID 计数器 */
  let logIdCounter = 0

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

  /** 日志统计 */
  const logStats = computed(() => {
    const total = logs.value.length
    const errors = logs.value.filter((e) => e.level === 'error').length
    const warnings = logs.value.filter((e) => e.level === 'warn').length
    return { total, errors, warnings }
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
   */
  function flushBatch(): void {
    if (batchTimer) {
      clearTimeout(batchTimer)
      batchTimer = null
    }

    if (batchBuffer.value.length === 0) return

    const newEntries = batchBuffer.value
    batchBuffer.value = []

    logs.value.push(...newEntries)

    if (logs.value.length > MAX_LOG_ENTRIES) {
      logs.value = logs.value.slice(logs.value.length - MAX_LOG_ENTRIES)
    }
  }

  /**
   * 建立 RTT 连接
   */
  function connect(): void {
    if (connectionState.value === 'connected' || connectionState.value === 'connecting') return

    connectionState.value = 'connecting'
    errorMessage.value = ''

    if (!rttService.isWsConnected) {
      rttService.connectWs()
    }

    const config = buildConnectConfig()
    rttService.connectRtt(config)
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
   * 清空日志
   */
  function clearLogs(): void {
    flushBatch()
    logs.value = []
    logIdCounter = 0
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
    chipModel,
    protocol,
    openocdHost,
    openocdPort,
    jlinkHost,
    jlinkPort,

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
    exportLogs,
    exportSession,
    cleanup,
    flushBatch,
    buildConnectConfig,
  }
})
