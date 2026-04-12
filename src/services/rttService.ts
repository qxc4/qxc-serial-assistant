import type {
  RttConnectConfig,
  RttLogEntry,
  ProbeInfo,
  RttChannel,
  ClientMessage,
  ServerMessage,
  RttServiceConfig,
  RttBackend,
} from '../types/rtt'

/** 默认服务配置 */
const DEFAULT_CONFIG: RttServiceConfig = {
  wsUrl: 'ws://127.0.0.1:19022',
  autoReconnect: true,
  reconnectInterval: 3000,
  maxReconnectAttempts: 5,
}

/** 事件回调类型 */
export interface RttServiceCallbacks {
  onConnected?: (backend: RttBackend) => void
  onDisconnected?: () => void
  onData?: (entry: RttLogEntry) => void
  onError?: (error: string) => void
  onProbeList?: (probes: ProbeInfo[]) => void
  onChannels?: (channels: RttChannel[]) => void
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
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage
        this.handleServerMessage(msg)
      } catch {
        // 忽略解析失败的消息
      }
    }

    this.ws.onclose = () => {
      this._isWsConnected = false
      this.callbacks.onDisconnected?.()

      if (!this.isIntentionalDisconnect && this.config.autoReconnect) {
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
   * 销毁服务实例
   */
  destroy(): void {
    this.disconnectWs()
    this.callbacks = {}
  }
}

/** 导出单例 */
export const rttService = new RttService()
