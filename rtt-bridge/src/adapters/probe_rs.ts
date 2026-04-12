import { spawn, ChildProcess } from 'child_process'
import { RttAdapter, RttConnectConfig, ProbeRsAdapterConfig, ProbeInfo, RttChannelInfo, RttDataPayload } from '../core/adapter.js'

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
 * probe-rs 适配器实现
 * 通过 spawn probe-rs 子进程实现 RTT 通信
 */
export class ProbeRsAdapter extends RttAdapter {
  readonly name = 'probe-rs'
  private proc: ChildProcess | null = null
  private _isConnected = false
  private stdoutBuffer = ''
  private channels: RttChannelInfo[] = []
  private _config: ProbeRsAdapterConfig | null = null

  get isConnected(): boolean {
    return this._isConnected
  }

  /**
   * 建立 probe-rs RTT 连接
   * @param config probe-rs 连接配置
   */
  connect(config: RttConnectConfig): void {
    if (this._isConnected) {
      this.disconnect()
    }

    const rsConfig = config as ProbeRsAdapterConfig
    this._config = rsConfig

    const args = [
      'rtt',
      '--chip', rsConfig.chip,
      '--protocol', rsConfig.protocol,
    ]

    if (rsConfig.probe) args.push('--probe', rsConfig.probe)
    if (rsConfig.frequency) args.push('--speed', String(rsConfig.frequency))
    if (rsConfig.rttScanRange) args.push('--rtt-scan-range', rsConfig.rttScanRange)

    try {
      this.proc = spawn('probe-rs', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, RUST_LOG: 'warn' },
      })
    } catch (err) {
      this.emit('error', new Error(`启动 probe-rs 失败: ${err instanceof Error ? err.message : String(err)}`))
      return
    }

    this.proc.stdout?.on('data', (chunk: Buffer) => {
      this.handleStdout(chunk)
    })

    this.proc.stderr?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString('utf8')
      if (msg.includes('Error') || msg.includes('error')) {
        this.emit('error', new Error(msg.trim()))
      }
    })

    this.proc.on('error', (err) => {
      this._isConnected = false
      this.emit('error', new Error(`probe-rs 进程错误: ${err.message}`))
      this.emit('disconnected')
    })

    this.proc.on('exit', (code, signal) => {
      this._isConnected = false
      if (code !== 0 && code !== null) {
        this.emit('error', new Error(`probe-rs 进程退出，退出码: ${code}`))
      }
      this.emit('disconnected')
    })

    this._isConnected = true
    this.emit('connected')
  }

  /**
   * 处理 stdout 数据流
   * @param chunk 数据块
   */
  private handleStdout(chunk: Buffer): void {
    this.stdoutBuffer += chunk.toString('utf8')
    const lines = this.stdoutBuffer.split('\n')
    this.stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue

      const channelMatch = line.match(/^Channel\s+(\d+):\s*(.+)/)
      const channel = channelMatch ? parseInt(channelMatch[1], 10) : 0
      const text = channelMatch ? channelMatch[2] : line

      if (channelMatch && !this.channels.find(c => c.number === channel)) {
        this.channels.push({
          number: channel,
          name: `Channel ${channel}`,
          size: 0,
          mode: 'text',
        })
        this.emit('channels', this.channels)
      }

      const payload: RttDataPayload = {
        source: 'probe-rs',
        timestamp: Date.now(),
        text,
        channel,
        level: inferLogLevel(text),
      }

      this.emit('data', payload)
    }
  }

  /** 断开连接 */
  disconnect(): void {
    if (this.proc) {
      try {
        this.proc.kill('SIGTERM')
        setTimeout(() => {
          if (this.proc) {
            this.proc.kill('SIGKILL')
          }
        }, 3000)
      } catch {
        // 进程可能已退出
      }
      this.proc = null
    }
    this._isConnected = false
    this.stdoutBuffer = ''
    this.channels = []
    this._config = null
  }

  /**
   * 向 MCU 发送数据
   * @param data 文本数据
   * @param channel 目标通道号
   */
  send(data: string, channel?: number): void {
    if (!this.proc?.stdin?.writable) {
      this.emit('error', new Error('probe-rs 进程未运行或 stdin 不可写'))
      return
    }
    this.proc.stdin.write(data + '\n')
  }

  /**
   * 列出已连接的探针
   * @returns 探针信息数组
   */
  async listProbes(): Promise<ProbeInfo[]> {
    return new Promise((resolve) => {
      try {
        const proc = spawn('probe-rs', ['list', '--json'], {
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
          if (code !== 0) {
            resolve(this.parseProbeListText(stderr || stdout))
            return
          }
          resolve(this.parseProbeListOutput(stdout))
        })

        proc.on('error', () => {
          resolve([])
        })
      } catch {
        resolve([])
      }
    })
  }

  /**
   * 解析 JSON 格式的探针列表
   * @param output probe-rs list --json 输出
   * @returns 探针信息数组
   */
  private parseProbeListOutput(output: string): ProbeInfo[] {
    try {
      const data = JSON.parse(output)
      if (Array.isArray(data)) {
        return data.map((item: Record<string, unknown>) => ({
          identifier: String(item.identifier ?? item['probe-index'] ?? ''),
          type: String(item.type ?? 'unknown'),
          serialNumber: item.serial_number ? String(item.serial_number) : undefined,
          vendorId: typeof item.vendor_id === 'number' ? item.vendor_id : undefined,
          productId: typeof item.product_id === 'number' ? item.product_id : undefined,
          displayName: String(item.identifier ?? item['probe-index'] ?? 'Unknown Probe'),
        }))
      }
    } catch {
      // JSON 解析失败，尝试文本解析
    }
    return this.parseProbeListText(output)
  }

  /**
   * 解析文本格式的探针列表
   * @param text probe-rs list 文本输出
   * @returns 探针信息数组
   */
  private parseProbeListText(text: string): ProbeInfo[] {
    const probes: ProbeInfo[] = []
    const lines = text.split('\n')

    for (const line of lines) {
      const match = line.match(/(\d+):\s*(.+?)\s*(?:\[([^\]]*)\])?/)
      if (match) {
        probes.push({
          identifier: match[1],
          type: match[2]?.trim() ?? 'unknown',
          serialNumber: match[3]?.trim() || undefined,
          displayName: `${match[2]?.trim() ?? 'Probe'} #${match[1]}`,
        })
      }
    }

    return probes
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
