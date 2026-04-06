/**
 * 网络调试模块类型定义
 */

/** 网络连接模式 */
export type NetworkMode = 'tcp-client' | 'tcp-server' | 'udp'

/** 连接状态 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

/** 数据方向 */
export type DataDirection = 'rx' | 'tx'

/** 数据格式 */
export type DataFormat = 'ascii' | 'hex'

/** TCP 客户端配置 */
export interface TcpClientConfig {
  host: string
  port: number
  localPort?: number
  timeout: number
  retryCount: number
  retryInterval: number
}

/** TCP 服务器配置 */
export interface TcpServerConfig {
  port: number
  maxConnections: number
}

/** UDP 配置 */
export interface UdpConfig {
  localPort: number
  targets: UdpTarget[]
}

/** UDP 目标配置 */
export interface UdpTarget {
  id: string
  host: string
  port: number
  enabled: boolean
}

/** 网络配置联合类型 */
export interface NetworkConfig {
  mode: NetworkMode
  tcpClient: TcpClientConfig
  tcpServer: TcpServerConfig
  udp: UdpConfig
}

/** 客户端连接信息 */
export interface ClientConnection {
  id: string
  remoteAddress: string
  remotePort: number
  connectedAt: number
  bytesReceived: number
  bytesSent: number
}

/** 网络统计数据 */
export interface NetworkStats {
  bytesReceived: number
  bytesSent: number
  receiveRate: number
  sendRate: number
  packetLoss: number
  connectionCount: number
}

/** 数据日志项 */
export interface NetworkDataLog {
  id: string
  timestamp: number
  direction: DataDirection
  data: string
  format: DataFormat
  clientId?: string
}

/** 网络状态 */
export interface NetworkState {
  status: ConnectionStatus
  config: NetworkConfig
  stats: NetworkStats
  connections: ClientConnection[]
  dataLogs: NetworkDataLog[]
  error?: string
}

/** 默认网络配置 */
export const defaultNetworkConfig: NetworkConfig = {
  mode: 'tcp-client',
  tcpClient: {
    host: '127.0.0.1',
    port: 8080,
    timeout: 5000,
    retryCount: 5,
    retryInterval: 1000
  },
  tcpServer: {
    port: 8080,
    maxConnections: 10
  },
  udp: {
    localPort: 8080,
    targets: []
  }
}
