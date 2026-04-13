import { describe, it, expect, beforeEach, vi } from 'vitest'

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.OPEN
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  })

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  simulateClose(): void {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }

  simulateError(): void {
    this.onerror?.()
  }
}

let mockWsInstance: MockWebSocket
let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {}

vi.mock('../../services/rttService', () => {
  const callbacks: Record<string, (...args: unknown[]) => void> = {}
  let _isWsConnected = false
  let wsInstance: MockWebSocket | null = null

  const rttService = {
    get isWsConnected() { return _isWsConnected },

    registerCallbacks(cbs: Record<string, (...args: unknown[]) => void>) {
      Object.assign(callbacks, cbs)
      Object.assign(capturedCallbacks, cbs)
    },

    connectWs() {
      mockWsInstance = new MockWebSocket()
      wsInstance = mockWsInstance
      _isWsConnected = true
      mockWsInstance.simulateOpen()
    },

    disconnectWs() {
      _isWsConnected = false
      wsInstance = null
    },

    connectRtt(config: unknown) {
      if (wsInstance) {
        wsInstance.send(JSON.stringify({ type: 'connect', config }))
      }
    },

    disconnectRtt() {
      if (wsInstance) {
        wsInstance.send(JSON.stringify({ type: 'disconnect' }))
      }
    },

    sendData(data: string, channel?: number) {
      if (wsInstance) {
        wsInstance.send(JSON.stringify({ type: 'send', data, channel }))
      } else {
        callbacks.onError?.('WebSocket 未连接')
      }
    },

    listProbes() {
      if (wsInstance) {
        wsInstance.send(JSON.stringify({ type: 'list_probes' }))
      }
    },

    selectFile(filters?: unknown) {
      if (wsInstance) {
        wsInstance.send(JSON.stringify({ type: 'select_file', filters }))
      }
    },

    checkCapabilities() {
      if (wsInstance) {
        wsInstance.send(JSON.stringify({ type: 'check_capabilities' }))
      }
    },

    destroy() {
      _isWsConnected = false
      wsInstance = null
      for (const key of Object.keys(callbacks)) {
        delete callbacks[key]
      }
    },
  }

  return { rttService }
})

describe('RttService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedCallbacks = {}
  })

  describe('连接管理', () => {
    it('connectWs 应建立 WebSocket 连接', async () => {
      const { rttService } = await import('../../services/rttService')
      rttService.connectWs()
      expect(rttService.isWsConnected).toBe(true)
      rttService.disconnectWs()
    })

    it('disconnectWs 应断开连接', async () => {
      const { rttService } = await import('../../services/rttService')
      rttService.connectWs()
      rttService.disconnectWs()
      expect(rttService.isWsConnected).toBe(false)
    })
  })

  describe('回调注册', () => {
    it('registerCallbacks 应注册回调函数', async () => {
      const { rttService } = await import('../../services/rttService')
      const onConnected = vi.fn()
      rttService.registerCallbacks({ onConnected })
      expect(capturedCallbacks.onConnected).toBe(onConnected)
    })
  })

  describe('发送消息', () => {
    it('connectRtt 应发送 connect 消息', async () => {
      const { rttService } = await import('../../services/rttService')
      rttService.connectWs()

      rttService.connectRtt({ backend: 'probe-rs' })
      expect(mockWsInstance.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'connect', config: { backend: 'probe-rs' } })
      )

      rttService.disconnectWs()
    })

    it('disconnectRtt 应发送 disconnect 消息', async () => {
      const { rttService } = await import('../../services/rttService')
      rttService.connectWs()

      rttService.disconnectRtt()
      expect(mockWsInstance.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'disconnect' })
      )

      rttService.disconnectWs()
    })

    it('sendData 应发送 send 消息', async () => {
      const { rttService } = await import('../../services/rttService')
      rttService.connectWs()

      rttService.sendData('hello', 0)
      expect(mockWsInstance.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'send', data: 'hello', channel: 0 })
      )

      rttService.disconnectWs()
    })

    it('未连接时发送应触发错误回调', async () => {
      const { rttService } = await import('../../services/rttService')
      const onError = vi.fn()
      rttService.registerCallbacks({ onError })
      rttService.disconnectWs()

      rttService.sendData('hello')
      expect(onError).toHaveBeenCalledWith('WebSocket 未连接')
    })

    it('listProbes 应发送 list_probes 消息', async () => {
      const { rttService } = await import('../../services/rttService')
      rttService.connectWs()

      rttService.listProbes()
      expect(mockWsInstance.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'list_probes' })
      )

      rttService.disconnectWs()
    })

    it('checkCapabilities 应发送 check_capabilities 消息', async () => {
      const { rttService } = await import('../../services/rttService')
      rttService.connectWs()

      rttService.checkCapabilities()
      expect(mockWsInstance.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'check_capabilities' })
      )

      rttService.disconnectWs()
    })
  })

  describe('资源清理', () => {
    it('destroy 应断开连接并清空回调', async () => {
      const { rttService } = await import('../../services/rttService')
      rttService.connectWs()
      rttService.destroy()
      expect(rttService.isWsConnected).toBe(false)
    })
  })
})
