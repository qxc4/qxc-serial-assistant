import * as net from 'net'
import { spawn } from 'child_process'
import { RttAdapter, RttConnectConfig, JLinkAdapterConfig, ProbeInfo, RttChannelInfo, RttDataPayload, BackendCapabilities } from '../core/adapter.js'
import { inferLogLevel } from '../core/logLevel.js'

/**
 * J-Link 适配器实现
 * 通过 Telnet 协议连接 J-Link RTT 服务获取数据
 *
 * 使用条件：
 * 1. J-Link 调试器已连接
 * 2. J-Link GDB Server 已启动并连接目标
 * 3. J-Link RTT 已启用（需要在 GDB Server 中配置）
 * 4. RTT Telnet 服务已启动（默认端口 19021）
 */
export class JLinkAdapter extends RttAdapter {
  readonly name = 'jlink'
  private socket: net.Socket | null = null
  private _isConnected = false
  private channels: RttChannelInfo[] = []
  private dataBuffer = ''

  get isConnected(): boolean {
    return this._isConnected
  }

  /**
   * 检查 J-Link 是否可用
   * 注意：J-Link 需要手动启动 GDB Server，这里只检查命令是否存在
   */
  static async checkCapabilities(): Promise<BackendCapabilities> {
    return new Promise((resolve) => {
      // J-Link GDB Server 命令检查
      const proc = spawn('JLinkGDBServerCLExe', ['-version'], {
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
        const output = stderr.trim() || stdout.trim()
        // J-Link 版本信息通常在输出中
        if (output.includes('SEGGER') || output.includes('J-Link') || code === 0) {
          resolve({
            name: 'jlink',
            available: true,
            version: output.split('\n')[0],
            requiredConfig: ['host', 'port'],
            optionalConfig: ['channel'],
            installGuide: 'J-Link 已安装。使用前需要：\n1. 连接 J-Link 调试器\n2. 启动 J-Link GDB Server 并连接目标\n3. 在 GDB Server 中启用 RTT\n4. 确保 RTT Telnet 服务已启动（默认端口 19021）',
          })
        } else {
          resolve({
            name: 'jlink',
            available: false,
            reason: 'J-Link 未安装或不在 PATH 中',
            installGuide: '请访问 https://www.segger.com/downloads/jlink/ 下载安装 J-Link 软件，或将 JLinkGDBServerCLExe 添加到系统 PATH',
            requiredConfig: ['host', 'port'],
            optionalConfig: ['channel'],
          })
        }
      })

      proc.on('error', () => {
        // 尝试备用命令名
        const proc2 = spawn('JLinkGDBServer', ['-version'], {
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        proc2.on('close', (code2) => {
          if (code2 === 0 || code2 === 1) {
            resolve({
              name: 'jlink',
              available: true,
              version: 'J-Link GDB Server',
              requiredConfig: ['host', 'port'],
              optionalConfig: ['channel'],
              installGuide: 'J-Link 已安装。使用前需要：\n1. 连接 J-Link 调试器\n2. 启动 J-Link GDB Server 并连接目标\n3. 在 GDB Server 中启用 RTT\n4. 确保 RTT Telnet 服务已启动（默认端口 19021）',
            })
          } else {
            resolve({
              name: 'jlink',
              available: false,
              reason: 'J-Link 未安装或不在 PATH 中',
              installGuide: '请访问 https://www.segger.com/downloads/jlink/ 下载安装 J-Link 软件，或将 JLinkGDBServerCLExe 添加到系统 PATH',
              requiredConfig: ['host', 'port'],
              optionalConfig: ['channel'],
            })
          }
        })

        proc2.on('error', () => {
          resolve({
            name: 'jlink',
            available: false,
            reason: 'J-Link 未安装或不在 PATH 中',
            installGuide: '请访问 https://www.segger.com/downloads/jlink/ 下载安装 J-Link 软件，或将 JLinkGDBServerCLExe 添加到系统 PATH',
            requiredConfig: ['host', 'port'],
            optionalConfig: ['channel'],
          })
        })
      })
    })
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

    // 验证配置
    if (!jlConfig.host || !jlConfig.port) {
      this.emit('error', new Error('J-Link 配置无效：需要主机地址和端口'))
      return
    }

    this.socket = new net.Socket()

    // 设置连接超时
    this.socket.setTimeout(10000)

    this.socket.connect(jlConfig.port, jlConfig.host, () => {
      this._isConnected = true
      // 清除超时
      this.socket?.setTimeout(0)

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

    this.socket.on('timeout', () => {
      this._isConnected = false
      this.emit('error', new Error('J-Link 连接超时，请确保 J-Link GDB Server 已启动并开启 RTT Telnet 服务'))
      this.socket?.destroy()
    })

    this.socket.on('data', (data: Buffer) => {
      this.dataBuffer += data.toString('utf8')
      const lines = this.dataBuffer.split('\n')
      this.dataBuffer = lines.pop() ?? ''

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
    this.dataBuffer = ''
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
