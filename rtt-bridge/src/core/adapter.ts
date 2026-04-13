import { EventEmitter } from 'events'

/** RTT 日志级别 */
export type RttLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'trace'

/** RTT 数据事件载荷 */
export interface RttDataPayload {
  source: string
  timestamp: number
  text: string
  channel: number
  level: RttLogLevel
  raw?: Buffer
}

/** 探针信息 */
export interface ProbeInfo {
  identifier: string
  type: string
  serialNumber?: string
  vendorId?: number
  productId?: number
  displayName: string
}

/** RTT 通道信息 */
export interface RttChannelInfo {
  number: number
  name: string
  size: number
  mode: 'text' | 'binary'
}

/** 后端能力信息 */
export interface BackendCapabilities {
  /** 后端名称 */
  name: string
  /** 是否可用（工具已安装） */
  available: boolean
  /** 版本信息 */
  version?: string
  /** 不可用原因 */
  reason?: string
  /** 安装指引 */
  installGuide?: string
  /** 所需配置项 */
  requiredConfig: string[]
  /** 可选配置项 */
  optionalConfig: string[]
}

/** Adapter 连接配置基类 */
export interface AdapterConfig {
  backend: string
}

/** probe-rs 连接配置 */
export interface ProbeRsAdapterConfig extends AdapterConfig {
  backend: 'probe-rs'
  /** ELF 文件路径 (probe-rs v0.31+ 必需) */
  elfPath: string
  chip: string
  protocol: 'Swd' | 'Jtag'
  probe?: string
  frequency?: number
  rttScanRange?: string
}

/** OpenOCD 连接配置 */
export interface OpenOCDAdapterConfig extends AdapterConfig {
  backend: 'openocd'
  host: string
  port: number
  channel: number
}

/** J-Link 连接配置 */
export interface JLinkAdapterConfig extends AdapterConfig {
  backend: 'jlink'
  host: string
  port: number
  channel: number
}

/** 统一连接配置 */
export type RttConnectConfig = ProbeRsAdapterConfig | OpenOCDAdapterConfig | JLinkAdapterConfig

/**
 * RTT 适配器抽象基类
 * 所有后端适配器必须实现此接口
 */
export abstract class RttAdapter extends EventEmitter {
  /** 适配器名称 */
  abstract readonly name: string

  /** 是否已连接 */
  abstract get isConnected(): boolean

  /**
   * 检查后端能力（工具是否安装、版本等）
   * @returns 后端能力信息
   */
  static async checkCapabilities(): Promise<BackendCapabilities> {
    return {
      name: 'unknown',
      available: false,
      reason: '未实现能力检测',
      requiredConfig: [],
      optionalConfig: [],
    }
  }

  /**
   * 建立 RTT 连接
   * @param config 连接配置
   */
  abstract connect(config: RttConnectConfig): void

  /** 断开 RTT 连接 */
  abstract disconnect(): void

  /**
   * 向 MCU 发送数据
   * @param data 要发送的文本数据
   * @param channel 目标通道号
   */
  abstract send(data: string, channel?: number): void

  /**
   * 列出可用探针
   * @returns 探针信息数组
   */
  abstract listProbes(): Promise<ProbeInfo[]>

  /**
   * 获取当前 RTT 通道信息
   * @returns 通道信息数组
   */
  abstract getChannels(): RttChannelInfo[]

  /** 销毁适配器，释放所有资源 */
  abstract destroy(): void
}
