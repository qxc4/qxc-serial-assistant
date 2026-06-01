import { describe, expect, it } from 'vitest'
import { inspectGlobalVariables, type VariableSpec } from '../variableInspector'
import type { MemoryAccess } from '../debugInterfaces'

class MockMemory implements MemoryAccess {
  private readonly memory: Map<number, number>

  constructor(memory: Map<number, number>) {
    this.memory = memory
  }

  async read8(address: number, length: number): Promise<Uint8Array> {
    const out = new Uint8Array(length)
    for (let i = 0; i < length; i++) {
      out[i] = this.memory.get(address + i) ?? 0
    }
    return out
  }

  async write8(): Promise<void> {
    throw new Error('write8 not used')
  }

  async read32(): Promise<Uint32Array> {
    throw new Error('read32 not used')
  }

  async write32(): Promise<void> {
    throw new Error('write32 not used')
  }
}

describe('variableInspector', () => {
  it('reads primitive global variables from memory', async () => {
    const memory = new Map<number, number>([
      [0x20000000, 0x7f],
      [0x20000010, 0x34], [0x20000011, 0x12],
      [0x20000020, 0x78], [0x20000021, 0x56], [0x20000022, 0x34], [0x20000023, 0x12],
      [0x20000030, 0x00], [0x20000031, 0x00], [0x20000032, 0x20], [0x20000033, 0x41],
    ])

    const specs: VariableSpec[] = [
      { name: 'g_u8', address: 0x20000000, type: 'u8' },
      { name: 'g_u16', address: 0x20000010, type: 'u16' },
      { name: 'g_u32', address: 0x20000020, type: 'u32' },
      { name: 'g_f32', address: 0x20000030, type: 'f32' },
    ]

    const result = await inspectGlobalVariables(specs, new MockMemory(memory))
    expect(result).toEqual([
      { name: 'g_u8', address: 0x20000000, type: 'u8', value: 127 },
      { name: 'g_u16', address: 0x20000010, type: 'u16', value: 0x1234 },
      { name: 'g_u32', address: 0x20000020, type: 'u32', value: 0x12345678 },
      { name: 'g_f32', address: 0x20000030, type: 'f32', value: 10 },
    ])
  })

  it('marks unreadable variables with error', async () => {
    const brokenMemory: MemoryAccess = {
      async read8() {
        throw new Error('rdp locked')
      },
      async write8() { throw new Error('unused') },
      async read32() { throw new Error('unused') },
      async write32() { throw new Error('unused') },
    }

    const result = await inspectGlobalVariables(
      [{ name: 'g_i32', address: 0x20000040, type: 'i32' }],
      brokenMemory,
    )

    expect(result).toEqual([
      { name: 'g_i32', address: 0x20000040, type: 'i32', value: null, error: 'rdp locked' },
    ])
  })
})
