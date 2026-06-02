import type { DebugProtocol, MemoryAccess, ProbeDriver, ProbeIdentity } from './debugInterfaces'
import type { FlashBackend } from './flashProgrammer'

export interface MockMemoryTargetOptions {
  baseAddress?: number
  size?: number
  identity?: ProbeIdentity
}

export class MockMemoryTarget implements MemoryAccess, FlashBackend {
  readonly baseAddress: number
  readonly memory: Uint8Array
  readonly writes: Array<{ address: number; data: Uint8Array }> = []
  readonly erasedPages: number[] = []

  constructor(options: MockMemoryTargetOptions = {}) {
    this.baseAddress = options.baseAddress ?? 0x20000000
    this.memory = new Uint8Array(options.size ?? 0x10000)
  }

  seed(address: number, data: Uint8Array): void {
    this.memory.set(data, this.offset(address))
  }

  seedUint32(address: number, value: number): void {
    new DataView(this.memory.buffer).setUint32(this.offset(address), value >>> 0, true)
  }

  async read8(address: number, length: number): Promise<Uint8Array> {
    const offset = this.offset(address)
    return this.memory.slice(offset, offset + length)
  }

  async write8(address: number, data: Uint8Array): Promise<void> {
    this.memory.set(data, this.offset(address))
    this.writes.push({ address, data: new Uint8Array(data) })
  }

  async read32(address: number, words: number): Promise<Uint32Array> {
    const values = new Uint32Array(words)
    const view = new DataView(this.memory.buffer)
    for (let index = 0; index < words; index++) {
      values[index] = view.getUint32(this.offset(address + index * 4), true)
    }
    return values
  }

  async write32(address: number, words: Uint32Array): Promise<void> {
    const bytes = new Uint8Array(words.length * 4)
    const view = new DataView(bytes.buffer)
    words.forEach((word, index) => {
      view.setUint32(index * 4, word >>> 0, true)
    })
    await this.write8(address, bytes)
  }

  async erasePage(address: number): Promise<void> {
    this.erasedPages.push(address)
    this.memory.fill(0xff, this.offset(address), Math.min(this.offset(address) + 1024, this.memory.length))
  }

  async program(address: number, data: Uint8Array): Promise<void> {
    await this.write8(address, data)
  }

  async read(address: number, length: number): Promise<Uint8Array> {
    return this.read8(address, length)
  }

  private offset(address: number): number {
    const offset = address - this.baseAddress
    if (offset < 0 || offset >= this.memory.length) {
      throw new Error(`Mock memory address out of range: 0x${address.toString(16)}`)
    }
    return offset
  }
}

export class ProbeMockDriver implements ProbeDriver {
  identity: ProbeIdentity | null
  protocol: DebugProtocol = 'swd'
  frequencyHz = 4_000_000
  connected = false

  constructor(identity: ProbeIdentity = { kind: 'stlink', displayName: 'Mock ST-Link' }) {
    this.identity = identity
  }

  async connect(): Promise<void> {
    this.connected = true
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  async setProtocol(protocol: DebugProtocol): Promise<void> {
    this.protocol = protocol
  }

  async setFrequency(frequencyHz: number): Promise<void> {
    this.frequencyHz = frequencyHz
  }
}
