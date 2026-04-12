import * as net from 'net'
import { RttAdapter, RttConnectConfig, JLinkAdapterConfig, ProbeInfo, RttChannelInfo, RttDataPayload } from '../core/adapter.js'

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
 * J-Link 适配器实现
 * 通过 Telnet 协议连接 J-Link RTT 服务获取数据
 */
export class JLinkAdapter extends RttAdapter {
  readonly name = 'jlink'
  private socket: net.Socket | null = null
  private _isConnected = false
  private channels: RttChannelInfo[] = []

  get isConnected(): boolean {
    return this._isConnected
  }

  /**
   * 建立 J-Link RTT Telnet 连接
   * @param config J-Link 连接配置
   */
  connect(config: RttConnectConfig): void {
    if (this._isConnected) {
      this.disconnect()
    }

    const jlConfig = config as JLinkAdapterConfig
    this.socket = new net.Socket()

    this.socket.connect(jlConfig.port, jlConfig.host, () => {
      this._isConnected = true

      if (jlConfig.channel !== undefined) {
        const configStr = `$$SEGGER_TELNET_ConfigStr=RTTCh;${jlConfig.channel}$$`
        this.socket!.write(configStr)
      }

      this.channels = [{
        number: jlConfig.channel ?? 0,
        name: `Channel ${jlConfig.channel ?? 0}`,
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
          source: 'jlink',
          timestamp: Date.now(),
          text: line,
          channel: jlConfig.channel ?? 0,
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
      this.emit('error', new Error(`J-Link 连接错误: ${err.message}`))
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
      this.emit('error', new Error('J-Link 未连接'))
      return
    }
    this.socket.write(Buffer.from(data))
  }

  /**
   * 列出探针（J-Link 不支持自动检测）
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
