/**
 * 网络调试 Composable
 * 提供网络连接、数据收发、状态管理等功能
 */

import { ref, computed, onUnmounted } from 'vue'
import type { 
  ConnectionStatus, 
  DataDirection, 
  DataFormat,
  NetworkConfig,
  NetworkStats,
  NetworkDataLog,
  ClientConnection
} from '../types/network'
import { bytesToHex, hexToBytes, calculateAllChecksums } from '../utils/checksum'

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 网络调试 Composable
 */
export function useNetwork() {
  /** 连接状态 */
  const status = ref<ConnectionStatus>('disconnected')
  
  /** 网络配置 */
  const config = ref<NetworkConfig>({
    mode: 'tcp-client',
    tcpClient: {
      host: '127.0.0.1',
      port: 8080,
      timeout: 5000,
      retryCount: 5,
      retryInterval: 1000
    },
    tcpServer: {
      port: 8080,
      maxConnections: 10
    },
    udp: {
      localPort: 8080,
      targets: []
    }
  })

  /** 统计数据 */
  const stats = ref<NetworkStats>({
    bytesReceived: 0,
    bytesSent: 0,
    receiveRate: 0,
    sendRate: 0,
    packetLoss: 0,
    connectionCount: 0
  })

  /** 客户端连接列表 (服务器模式) */
  const connections = ref<ClientConnection[]>([])

  /** 数据日志 */
  const dataLogs = ref<NetworkDataLog[]>([])

  /** 错误信息 */
  const error = ref<string | undefined>()

  /** WebSocket 实例 */
  let ws: WebSocket | null = null

  /** 重连计时器 */
  let reconnectTimer: number | null = null

  /** 统计更新计时器 */
  let statsTimer: number | null = null

  /** 上次统计时间 */
  let lastStatsTime: number = Date.now()
  let lastBytesReceived: number = 0
  let lastBytesSent: number = 0

  /** 是否已连接 */
  const isConnected = computed(() => status.value === 'connected')

  /** 是否正在连接 */
  const isConnecting = computed(() => status.value === 'connecting')

  /**
   * 添加数据日志
   */
  function addDataLog(
    direction: DataDirection, 
    data: string, 
    format: DataFormat,
    clientId?: string
  ): void {
    const log: NetworkDataLog = {
      id: generateId(),
      timestamp: Date.now(),
      direction,
      data,
      format,
      clientId
    }
    dataLogs.value.push(log)
    
    if (dataLogs.value.length > 10000) {
      dataLogs.value = dataLogs.value.slice(-5000)
    }
  }

  /**
   * 更新统计速率
   */
  function updateStatsRate(): void {
    const now = Date.now()
    const elapsed = (now - lastStatsTime) / 1000
    
    if (elapsed > 0) {
      stats.value.receiveRate = (stats.value.bytesReceived - lastBytesReceived) / elapsed
      stats.value.sendRate = (stats.value.bytesSent - lastBytesSent) / elapsed
    }
    
    lastStatsTime = now
    lastBytesReceived = stats.value.bytesReceived
    lastBytesSent = stats.value.bytesSent
  }

  /**
   * 连接到 WebSocket 服务器
   * 注意：浏览器环境无法直接建立 TCP 连接，此功能使用 WebSocket 协议
   * WebSocket 适用于与支持 WebSocket 的服务器通信
   */
  async function connectTcpClient(): Promise<void> {
    if (status.value === 'connected' || status.value === 'connecting') {
      return
    }

    status.value = 'connecting'
    error.value = undefined

    const { host, port } = config.value.tcpClient
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${host}:${port}`

    return new Promise((resolve, reject) => {
      try {
        ws = new WebSocket(wsUrl)
        
        ws.onopen = () => {
          status.value = 'connected'
          stats.value.connectionCount = 1
          addDataLog('rx', `已连接到 ${host}:${port}`, 'ascii')
          startStatsTimer()
          resolve()
        }

        ws.onmessage = (event) => {
          const data = event.data
          const bytes = typeof data === 'string' 
            ? new TextEncoder().encode(data) 
            : new Uint8Array(data)
          
          stats.value.bytesReceived += bytes.length
          addDataLog('rx', typeof data === 'string' ? data : bytesToHex(Array.from(bytes)), 
            typeof data === 'string' ? 'ascii' : 'hex')
        }

        ws.onerror = () => {
          error.value = '连接错误'
          status.value = 'error'
          reject(new Error('连接错误'))
        }

        ws.onclose = () => {
          if (status.value === 'connected') {
            handleDisconnect()
          }
        }
      } catch (e) {
        status.value = 'error'
        error.value = e instanceof Error ? e.message : '连接失败'
        reject(e)
      }
    })
  }

  /**
   * 发送数据
   */
  async function send(data: string, format: DataFormat = 'ascii'): Promise<boolean> {
    if (!ws || status.value !== 'connected') {
      error.value = '未连接'
      return false
    }

    try {
      let bytes: number[]
      
      if (format === 'hex') {
        bytes = hexToBytes(data.replace(/\s+/g, ''))
      } else {
        bytes = Array.from(new TextEncoder().encode(data))
      }

      if (config.value.mode === 'tcp-client' || config.value.mode === 'tcp-server') {
        ws.send(new Uint8Array(bytes))
      }

      stats.value.bytesSent += bytes.length
      addDataLog('tx', data, format)
      
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : '发送失败'
      return false
    }
  }

  /**
   * 处理断开连接
   */
  function handleDisconnect(): void {
    status.value = 'disconnected'
    stats.value.connectionCount = 0
    
    if (ws) {
      ws.close()
      ws = null
    }

    stopStatsTimer()
    addDataLog('rx', '连接已断开', 'ascii')

    if (config.value.tcpClient.retryCount > 0 && reconnectTimer === null) {
      scheduleReconnect()
    }
  }

  /**
   * 安排重连
   */
  function scheduleReconnect(): void {
    let retryCount = 0
    const maxRetry = config.value.tcpClient.retryCount
    const interval = config.value.tcpClient.retryInterval

    reconnectTimer = window.setInterval(async () => {
      if (retryCount >= maxRetry || status.value === 'connected') {
        if (reconnectTimer) {
          clearInterval(reconnectTimer)
          reconnectTimer = null
        }
        return
      }

      retryCount++
      addDataLog('rx', `正在重连... (${retryCount}/${maxRetry})`, 'ascii')
      
      try {
        await connectTcpClient()
      } catch {
        // 继续重试
      }
    }, interval)
  }

  /**
   * 开始统计计时器
   */
  function startStatsTimer(): void {
    statsTimer = window.setInterval(updateStatsRate, 1000)
  }

  /**
   * 停止统计计时器
   */
  function stopStatsTimer(): void {
    if (statsTimer) {
      clearInterval(statsTimer)
      statsTimer = null
    }
  }

  /**
   * 断开连接
   */
  function disconnect(): void {
    if (reconnectTimer) {
      clearInterval(reconnectTimer)
      reconnectTimer = null
    }

    if (ws) {
      ws.close()
      ws = null
    }

    status.value = 'disconnected'
    stats.value.connectionCount = 0
    stopStatsTimer()
  }

  /**
   * 清空日志
   */
  function clearLogs(): void {
    dataLogs.value = []
  }

  /**
   * 清空统计
   */
  function resetStats(): void {
    stats.value = {
      bytesReceived: 0,
      bytesSent: 0,
      receiveRate: 0,
      sendRate: 0,
      packetLoss: 0,
      connectionCount: stats.value.connectionCount
    }
    lastBytesReceived = 0
    lastBytesSent = 0
  }

  /**
   * 导出日志
   */
  function exportLogs(format: 'csv' | 'txt'): string {
    const headers = ['时间', '方向', '数据', '格式']
    const rows = dataLogs.value.map(log => [
      new Date(log.timestamp).toISOString(),
      log.direction.toUpperCase(),
      log.data,
      log.format.toUpperCase()
    ])

    if (format === 'csv') {
      const csvRows = [headers.join(','), ...rows.map(r => r.join(','))]
      return csvRows.join('\n')
    } else {
      const txtRows = rows.map(r => `[${r[0]}] ${r[1]}: ${r[2]}`)
      return txtRows.join('\n')
    }
  }

  /**
   * 计算校验值
   */
  function calculateChecksum(data: string, format: DataFormat): ReturnType<typeof calculateAllChecksums> {
    const bytes = format === 'hex' 
      ? hexToBytes(data.replace(/\s+/g, ''))
      : Array.from(new TextEncoder().encode(data))
    
    return calculateAllChecksums(bytes)
  }

  /**
   * 格式化速率显示
   */
  function formatRate(bytesPerSecond: number): string {
    if (bytesPerSecond < 1024) {
      return `${bytesPerSecond.toFixed(0)} B/s`
    } else if (bytesPerSecond < 1024 * 1024) {
      return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`
    } else {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`
    }
  }

  onUnmounted(() => {
    disconnect()
  })

  return {
    status,
    config,
    stats,
    connections,
    dataLogs,
    error,
    isConnected,
    isConnecting,
    connectTcpClient,
    disconnect,
    send,
    clearLogs,
    resetStats,
    exportLogs,
    calculateChecksum,
    formatRate
  }
}
