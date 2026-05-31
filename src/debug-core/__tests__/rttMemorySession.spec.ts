import { describe, expect, it } from 'vitest'
import { RttMemorySession } from '../rttMemorySession'
import type { MemoryAccess } from '../debugInterfaces'

class MockMemory implements MemoryAccess {
  readonly data: Uint8Array
  readonly base: number

  constructor(data: Uint8Array, base = 0x20000000) {
    this.data = data
    this.base = base
  }

  async read8(address: number, length: number): Promise<Uint8Array> {
    const offset = address - this.base
    return this.data.slice(offset, offset + length)
  }

  async write8(address: number, bytes: Uint8Array): Promise<void> {
    this.data.set(bytes, address - this.base)
  }

  async read32(): Promise<Uint32Array> {
    throw new Error('read32 not used by this test')
  }

  async write32(): Promise<void> {
    throw new Error('write32 not used by this test')
  }
}

function writeU32(memory: Uint8Array, offset: number, value: number): void {
  new DataView(memory.buffer).setUint32(offset, value, true)
}

describe('RttMemorySession', () => {
  it('scans RTT control block at non-page-aligned addresses', async () => {
    const memory = new Uint8Array(0x2000)
    const cbOffset = 0x123
    memory.set(new TextEncoder().encode('SEGGER RTT'), cbOffset)
    writeU32(memory, cbOffset + 16, 1)
    writeU32(memory, cbOffset + 20, 0)
    writeU32(memory, cbOffset + 24, 0x20001000)
    writeU32(memory, cbOffset + 28, 16)

    const session = new RttMemorySession(new MockMemory(memory))
    const block = await session.scan(0x20000000, 0x20002000, { chunkSize: 256, stepSize: 16 })

    expect(block.address).toBe(0x20000123)
    expect(block.upBuffers[0].bufferAddress).toBe(0x20001000)
  })

  it('reads up channel data and advances the RTT read offset', async () => {
    const memory = new Uint8Array(0x2000)
    const cbOffset = 0x100
    const bufferOffset = 0x1000
    memory.set(new TextEncoder().encode('SEGGER RTT'), cbOffset)
    writeU32(memory, cbOffset + 16, 1)
    writeU32(memory, cbOffset + 20, 0)
    writeU32(memory, cbOffset + 24, 0x20001000)
    writeU32(memory, cbOffset + 28, 8)
    writeU32(memory, cbOffset + 32, 2)
    writeU32(memory, cbOffset + 36, 6)
    memory.set(new TextEncoder().encode('ABCD1234'), bufferOffset)

    const session = new RttMemorySession(new MockMemory(memory))
    await session.scan(0x20000000, 0x20002000, { chunkSize: 256, stepSize: 16 })
    const data = await session.readUpChannel(0)

    expect(new TextDecoder().decode(data)).toBe('34AB')
    expect(new DataView(memory.buffer).getUint32(cbOffset + 36, true)).toBe(2)
  })

  it('writes down channel data and advances the RTT write offset', async () => {
    const memory = new Uint8Array(0x2000)
    const cbOffset = 0x100
    const bufferOffset = 0x1000
    memory.set(new TextEncoder().encode('SEGGER RTT'), cbOffset)
    writeU32(memory, cbOffset + 16, 0)
    writeU32(memory, cbOffset + 20, 1)
    writeU32(memory, cbOffset + 24, 0x20001000)
    writeU32(memory, cbOffset + 28, 8)
    writeU32(memory, cbOffset + 32, 6)
    writeU32(memory, cbOffset + 36, 2)

    const session = new RttMemorySession(new MockMemory(memory))
    await session.scan(0x20000000, 0x20002000, { chunkSize: 256, stepSize: 16 })
    await session.writeDownChannel(0, new TextEncoder().encode('XYZ'))

    expect(new TextDecoder().decode(memory.slice(bufferOffset + 6, bufferOffset + 8))).toBe('XY')
    expect(new TextDecoder().decode(memory.slice(bufferOffset, bufferOffset + 1))).toBe('Z')
    expect(new DataView(memory.buffer).getUint32(cbOffset + 32, true)).toBe(1)
  })
})
