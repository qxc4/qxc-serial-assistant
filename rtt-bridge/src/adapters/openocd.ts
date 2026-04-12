import * as net from 'net'
import { RttAdapter, RttConnectConfig, OpenOCDAdapterConfig, ProbeInfo, RttChannelInfo, RttDataPayload } from '../core/adapter.js'

/** 日志级别正则匹配模式 */
const LOG_LEVEL_PATTERNS: Array<{ pattern: RegExp; level: RttDataPayload['level'] }> = [
  { pattern: /\bERROR\b|\bFATAL\b|\bCRITICAL\b/i, level: 'error' },
  { pattern: /\bWARN\b|\bWARNING\b/i, level: 'warn' },
  { pattern: /\bDEBUG\b|\bDBG\b/i, level: 'debug' },
  { pattern: /\bTRACE\b/i, level: 'trace' },
]

/**
 * 从日志文本中推断日志级别
 * @param text 日志文本
 * @returns 推断的日志级别
 */
function inferLogLevel(text: string): RttDataPayload['level'] {
  for (const { pattern, level } of LOG_LEVEL_PATTERNS) {
    if (pattern.test(text)) return level
  }
  return 'info'
}

/**
 * OpenOCD 适配器实现
 * 通过 TCP 连接 OpenOCD RTT 服务获取数据
 */
export class OpenOCDAdapter extends RttAdapter {
  readonly name = 'openocd'
  private socket: net.Socket | null = null
  private _isConnected = false
  private channels: RttChannelInfo[] = []

  get isConnected(): boolean {
    return this._isConnected
  }

  /**
   * 建立 OpenOCD RTT TCP 连接
   * @param config OpenOCD 连接配置
   */
  connect(config: RttConnectConfig): void {
    if (this._isConnected) {
      this.disconnect()
    }

    const ocdConfig = config as OpenOCDAdapterConfig
    this.socket = new net.Socket()

    this.socket.connect(ocdConfig.port, ocdConfig.host, () => {
      this._isConnected = true
      this.channels = [{
        number: ocdConfig.channel,
        name: `Channel ${ocdConfig.channel}`,
        size: 0,
        mode: 'text',
      }]
      this.emit('connected')
      this.emit('channels', this.channels)
    })

    this.socket.on('data', (data: Buffer) => {
      const text = data.toString('utf8')
      const lines = text.split('\n')

      for (const line of lines) {
        if (!line.trim()) continue

        const payload: RttDataPayload = {
          source: 'openocd',
          timestamp: Date.now(),
          text: line,
          channel: ocdConfig.channel,
          level: inferLogLevel(line),
        }
        this.emit('data', payload)
      }
    })

    this.socket.on('close', () => {
      this._isConnected = false
      this.emit('disconnected')
    })

    this.socket.on('error', (err) => {
      this._isConnected = false
      this.emit('error', new Error(`OpenOCD 连接错误: ${err.message}`))
    })
  }

  /** 断开连接 */
  disconnect(): void {
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }
    this._isConnected = false
    this.channels = []
  }

  /**
   * 向 MCU 发送数据
   * @param data 文本数据
   */
  send(data: string): void {
    if (!this.socket?.writable) {
      this.emit('error', new Error('OpenOCD 未连接'))
      return
    }
    this.socket.write(Buffer.from(data))
  }

  /**
   * 列出探针（OpenOCD 不支持自动检测）
   * @returns 空数组
   */
  async listProbes(): Promise<ProbeInfo[]> {
    return []
  }

  /**
   * 获取当前 RTT 通道信息
   * @returns 通道信息数组
   */
  getChannels(): RttChannelInfo[] {
    return [...this.channels]
  }

  /** 销毁适配器 */
  destroy(): void {
    this.disconnect()
    this.removeAllListeners()
  }
}
