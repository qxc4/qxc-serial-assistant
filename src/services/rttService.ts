import type {
  RttConnectConfig,
  RttLogEntry,
  ProbeInfo,
  RttChannel,
  ClientMessage,
  ServerMessage,
  ServerMessageType,
  RttServiceConfig,
  RttBackend,
  BackendCapabilities,
} from '../types/rtt'

/** 默认服务配置 */
const DEFAULT_CONFIG: RttServiceConfig = {
  wsUrl: 'ws://127.0.0.1:19022',
  autoReconnect: true,
  reconnectInterval: 3000,
  maxReconnectAttempts: 5,
  heartbeatInterval: 30000,
  heartbeatTimeout: 10000,
}

/** 事件回调类型 */
export interface RttServiceCallbacks {
  onConnected?: (backend: RttBackend) => void
  onDisconnected?: () => void
  onData?: (entry: RttLogEntry) => void
  onError?: (error: string) => void
  onProbeList?: (probes: ProbeInfo[]) => void
  onChannels?: (channels: RttChannel[]) => void
  onFileSelected?: (filePath: string) => void
  onCapabilities?: (capabilities: BackendCapabilities[]) => void
}

/**
 * RTT 服务层
 * Web 版：连接外部 RTT Bridge 服务
 */
class RttService {
  private ws: WebSocket | null = null
  private config: RttServiceConfig
  private callbacks: RttServiceCallbacks = {}
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private isIntentionalDisconnect = false
  private _isWsConnected = false
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null

  constructor(config: Partial<RttServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 获取 WebSocket 连接状态
   */
  get isWsConnected(): boolean {
    return this._isWsConnected
  }

  /**
   * 注册事件回调
   */
  registerCallbacks(callbacks: RttServiceCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }

  /**
   * 建立 WebSocket 连接
   */
  connectWs(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return

    this.isIntentionalDisconnect = false

    try {
      this.ws = new WebSocket(this.config.wsUrl)
    } catch (err) {
      this.callbacks.onError?.(`WebSocket 创建失败: ${err instanceof Error ? err.message : String(err)}`)
      return
    }

    this.ws.onopen = () => {
      this._isWsConnected = true
      this.reconnectAttempts = 0
      this.startHeartbeat()
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage
        // 处理心跳响应
        if (msg.type === 'pong' as ServerMessageType) {
          this.clearHeartbeatTimeout()
          return
        }
        this.handleServerMessage(msg)
      } catch {
        // 忽略解析失败的消息
      }
    }

    this.ws.onclose = (event: CloseEvent) => {
      this._isWsConnected = false
      this.stopHeartbeat()
      this.callbacks.onDisconnected?.()

      // 正常关闭 (code 1000) 不触发自动重连
      if (!this.isIntentionalDisconnect && this.config.autoReconnect && event.code !== 1000) {
        this.attemptReconnect()
      }
    }

    this.ws.onerror = () => {
      this.callbacks.onError?.('WebSocket 连接错误')
    }
  }

  /**
   * 断开 WebSocket 连接
   */
  disconnectWs(): void {
    this.isIntentionalDisconnect = true
    this.clearReconnectTimer()
    this.stopHeartbeat()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this._isWsConnected = false
  }

  /**
   * 请求连接 RTT 后端
   */
  connectRtt(config: RttConnectConfig): void {
    this.send({ type: 'connect', config })
  }

  /**
   * 请求断开 RTT 连接
   */
  disconnectRtt(): void {
    this.send({ type: 'disconnect' })
  }

  /**
   * 向 MCU 发送数据
   */
  sendData(data: string, channel?: number): void {
    this.send({ type: 'send', data, channel })
  }

  /**
   * 请求列出可用探针
   */
  listProbes(): void {
    this.send({ type: 'list_probes' })
  }

  /**
   * 请求选择文件
   * @param filters 文件过滤器
   */
  selectFile(filters?: Array<{ name: string; extensions: string[] }>): void {
    this.send({ type: 'select_file', filters })
  }

  /**
   * 请求检测后端能力
   */
  checkCapabilities(): void {
    this.send({ type: 'check_capabilities' })
  }

  /**
   * 处理服务端消息
   */
  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'connected':
        this.callbacks.onConnected?.(msg.backend ?? 'probe-rs')
        break
      case 'disconnected':
        this.callbacks.onDisconnected?.()
        break
      case 'rtt_data':
        if (msg.data) {
          this.callbacks.onData?.(msg.data)
        }
        break
      case 'error':
        this.callbacks.onError?.(msg.error ?? '未知错误')
        break
      case 'probe_list':
        this.callbacks.onProbeList?.(msg.probes ?? [])
        break
      case 'channels':
        this.callbacks.onChannels?.(msg.channels ?? [])
        break
      case 'file_selected':
        if (msg.filePath) {
          this.callbacks.onFileSelected?.(msg.filePath)
        }
        break
      case 'capabilities':
        this.callbacks.onCapabilities?.(msg.capabilities ?? [])
        break
    }
  }

  /**
   * 发送客户端消息
   */
  private send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    } else {
      this.callbacks.onError?.('WebSocket 未连接')
    }
  }

  /**
   * 尝试自动重连
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.callbacks.onError?.(`重连失败，已达到最大重试次数 (${this.config.maxReconnectAttempts})`)
      return
    }

    this.reconnectAttempts++
    this.clearReconnectTimer()

    this.reconnectTimer = setTimeout(() => {
      this.connectWs()
    }, this.config.reconnectInterval)
  }

  /**
   * 清除重连定时器
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  /**
   * 启动心跳检测
   * 定期发送 ping 消息，超时未收到 pong 则触发重连
   */
  private startHeartbeat(): void {
    this.stopHeartbeat()
    if (this.config.heartbeatInterval <= 0) return

    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
        // 清除上一次的超时定时器，避免泄漏
        this.clearHeartbeatTimeout()
        // 设置心跳超时
        this.heartbeatTimeoutTimer = setTimeout(() => {
          console.warn('[RTT Service] 心跳超时，关闭连接')
          this.ws?.close()
        }, this.config.heartbeatTimeout)
      }
    }, this.config.heartbeatInterval)
  }

  /**
   * 停止心跳检测
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    this.clearHeartbeatTimeout()
  }

  /**
   * 清除心跳超时定时器
   */
  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer)
      this.heartbeatTimeoutTimer = null
    }
  }

  /**
   * 销毁服务实例
   */
  destroy(): void {
    this.disconnectWs()
    this.callbacks = {}
  }
}

/** 导出单例 */
export const rttService = new RttService()
