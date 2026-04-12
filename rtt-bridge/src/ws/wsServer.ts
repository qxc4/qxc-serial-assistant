import { WebSocketServer, WebSocket } from 'ws'
import { RttManager } from '../services/rttManager.js'
import { RttConnectConfig, RttDataPayload, RttChannelInfo, RttLogLevel } from '../core/adapter.js'

/** 发送给客户端的 RTT 数据格式 */
interface RttClientData {
  id: number
  timestamp: number
  level: RttLogLevel
  channel: number
  text: string
}

/** 客户端消息类型 */
interface ClientMessage {
  type: 'connect' | 'disconnect' | 'send' | 'list_probes'
  config?: RttConnectConfig
  data?: string
  channel?: number
}

/** 服务端消息类型 */
interface ServerMessage {
  type: 'connected' | 'disconnected' | 'rtt_data' | 'error' | 'probe_list' | 'channels'
  data?: RttClientData
  probes?: Array<{
    identifier: string
    type: string
    serialNumber?: string
    vendorId?: number
    productId?: number
    displayName: string
  }>
  channels?: RttChannelInfo[]
  error?: string
  backend?: string
}

/** 日志 ID 计数器 */
let logIdCounter = 0

/**
 * WebSocket RTT 服务器
 * 负责与前端建立 WebSocket 连接并转发 RTT 数据
 */
export class RttWsServer {
  private wss: WebSocketServer
  private manager: RttManager
  private clients: Set<WebSocket> = new Set()

  constructor(port: number = 19022) {
    this.manager = new RttManager()
    this.wss = new WebSocketServer({ port })

    this.wss.on('connection', (ws) => {
      this.handleConnection(ws)
    })

    console.log(`[RTT Bridge] WebSocket 服务器已启动，监听端口 ${port}`)
  }

  /**
   * 处理新的 WebSocket 连接
   * @param ws WebSocket 实例
   */
  private handleConnection(ws: WebSocket): void {
    this.clients.add(ws)
    console.log(`[RTT Bridge] 客户端已连接，当前连接数: ${this.clients.size}`)

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientMessage
        this.handleMessage(ws, msg)
      } catch (err) {
        this.sendToClient(ws, {
          type: 'error',
          error: `消息解析失败: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    })

    ws.on('close', () => {
      this.clients.delete(ws)
      console.log(`[RTT Bridge] 客户端已断开，当前连接数: ${this.clients.size}`)

      if (this.clients.size === 0 && this.manager.isConnected) {
        this.manager.disconnect()
      }
    })

    ws.on('error', (err) => {
      console.error(`[RTT Bridge] WebSocket 错误: ${err.message}`)
      this.clients.delete(ws)
    })

    this.sendToClient(ws, {
      type: 'disconnected',
    })
  }

  /**
   * 处理客户端消息
   * @param ws WebSocket 实例
   * @param msg 客户端消息
   */
  private handleMessage(ws: WebSocket, msg: ClientMessage): void {
    switch (msg.type) {
      case 'connect':
        this.handleConnect(ws, msg.config!)
        break
      case 'disconnect':
        this.handleDisconnect()
        break
      case 'send':
        this.handleSend(msg.data!, msg.channel)
        break
      case 'list_probes':
        this.handleListProbes(ws)
        break
      default:
        this.sendToClient(ws, {
          type: 'error',
          error: `未知消息类型: ${(msg as ClientMessage).type}`,
        })
    }
  }

  /**
   * 处理连接请求
   * @param ws WebSocket 实例
   * @param config 连接配置
   */
  private handleConnect(ws: WebSocket, config: RttConnectConfig): void {
    if (!config) {
      this.sendToClient(ws, { type: 'error', error: '缺少连接配置' })
      return
    }

    this.manager.connect(
      config,
      (data: unknown) => {
        const payload = data as RttDataPayload
        this.broadcast({
          type: 'rtt_data',
          data: {
            id: ++logIdCounter,
            timestamp: payload.timestamp,
            level: payload.level,
            channel: payload.channel,
            text: payload.text,
          },
        })
      },
      (error: Error) => {
        this.broadcast({ type: 'error', error: error.message })
      },
      () => {
        this.broadcast({ type: 'disconnected' })
      },
      (channels: RttChannelInfo[]) => {
        this.broadcast({ type: 'channels', channels })
      },
    )

    this.broadcast({
      type: 'connected',
      backend: config.backend,
    })
  }

  /** 处理断开连接请求 */
  private handleDisconnect(): void {
    this.manager.disconnect()
    this.broadcast({ type: 'disconnected' })
  }

  /**
   * 处理发送数据请求
   * @param data 文本数据
   * @param channel 目标通道号
   */
  private handleSend(data: string, channel?: number): void {
    if (!data) return
    this.manager.send(data, channel)
  }

  /**
   * 处理列出探针请求
   * @param ws WebSocket 实例
   */
  private async handleListProbes(ws: WebSocket): Promise<void> {
    try {
      const probes = await this.manager.listProbes()
      this.sendToClient(ws, { type: 'probe_list', probes })
    } catch (err) {
      this.sendToClient(ws, {
        type: 'error',
        error: `获取探针列表失败: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  /**
   * 向指定客户端发送消息
   * @param ws WebSocket 实例
   * @param msg 服务端消息
   */
  private sendToClient(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }

  /**
   * 向所有客户端广播消息
   * @param msg 服务端消息
   */
  private broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg)
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    }
  }

  /** 关闭服务器 */
  close(): void {
    this.manager.destroy()
    this.wss.close()
    console.log('[RTT Bridge] 服务器已关闭')
  }
}
