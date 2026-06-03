import { describe, expect, it, vi } from 'vitest'
import { createDefaultSerialSession } from '../serialSessionController'
import {
  createSerialSessionManager,
  createSerialSessionRuntime,
  createWebSerialSessionTransport,
  type SerialSessionTransport,
} from '../serialSessionRuntime'

function createMockTransport(label = 'Mock CDC'): SerialSessionTransport {
  let onData: ((bytes: Uint8Array) => void) | null = null
  return {
    async connect(handler) {
      onData = handler
      return { label }
    },
    async disconnect() {
      onData = null
    },
    send: vi.fn(async () => undefined),
    emit(bytes: number[]) {
      onData?.(new Uint8Array(bytes))
    },
  }
}

describe('serialSessionRuntime', () => {
  it('connects, sends and records isolated tx/rx logs', async () => {
    const transport = createMockTransport('USB CDC A')
    const runtime = createSerialSessionRuntime(createDefaultSerialSession('2026-06-03T00:00:00.000Z'), transport)

    await runtime.connect()
    await runtime.send(new Uint8Array([0x41, 0x42]))
    transport.emit?.([0x43])

    expect(runtime.state.isConnected).toBe(true)
    expect(runtime.state.connectionLabel).toBe('USB CDC A')
    expect(runtime.state.stats).toEqual({ txBytes: 2, rxBytes: 1, events: 2 })
    expect(runtime.state.logs.map(item => item.direction)).toEqual(['tx', 'rx'])
  })

  it('rejects sending before connection and closes cleanly', async () => {
    const runtime = createSerialSessionRuntime(createDefaultSerialSession(), createMockTransport())

    await expect(runtime.send(new Uint8Array([0x01]))).rejects.toThrow('会话未连接')
    await runtime.connect()
    await runtime.disconnect()

    expect(runtime.state.isConnected).toBe(false)
    expect(runtime.state.connectionLabel).toBe('未连接')
  })

  it('manages multiple independent experimental sessions with a hard limit', () => {
    const manager = createSerialSessionManager({ maxSessions: 2 })
    const first = manager.addRuntime(createDefaultSerialSession(), createMockTransport('A'))
    const second = manager.addRuntime({ ...createDefaultSerialSession(), id: 'session-2', isDefault: false }, createMockTransport('B'))

    expect(manager.activeRuntime()?.session.id).toBe(first.session.id)
    expect(manager.setActiveRuntime(second.session.id)).toBe(true)
    expect(manager.activeRuntime()?.session.id).toBe(second.session.id)
    expect(() => manager.addRuntime({ ...createDefaultSerialSession(), id: 'session-3' }, createMockTransport('C'))).toThrow(/最多/)
  })

  it('wraps a Web Serial port as an experimental session transport', async () => {
    const write = vi.fn(async () => undefined)
    const releaseWriter = vi.fn()
    const close = vi.fn(async () => undefined)
    const open = vi.fn(async () => undefined)
    const port = {
      readable: null,
      writable: {
        getWriter: () => ({
          write,
          releaseLock: releaseWriter,
        }),
      },
      open,
      close,
      getInfo: () => ({ usbVendorId: 0x1234, usbProductId: 0xabcd }),
    } as unknown as SerialPort
    const serial = {
      requestPort: vi.fn(async () => port),
    } as unknown as Serial

    const transport = createWebSerialSessionTransport({
      serial,
      serialOptions: { baudRate: 115200 },
    })

    const connection = await transport.connect(() => undefined)
    await transport.send(new Uint8Array([0x41]))
    await transport.disconnect()

    expect(serial.requestPort).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith({ baudRate: 115200 })
    expect(connection.label).toBe('USB 1234:ABCD')
    expect(write).toHaveBeenCalledWith(new Uint8Array([0x41]))
    expect(releaseWriter).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })
})
