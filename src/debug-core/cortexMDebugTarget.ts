import type { DebugTarget, MemoryAccess, TargetRunState } from './debugInterfaces'

const DHCSR = 0xe000edf0
const DCRSR = 0xe000edf4
const DCRDR = 0xe000edf8
const AIRCR = 0xe000ed0c
const FP_CTRL = 0xe0002000
const FP_COMP0 = 0xe0002008

const DHCSR_DBGKEY = 0xa05f0000
const DHCSR_C_DEBUGEN = 1 << 0
const DHCSR_C_HALT = 1 << 1
const DHCSR_C_STEP = 1 << 2
const DHCSR_S_HALT = 1 << 17
const DCRSR_REGWNR = 1 << 16
const AIRCR_VECTKEY = 0x05fa0000
const AIRCR_SYSRESETREQ = 1 << 2
const FP_CTRL_KEY = 1 << 1
const FP_CTRL_ENABLE = 1 << 0

export interface CortexMDebugTargetOptions {
  coreRegisterCount?: number
  breakpointSlots?: number
}

export class CortexMDebugTarget implements DebugTarget {
  private readonly memory: MemoryAccess
  private readonly coreRegisterCount: number
  private breakpointSlots: number | null
  private readonly breakpoints = new Map<number, number>()
  private fpbEnabled = false

  constructor(
    memory: MemoryAccess,
    options: CortexMDebugTargetOptions = {},
  ) {
    this.memory = memory
    this.coreRegisterCount = options.coreRegisterCount ?? 17
    this.breakpointSlots = options.breakpointSlots ?? null
  }

  async halt(): Promise<TargetRunState> {
    await this.writeRegister(DHCSR, DHCSR_DBGKEY | DHCSR_C_DEBUGEN | DHCSR_C_HALT)
    return this.readRunState()
  }

  async resume(): Promise<TargetRunState> {
    await this.writeRegister(DHCSR, DHCSR_DBGKEY | DHCSR_C_DEBUGEN)
    return 'running'
  }

  async reset(): Promise<TargetRunState> {
    await this.writeRegister(AIRCR, AIRCR_VECTKEY | AIRCR_SYSRESETREQ)
    return 'reset'
  }

  async step(): Promise<TargetRunState> {
    await this.writeRegister(DHCSR, DHCSR_DBGKEY | DHCSR_C_DEBUGEN | DHCSR_C_STEP)
    await this.writeRegister(DHCSR, DHCSR_DBGKEY | DHCSR_C_DEBUGEN | DHCSR_C_HALT)
    return 'halted'
  }

  async readCoreRegisters(): Promise<Uint32Array> {
    const registers = new Uint32Array(this.coreRegisterCount)
    for (let index = 0; index < this.coreRegisterCount; index++) {
      await this.writeRegister(DCRSR, index)
      registers[index] = await this.readRegister(DCRDR)
    }
    return registers
  }

  async writeCoreRegister(registerIndex: number, value: number): Promise<void> {
    this.assertCoreRegisterIndex(registerIndex)
    await this.writeRegister(DCRDR, value)
    await this.writeRegister(DCRSR, DCRSR_REGWNR | registerIndex)
  }

  async setHardwareBreakpoint(address: number): Promise<void> {
    if (this.breakpoints.has(address)) return

    const slot = await this.allocateBreakpointSlot()
    const comparatorAddress = FP_COMP0 + slot * 4
    await this.enableFpb()
    await this.writeRegister(comparatorAddress, encodeFpbComparator(address))
    this.breakpoints.set(address, slot)
  }

  async clearHardwareBreakpoint(address: number): Promise<void> {
    const slot = this.breakpoints.get(address)
    if (slot === undefined) return

    await this.writeRegister(FP_COMP0 + slot * 4, 0)
    this.breakpoints.delete(address)
  }

  private async allocateBreakpointSlot(): Promise<number> {
    const slotCount = await this.getBreakpointSlotCount()
    for (let slot = 0; slot < slotCount; slot++) {
      if (![...this.breakpoints.values()].includes(slot)) return slot
    }
    throw new Error('No free Cortex-M FPB breakpoint comparator')
  }

  private async getBreakpointSlotCount(): Promise<number> {
    if (this.breakpointSlots !== null) return this.breakpointSlots

    const fpCtrl = await this.readRegister(FP_CTRL)
    const lowSlots = (fpCtrl >> 4) & 0x0f
    const highSlots = (fpCtrl >> 12) & 0x07
    this.breakpointSlots = lowSlots | (highSlots << 4)
    if (this.breakpointSlots === 0) {
      throw new Error('Cortex-M FPB reports no breakpoint comparators')
    }
    return this.breakpointSlots
  }

  private async enableFpb(): Promise<void> {
    if (this.fpbEnabled) return
    await this.writeRegister(FP_CTRL, FP_CTRL_KEY | FP_CTRL_ENABLE)
    this.fpbEnabled = true
  }

  private async readRunState(): Promise<TargetRunState> {
    const dhcsr = await this.readRegister(DHCSR)
    return (dhcsr & DHCSR_S_HALT) !== 0 ? 'halted' : 'unknown'
  }

  private assertCoreRegisterIndex(registerIndex: number): void {
    if (!Number.isInteger(registerIndex) || registerIndex < 0 || registerIndex > 32) {
      throw new Error(`Invalid Cortex-M core register index: ${registerIndex}`)
    }
  }

  private async readRegister(address: number): Promise<number> {
    return (await this.memory.read32(address, 1))[0] ?? 0
  }

  private async writeRegister(address: number, value: number): Promise<void> {
    await this.memory.write32(address, new Uint32Array([value >>> 0]))
  }
}

function encodeFpbComparator(address: number): number {
  const halfwordSelector = (address & 0x02) !== 0 ? 0x80000000 : 0x40000000
  return ((address & 0x1ffffffc) | halfwordSelector | 1) >>> 0
}
