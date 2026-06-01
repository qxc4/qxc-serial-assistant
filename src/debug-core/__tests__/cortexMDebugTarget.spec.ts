import { describe, expect, it } from 'vitest'
import { CortexMDebugTarget } from '../cortexMDebugTarget'
import type { MemoryAccess } from '../debugInterfaces'

class RegisterMemory implements MemoryAccess {
  readonly registers = new Map<number, number>()
  readonly writes: Array<{ address: number; value: number }> = []
  private dcrsrReads = 0

  async read8(): Promise<Uint8Array> {
    throw new Error('read8 not used by this test')
  }

  async write8(): Promise<void> {
    throw new Error('write8 not used by this test')
  }

  async read32(address: number, words: number): Promise<Uint32Array> {
    const values = new Uint32Array(words)
    for (let index = 0; index < words; index++) {
      const currentAddress = address + index * 4
      if (currentAddress === 0xe000edf8) {
        values[index] = 0x1000 + this.dcrsrReads++
      } else {
        values[index] = this.registers.get(currentAddress) ?? 0
      }
    }
    return values
  }

  async write32(address: number, words: Uint32Array): Promise<void> {
    words.forEach((word, index) => {
      const currentAddress = address + index * 4
      this.registers.set(currentAddress, word >>> 0)
      this.writes.push({ address: currentAddress, value: word >>> 0 })
    })
  }
}

describe('CortexMDebugTarget', () => {
  it('halts, resumes, steps, and resets through Cortex-M debug registers', async () => {
    const memory = new RegisterMemory()
    memory.registers.set(0xe000edf0, 1 << 17)
    const target = new CortexMDebugTarget(memory, { breakpointSlots: 2 })

    expect(await target.halt()).toBe('halted')
    expect(await target.resume()).toBe('running')
    expect(await target.step()).toBe('halted')
    expect(await target.reset()).toBe('reset')

    expect(memory.writes.map(write => [write.address, write.value])).toEqual([
      [0xe000edf0, 0xa05f0003],
      [0xe000edf0, 0xa05f0001],
      [0xe000edf0, 0xa05f0005],
      [0xe000edf0, 0xa05f0003],
      [0xe000ed0c, 0x05fa0004],
    ])
  })

  it('reads and writes core registers through DCRSR and DCRDR', async () => {
    const memory = new RegisterMemory()
    const target = new CortexMDebugTarget(memory, { coreRegisterCount: 3, breakpointSlots: 2 })

    expect(Array.from(await target.readCoreRegisters())).toEqual([0x1000, 0x1001, 0x1002])
    await target.writeCoreRegister(15, 0x08001235)

    expect(memory.writes.map(write => [write.address, write.value])).toEqual([
      [0xe000edf4, 0],
      [0xe000edf4, 1],
      [0xe000edf4, 2],
      [0xe000edf8, 0x08001235],
      [0xe000edf4, 0x0001000f],
    ])
  })

  it('allocates and clears FPB hardware breakpoint comparators', async () => {
    const memory = new RegisterMemory()
    memory.registers.set(0xe0002000, 0x00000030)
    const target = new CortexMDebugTarget(memory)

    await target.setHardwareBreakpoint(0x08000124)
    await target.setHardwareBreakpoint(0x08000126)
    await target.clearHardwareBreakpoint(0x08000124)

    expect(memory.writes.map(write => [write.address, write.value])).toEqual([
      [0xe0002000, 0x00000003],
      [0xe0002008, 0x48000125],
      [0xe000200c, 0x88000125],
      [0xe0002008, 0],
    ])
  })

  it('reports hardware breakpoint slot usage', async () => {
    const memory = new RegisterMemory()
    memory.registers.set(0xe0002000, 0x00000030)
    const target = new CortexMDebugTarget(memory)

    await target.setHardwareBreakpoint(0x08000124)

    expect(await target.getHardwareBreakpointStatus()).toEqual({
      used: 1,
      total: 3,
      remaining: 2,
    })
  })
})
