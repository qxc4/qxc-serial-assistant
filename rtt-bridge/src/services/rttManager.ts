import { RttAdapter, RttConnectConfig, ProbeInfo, RttChannelInfo, BackendCapabilities } from '../core/adapter.js'
import { ProbeRsAdapter } from '../adapters/probe_rs.js'
import { OpenOCDAdapter } from '../adapters/openocd.js'
import { JLinkAdapter } from '../adapters/jlink.js'

/**
 * RTT 管理器
 * 统一管理所有后端适配器的连接生命周期
 */
export class RttManager {
  private currentAdapter: RttAdapter | null = null
  private currentConfig: RttConnectConfig | null = null

  /**
   * 获取当前连接状态
   */
  get isConnected(): boolean {
    return this.currentAdapter?.isConnected ?? false
  }

  /**
   * 获取当前适配器名称
   */
  get activeBackend(): string | null {
    return this.currentAdapter?.name ?? null
  }

  /**
   * 检查所有后端能力
   * @returns 所有后端的能力信息
   */
  static async checkAllCapabilities(): Promise<BackendCapabilities[]> {
    const [probeRs, openocd, jlink] = await Promise.all([
      ProbeRsAdapter.checkCapabilities(),
      OpenOCDAdapter.checkCapabilities(),
      JLinkAdapter.checkCapabilities(),
    ])
    return [probeRs, openocd, jlink]
  }

  /**
   * 根据配置创建对应的适配器
   * @param config 连接配置
   * @returns 适配器实例
   */
  private createAdapter(config: RttConnectConfig): RttAdapter {
    switch (config.backend) {
      case 'probe-rs':
        return new ProbeRsAdapter()
      case 'openocd':
        return new OpenOCDAdapter()
      case 'jlink':
        return new JLinkAdapter()
      default:
        throw new Error(`不支持的后端类型: ${(config as RttConnectConfig).backend}`)
    }
  }

  /**
   * 建立 RTT 连接
   * @param config 连接配置
   * @param onData 数据回调
   * @param onError 错误回调
   * @param onDisconnected 断开回调
   * @param onChannels 通道变更回调
   */
  connect(
    config: RttConnectConfig,
    onData: (data: unknown) => void,
    onError: (error: Error) => void,
    onDisconnected: () => void,
    onChannels: (channels: RttChannelInfo[]) => void,
  ): void {
    this.disconnect()

    this.currentConfig = config
    this.currentAdapter = this.createAdapter(config)

    this.currentAdapter.on('data', onData)
    this.currentAdapter.on('error', onError)
    this.currentAdapter.on('disconnected', onDisconnected)
    this.currentAdapter.on('channels', onChannels)

    this.currentAdapter.connect(config)
  }

  /** 断开当前连接 */
  disconnect(): void {
    if (this.currentAdapter) {
      this.currentAdapter.disconnect()
      this.currentAdapter.destroy()
      this.currentAdapter = null
      this.currentConfig = null
    }
  }

  /**
   * 向 MCU 发送数据
   * @param data 文本数据
   * @param channel 目标通道号
   */
  send(data: string, channel?: number): void {
    this.currentAdapter?.send(data, channel)
  }

  /**
   * 列出可用探针
   * @returns 探针信息数组
   */
  async listProbes(): Promise<ProbeInfo[]> {
    const adapter = this.currentAdapter ?? new ProbeRsAdapter()
    try {
      return await adapter.listProbes()
    } finally {
      if (!this.currentAdapter) {
        adapter.destroy()
      }
    }
  }

  /**
   * 获取当前 RTT 通道信息
   * @returns 通道信息数组
   */
  getChannels(): RttChannelInfo[] {
    return this.currentAdapter?.getChannels() ?? []
  }

  /** 销毁管理器 */
  destroy(): void {
    this.disconnect()
  }
}
