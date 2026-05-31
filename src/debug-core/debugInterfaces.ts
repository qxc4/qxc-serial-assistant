import type { ProgramImage, ProgramSection } from './programImage'
import type { RttControlBlock } from './rttCore'

export type DebugProtocol = 'swd' | 'jtag'
export type TargetRunState = 'unknown' | 'running' | 'halted' | 'reset' | 'error'
export type ProbeKind = 'stlink' | 'cmsis-dap' | 'jlink' | 'unknown'

export interface ProbeIdentity {
  kind: ProbeKind
  displayName: string
  vendorId?: number
  productId?: number
  serialNumber?: string
}

export interface ProbeDriver {
  readonly identity: ProbeIdentity | null
  connect(): Promise<void>
  disconnect(): Promise<void>
  setProtocol(protocol: DebugProtocol): Promise<void>
  setFrequency(frequencyHz: number): Promise<void>
}

export interface MemoryAccess {
  read8(address: number, length: number): Promise<Uint8Array>
  write8(address: number, data: Uint8Array): Promise<void>
  read32(address: number, words: number): Promise<Uint32Array>
  write32(address: number, words: Uint32Array): Promise<void>
}

export interface DebugTarget {
  halt(): Promise<TargetRunState>
  resume(): Promise<TargetRunState>
  reset(): Promise<TargetRunState>
  step(): Promise<TargetRunState>
  readCoreRegisters(): Promise<Uint32Array>
  writeCoreRegister(registerIndex: number, value: number): Promise<void>
  setHardwareBreakpoint(address: number): Promise<void>
  clearHardwareBreakpoint(address: number): Promise<void>
}

export interface RttSession {
  readonly controlBlock: RttControlBlock | null
  scan(searchStart: number, searchEnd: number): Promise<RttControlBlock>
  readUpChannel(channel: number): Promise<Uint8Array>
  writeDownChannel(channel: number, data: Uint8Array): Promise<void>
}

export interface FlashProgrammer {
  erasePages(addresses: number[]): Promise<void>
  programSections(sections: ProgramSection[]): Promise<void>
  verifySections(sections: ProgramSection[]): Promise<boolean>
  programImage(image: ProgramImage): Promise<void>
}
