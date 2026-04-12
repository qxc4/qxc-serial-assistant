/** RTT 后端类型 */
export type RttBackend = 'probe-rs' | 'openocd' | 'jlink'

/** RTT 连接状态 */
export type RttConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

/** RTT 日志级别 */
export type RttLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'trace'

/** RTT 通道信息 */
export interface RttChannel {
  /** 通道编号 */
  number: number
  /** 通道名称 */
  name: string
  /** 通道大小（字节） */
  size: number
  /** 数据模式：文本或二进制 */
  mode: 'text' | 'binary'
}

/** 探针信息 */
export interface ProbeInfo {
  /** 探针标识符（VID:PID 或序列号） */
  identifier: string
  /** 探针类型 */
  type: string
  /** 探针序列号 */
  serialNumber?: string
  /** 厂商 ID */
  vendorId?: number
  /** 产品 ID */
  productId?: number
  /** 显示名称 */
  displayName: string
}

/** RTT 日志条目 */
export interface RttLogEntry {
  /** 唯一 ID */
  id: number
  /** 时间戳 */
  timestamp: number
  /** 日志级别 */
  level: RttLogLevel
  /** RTT 通道号 */
  channel: number
  /** 日志文本 */
  text: string
  /** 原始数据（二进制通道时使用） */
  raw?: Uint8Array
}

/** RTT 过滤器 */
export interface RttFilter {
  /** 日志级别过滤 */
  levels: RttLogLevel[]
  /** 通道过滤 */
  channels: number[]
  /** 文本搜索关键词 */
  searchText: string
}

/** probe-rs 连接配置 */
export interface ProbeRsConfig {
  /** 芯片型号 */
  chip: string
  /** 调试协议 */
  protocol: 'Swd' | 'Jtag'
  /** 探针标识（多探针时指定） */
  probe?: string
  /** SWD/JTAG 时钟频率（Hz） */
  frequency?: number
  /** RTT 扫描范围 */
  rttScanRange?: string
}

/** OpenOCD 连接配置 */
export interface OpenOCDConfig {
  /** 主机地址 */
  host: string
  /** TCP 端口 */
  port: number
  /** RTT 通道号 */
  channel: number
}

/** J-Link 连接配置 */
export interface JLinkConfig {
  /** 主机地址 */
  host: string
  /** Telnet 端口 */
  port: number
  /** RTT 通道号 */
  channel: number
}

/** 统一连接配置 */
export interface RttConnectConfig {
  /** 后端类型 */
  backend: RttBackend
  /** probe-rs 配置 */
  probeRs?: ProbeRsConfig
  /** OpenOCD 配置 */
  openocd?: OpenOCDConfig
  /** J-Link 配置 */
  jlink?: JLinkConfig
}

// ==================== WebSocket 协议类型 ====================

/** 客户端 → 服务端消息类型 */
export type ClientMessageType = 'connect' | 'disconnect' | 'send' | 'list_probes'

/** 服务端 → 客户端消息类型 */
export type ServerMessageType = 'connected' | 'disconnected' | 'rtt_data' | 'error' | 'probe_list' | 'channels'

/** 客户端 → 服务端消息 */
export interface ClientMessage {
  type: ClientMessageType
  /** 连接配置（connect 时必填） */
  config?: RttConnectConfig
  /** 发送数据（send 时必填） */
  data?: string
  /** 通道号（send 时可选） */
  channel?: number
}

/** 服务端 → 客户端消息 */
export interface ServerMessage {
  type: ServerMessageType
  /** RTT 数据（rtt_data 时使用） */
  data?: RttLogEntry
  /** 探针列表（probe_list 时使用） */
  probes?: ProbeInfo[]
  /** 通道列表（channels 时使用） */
  channels?: RttChannel[]
  /** 错误信息（error 时使用） */
  error?: string
  /** 连接后端类型 */
  backend?: RttBackend
}

/** RTT 服务配置 */
export interface RttServiceConfig {
  /** WebSocket 服务地址 */
  wsUrl: string
  /** 自动重连 */
  autoReconnect: boolean
  /** 重连间隔（ms） */
  reconnectInterval: number
  /** 最大重连次数 */
  maxReconnectAttempts: number
}

/** RTT 会话导出格式 */
export interface RttSessionExport {
  /** 导出时间 */
  exportTime: number
  /** 连接配置 */
  config: RttConnectConfig
  /** 日志条目 */
  logs: RttLogEntry[]
}
