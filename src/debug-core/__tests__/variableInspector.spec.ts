import { describe, expect, it } from 'vitest'
import {
  createVariableSpecsFromSymbols,
  findFunctionSymbolAtPc,
  inspectGlobalVariables,
  summarizeVariableImage,
  type VariableSpec,
} from '../variableInspector'
import type { MemoryAccess } from '../debugInterfaces'
import type { ProgramImage, ProgramSymbol } from '../programImage'

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
      { name: 'g_u8', address: 0x20000000, type: 'u8', value: 127, byteSize: undefined, displayKind: undefined, note: undefined },
      { name: 'g_u16', address: 0x20000010, type: 'u16', value: 0x1234, byteSize: undefined, displayKind: undefined, note: undefined },
      { name: 'g_u32', address: 0x20000020, type: 'u32', value: 0x12345678, byteSize: undefined, displayKind: undefined, note: undefined },
      { name: 'g_f32', address: 0x20000030, type: 'f32', value: 10, byteSize: undefined, displayKind: undefined, note: undefined },
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
      { name: 'g_i32', address: 0x20000040, type: 'i32', value: null, byteSize: undefined, displayKind: undefined, note: undefined, error: 'rdp locked' },
    ])
  })

  it('creates readable and best-effort variable specs from ELF symbols', () => {
    const symbols: ProgramSymbol[] = [
      { name: 'main', address: 0x08000100, size: 80, type: 'func' },
      { name: 'g_counter', address: 0x20000000, size: 4, type: 'object' },
      { name: 'rx_buffer', address: 0x20000020, size: 64, type: 'object' },
      { name: 'zero_size', address: 0x20000080, size: 0, type: 'object' },
    ]

    expect(createVariableSpecsFromSymbols(symbols)).toEqual([
      { name: 'g_counter', address: 0x20000000, type: 'u32', byteSize: 4, displayKind: 'primitive' },
      {
        name: 'rx_buffer',
        address: 0x20000020,
        type: 'u32',
        byteSize: 64,
        displayKind: 'array',
        note: '复合类型缺少完整 DWARF 类型信息，当前仅读取首个 32-bit word',
      },
      {
        name: 'zero_size',
        address: 0x20000080,
        type: 'u32',
        byteSize: 0,
        displayKind: 'unknown',
        note: '复合类型缺少完整 DWARF 类型信息，当前仅读取首个 32-bit word',
      },
    ])
  })

  it('finds current function by PC and summarizes variable image', () => {
    const symbols: ProgramSymbol[] = [
      { name: 'Reset_Handler', address: 0x08000000, size: 32, type: 'func' },
      { name: 'main', address: 0x08000100, size: 96, type: 'func' },
      { name: 'g_state', address: 0x20000000, size: 4, type: 'object' },
      { name: 'app_context', address: 0x20000100, size: 24, type: 'object' },
    ]
    const image: ProgramImage = { format: 'elf', sections: [], symbols }

    expect(findFunctionSymbolAtPc(symbols, 0x08000120)?.name).toBe('main')
    expect(summarizeVariableImage(image, 0x08000120)).toEqual({
      totalSymbols: 4,
      objectSymbols: 2,
      functionSymbols: 2,
      readableVariables: 1,
      bestEffortVariables: 1,
      currentFunction: symbols[1],
    })
  })
})
