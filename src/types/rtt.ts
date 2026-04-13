/// <reference path="./webusb.d.ts" />

/** RTT 后端类型 */
export type RttBackend = 'probe-rs' | 'openocd' | 'jlink' | 'webusb'

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
  /** ELF 文件路径 (probe-rs v0.31+ 必需) */
  elfPath: string
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
export type ClientMessageType = 'connect' | 'disconnect' | 'send' | 'list_probes' | 'select_file' | 'check_capabilities'

/** 服务端 → 客户端消息类型 */
export type ServerMessageType = 'connected' | 'disconnected' | 'rtt_data' | 'error' | 'probe_list' | 'channels' | 'file_selected' | 'capabilities'

/** 客户端 → 服务端消息 */
export interface ClientMessage {
  type: ClientMessageType
  /** 连接配置（connect 时必填） */
  config?: RttConnectConfig
  /** 发送数据（send 时必填） */
  data?: string
  /** 通道号（send 时可选） */
  channel?: number
  /** 文件过滤器（select_file 时使用） */
  filters?: Array<{ name: string; extensions: string[] }>
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
  /** 选中的文件路径（file_selected 时使用） */
  filePath?: string
  /** 后端能力列表（capabilities 时使用） */
  capabilities?: BackendCapabilities[]
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
  /** 心跳发送间隔（ms），0 表示禁用 */
  heartbeatInterval: number
  /** 心跳超时时间（ms） */
  heartbeatTimeout: number
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

// ==================== WebUSB-RTT 类型定义 ====================

/** CMSIS-DAP 调试协议 */
export type DebugProtocol = 'swd' | 'jtag'

/** WebUSB 探针类型 */
export type WebUsbProbeType =
  | 'stlink-v2'
  | 'stlink-v3'
  | 'daplink'
  | 'picoprobe'
  | 'cmsis-dap'
  | 'jlink'
  | 'unknown'

/** WebUSB 设备过滤器 */
export interface WebUsbDeviceFilter {
  /** 厂商 ID */
  vendorId: number
  /** 产品 ID（可选，不指定则匹配该厂商所有设备） */
  productId?: number
  /** 探针类型 */
  probeType: WebUsbProbeType
  /** 显示名称 */
  displayName: string
}

/** WebUSB 探针信息（扩展自 ProbeInfo） */
export interface WebUsbProbeInfo extends ProbeInfo {
  /** USB 设备对象 */
  device: USBDevice
  /** 探针类型 */
  probeType: WebUsbProbeType
  /** 支持的调试协议 */
  protocols: DebugProtocol[]
  /** 最大 SWD 时钟频率 (Hz) */
  maxSwdFrequency?: number
  /** 是否已授权 */
  authorized: boolean
}

/** WebUSB 连接配置 */
export interface WebUsbConfig {
  /** 调试协议 */
  protocol: DebugProtocol
  /** SWD/JTAG 时钟频率 (Hz) */
  frequency: number
  /** 目标芯片型号 */
  chip?: string
  /** RTT 控制块搜索起始地址 */
  rttSearchStart?: number
  /** RTT 控制块搜索结束地址 */
  rttSearchEnd?: number
  /** RTT 缓冲区大小 */
  rttBufferSize?: number
}

/** WebUSB 连接状态 */
export type WebUsbState =
  | 'disconnected'      // 未连接
  | 'requesting'        // 请求设备权限
  | 'connecting'        // 正在连接
  | 'connected'         // 已连接
  | 'scanning'          // 扫描 RTT 控制块
  | 'running'           // RTT 运行中
  | 'error'             // 错误状态

/** WebUSB 错误类型 */
export type WebUsbErrorType =
  | 'not_supported'     // 浏览器不支持 WebUSB
  | 'permission_denied' // 用户拒绝授权
  | 'device_not_found'  // 设备未找到
  | 'connection_failed' // 连接失败
  | 'protocol_error'    // 协议错误
  | 'rtt_not_found'     // RTT 控制块未找到
  | 'read_error'        // 读取错误
  | 'write_error'       // 写入错误
  | 'device_disconnected' // 设备断开
  | 'timeout'           // 超时
  | 'unknown'           // 未知错误

/** WebUSB 错误信息 */
export interface WebUsbError {
  /** 错误类型 */
  type: WebUsbErrorType
  /** 错误消息 */
  message: string
  /** 原始错误 */
  cause?: Error
}

/** CMSIS-DAP 命令类型 */
export const CmsisDapCommand = {
  /** 信息查询 */
  DAP_INFO: 0x00,
  /** LED 控制 */
  DAP_LED: 0x01,
  /** 连接 */
  DAP_CONNECT: 0x02,
  /** 断开 */
  DAP_DISCONNECT: 0x03,
  /** 写 ABORT 寄存器 */
  DAP_WRITE_ABORT: 0x08,
  /** 延时 */
  DAP_DELAY: 0x09,
  /** 重置目标 */
  DAP_RESET_TARGET: 0x0A,
  /** SWJ 时钟 */
  DAP_SWJ_CLOCK: 0x11,
  /** SWJ 序列 */
  DAP_SWJ_SEQUENCE: 0x12,
  /** SWD 配置 */
  DAP_SWD_CONFIGURE: 0x13,
  /** SWD 序列 */
  DAP_SWD_SEQUENCE: 0x1D,
  /** JTAG 序列 */
  DAP_JTAG_SEQUENCE: 0x14,
  /** JTAG 配置 */
  DAP_JTAG_CONFIGURE: 0x15,
  /** 传输块 */
  DAP_TRANSFER: 0x05,
  /** 传输块（阻塞） */
  DAP_TRANSFER_BLOCK: 0x07,
} as const

/** CMSIS-DAP 信息 ID */
export const CmsisDapInfoId = {
  /** 厂商名称 */
  VENDOR: 0x01,
  /** 产品名称 */
  PRODUCT: 0x02,
  /** 序列号 */
  SER_NUM: 0x03,
  /** 固件版本 */
  FW_VER: 0x04,
  /** 设备能力 */
  CAPABILITIES: 0xF0,
  /** SWD 情况 */
  SWD_ACCELERATOR: 0x01,
  /** JTAG 情况 */
  JTAG_ACCELERATOR: 0x02,
} as const

/** RTT 控制块结构 */
export interface RttControlBlock {
  /** 魔数 "SEGGER RTT" */
  magic: string
  /** 最大可支持的 Up 缓冲区数量 */
  maxNumUpBuffers: number
  /** 最大可支持的 Down 缓冲区数量 */
  maxNumDownBuffers: number
  /** Up 缓冲区描述符 */
  upBuffers: RttBufferDescriptor[]
  /** Down 缓冲区描述符 */
  downBuffers: RttBufferDescriptor[]
  /** 控制块在目标内存中的地址 */
  address: number
}

/** RTT 缓冲区描述符 */
export interface RttBufferDescriptor {
  /** 缓冲区名称 */
  name: string
  /** 缓冲区指针（目标地址） */
  buffer: number
  /** 缓冲区大小 */
  size: number
  /** 写入位置 */
  writeIndex: number
  /** 读取位置 */
  readIndex: number
  /** 缓冲区标志 */
  flags: number
}

/** WebUSB RTT 服务配置 */
export interface WebUsbRttConfig {
  /** 默认 SWD 时钟频率 (Hz) */
  defaultFrequency: number
  /** RTT 搜索起始地址 */
  rttSearchStart: number
  /** RTT 搜索结束地址 */
  rttSearchEnd: number
  /** RTT 轮询间隔 (ms) */
  pollInterval: number
  /** 连接超时 (ms) */
  connectTimeout: number
  /** 读取超时 (ms) */
  readTimeout: number
}

/** 已知的 USB 调试探针设备列表 */
export const KNOWN_USB_PROBES: WebUsbDeviceFilter[] = [
  // ST-Link V2
  { vendorId: 0x0483, productId: 0x3748, probeType: 'stlink-v2', displayName: 'ST-Link V2' },
  // ST-Link V2-1 (Nucleo boards)
  { vendorId: 0x0483, productId: 0x374b, probeType: 'stlink-v2', displayName: 'ST-Link V2-1' },
  // ST-Link V3
  { vendorId: 0x0483, productId: 0x374f, probeType: 'stlink-v3', displayName: 'ST-Link V3' },
  { vendorId: 0x0483, productId: 0x3753, probeType: 'stlink-v3', displayName: 'ST-Link V3E' },
  // DAPLink (NXP, ARM mbed)
  { vendorId: 0x0d28, productId: 0x0204, probeType: 'daplink', displayName: 'DAPLink' },
  // Raspberry Pi Pico (Picoprobe)
  { vendorId: 0x2e8a, productId: 0x0004, probeType: 'picoprobe', displayName: 'PicoProbe' },
  // J-Link
  { vendorId: 0x1366, productId: 0x0101, probeType: 'jlink', displayName: 'J-Link' },
  { vendorId: 0x1366, productId: 0x0105, probeType: 'jlink', displayName: 'J-Link OB' },
  { vendorId: 0x1366, productId: 0x1051, probeType: 'jlink', displayName: 'J-Link Plus' },
  // CMSIS-DAP 通用
  { vendorId: 0xc251, productId: 0xf001, probeType: 'cmsis-dap', displayName: 'Keil ULINK2' },
  { vendorId: 0x0d28, productId: 0x0204, probeType: 'cmsis-dap', displayName: 'CMSIS-DAP' },
]
