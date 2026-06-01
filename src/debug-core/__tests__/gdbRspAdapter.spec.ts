import { describe, expect, it } from 'vitest'
import { DebugTargetRspAdapter } from '../gdbRspAdapter'
import type { DebugTarget, MemoryAccess, TargetRunState } from '../debugInterfaces'

class MockTarget implements DebugTarget {
  readonly calls: string[] = []
  private registers = new Uint32Array([0x12345678, 0x08000125, 0x20001000])

  async halt(): Promise<TargetRunState> {
    this.calls.push('halt')
    return 'halted'
  }

  async resume(): Promise<TargetRunState> {
    this.calls.push('resume')
    return 'running'
  }

  async reset(): Promise<TargetRunState> {
    this.calls.push('reset')
    return 'reset'
  }

  async step(): Promise<TargetRunState> {
    this.calls.push('step')
    return 'halted'
  }

  async readCoreRegisters(): Promise<Uint32Array> {
    this.calls.push('readCoreRegisters')
    return this.registers
  }

  async writeCoreRegister(registerIndex: number, value: number): Promise<void> {
    this.calls.push(`writeCoreRegister:${registerIndex}:${value.toString(16)}`)
  }

  async setHardwareBreakpoint(address: number): Promise<void> {
    this.calls.push(`setHardwareBreakpoint:${address.toString(16)}`)
  }

  async clearHardwareBreakpoint(address: number): Promise<void> {
    this.calls.push(`clearHardwareBreakpoint:${address.toString(16)}`)
  }
}

class MockMemory implements MemoryAccess {
  readonly calls: string[] = []

  async read8(address: number, length: number): Promise<Uint8Array> {
    this.calls.push(`read8:${address.toString(16)}:${length}`)
    return new Uint8Array([0x12, 0xab, 0x00])
  }

  async write8(address: number, data: Uint8Array): Promise<void> {
    this.calls.push(`write8:${address.toString(16)}:${Array.from(data).join(',')}`)
  }

  async read32(): Promise<Uint32Array> {
    throw new Error('read32 not used by this test')
  }

  async write32(): Promise<void> {
    throw new Error('write32 not used by this test')
  }
}

describe('DebugTargetRspAdapter', () => {
  it('encodes and writes Cortex-M registers as little-endian RSP payloads', async () => {
    const target = new MockTarget()
    const adapter = new DebugTargetRspAdapter(target, new MockMemory())

    expect(await adapter.readRegisters()).toBe('785634122501000800100020')
    expect(await adapter.writeRegisters('010000000200000003000000')).toBe(true)

    expect(target.calls).toEqual([
      'readCoreRegisters',
      'writeCoreRegister:0:1',
      'writeCoreRegister:1:2',
      'writeCoreRegister:2:3',
    ])
  })

  it('proxies memory, execution, and hardware breakpoint RSP operations', async () => {
    const target = new MockTarget()
    const memory = new MockMemory()
    const adapter = new DebugTargetRspAdapter(target, memory)

    expect(Array.from(await adapter.readMemory(0x20000000, 3))).toEqual([0x12, 0xab, 0x00])
    expect(await adapter.writeMemory(0x20000004, new Uint8Array([1, 2]))).toBe(true)
    expect(await adapter.continue(0x08000124)).toBe('OK')
    expect(await adapter.step(0x08000128)).toBe('S05')
    expect(await adapter.setBreakpoint(0x08000124, 2, '1')).toBe(true)
    expect(await adapter.clearBreakpoint(0x08000124, 2, '1')).toBe(true)
    expect(await adapter.setBreakpoint(0x08000124, 2, '0')).toBe(false)

    expect(memory.calls).toEqual(['read8:20000000:3', 'write8:20000004:1,2'])
    expect(target.calls).toEqual([
      'writeCoreRegister:15:8000124',
      'resume',
      'writeCoreRegister:15:8000128',
      'step',
      'setHardwareBreakpoint:8000124',
      'clearHardwareBreakpoint:8000124',
    ])
  })
})
