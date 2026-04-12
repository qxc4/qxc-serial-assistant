import * as net from 'net'
import { spawn } from 'child_process'
import { RttAdapter, RttConnectConfig, OpenOCDAdapterConfig, ProbeInfo, RttChannelInfo, RttDataPayload, BackendCapabilities } from '../core/adapter.js'
import { inferLogLevel } from '../core/logLevel.js'

/**
 * OpenOCD 适配器实现
 * 通过 TCP 连接 OpenOCD RTT 服务获取数据
 *
 * 使用条件：
 * 1. OpenOCD 已安装并在运行
 * 2. OpenOCD 配置了 RTT 支持（需要特殊配置）
 * 3. OpenOCD 的 RTT TCP 服务已启动（默认端口 9090）
 */
export class OpenOCDAdapter extends RttAdapter {
  readonly name = 'openocd'
  private socket: net.Socket | null = null
  private _isConnected = false
  private channels: RttChannelInfo[] = []
  private dataBuffer = ''

  get isConnected(): boolean {
    return this._isConnected
  }

  /**
   * 检查 OpenOCD 是否可用
   * 注意：OpenOCD 需要手动启动，这里只检查命令是否存在
   */
  static async checkCapabilities(): Promise<BackendCapabilities> {
    return new Promise((resolve) => {
      // OpenOCD 需要手动启动，我们检查命令是否存在
      const proc = spawn('openocd', ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''

      proc.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
      })

      proc.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
      })

      proc.on('close', (code) => {
        // OpenOCD --version 返回 0，但版本信息在 stderr
        const version = (stderr.trim() || stdout.trim()).split('\n')[0]
        if (code === 0 || version.includes('Open On-Chip Debugger')) {
          resolve({
            name: 'openocd',
            available: true,
            version: version,
            requiredConfig: ['host', 'port'],
            optionalConfig: ['channel'],
            installGuide: 'OpenOCD 已安装。使用前需要：\n1. 启动 OpenOCD 并连接目标\n2. 配置 RTT 支持（在配置文件中添加 rtt 相关命令）\n3. 确保 RTT TCP 服务已启动',
          })
        } else {
          resolve({
            name: 'openocd',
            available: false,
            reason: 'OpenOCD 未安装或不在 PATH 中',
            installGuide: '请访问 http://openocd.org/ 下载安装 OpenOCD，或将 openocd 添加到系统 PATH',
            requiredConfig: ['host', 'port'],
            optionalConfig: ['channel'],
          })
        }
      })

      proc.on('error', () => {
        resolve({
          name: 'openocd',
          available: false,
          reason: 'OpenOCD 未安装或不在 PATH 中',
          installGuide: '请访问 http://openocd.org/ 下载安装 OpenOCD，或将 openocd 添加到系统 PATH',
          requiredConfig: ['host', 'port'],
          optionalConfig: ['channel'],
        })
      })
    })
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

    // 验证配置
    if (!ocdConfig.host || !ocdConfig.port) {
      this.emit('error', new Error('OpenOCD 配置无效：需要主机地址和端口'))
      return
    }

    this.socket = new net.Socket()

    // 设置连接超时
    this.socket.setTimeout(10000)

    this.socket.connect(ocdConfig.port, ocdConfig.host, () => {
      this._isConnected = true
      // 清除超时
      this.socket?.setTimeout(0)
      this.channels = [{
        number: ocdConfig.channel,
        name: `Channel ${ocdConfig.channel}`,
        size: 0,
        mode: 'text',
      }]
      this.emit('connected')
      this.emit('channels', this.channels)
    })

    this.socket.on('timeout', () => {
      this._isConnected = false
      this.emit('error', new Error('OpenOCD 连接超时，请确保 OpenOCD 已启动并监听指定端口'))
      this.socket?.destroy()
    })

    this.socket.on('data', (data: Buffer) => {
      this.dataBuffer += data.toString('utf8')
      const lines = this.dataBuffer.split('\n')
      this.dataBuffer = lines.pop() ?? ''

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
    this.dataBuffer = ''
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
