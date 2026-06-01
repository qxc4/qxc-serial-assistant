import type { DebugTarget, MemoryAccess } from './debugInterfaces'
import type { GdbRspAdapter } from './gdbRspCore'

export interface DebugTargetRspAdapterOptions {
  stopSignal?: string
}

export class DebugTargetRspAdapter implements GdbRspAdapter {
  private readonly target: DebugTarget
  private readonly memory: MemoryAccess
  private readonly stopSignal: string

  constructor(
    target: DebugTarget,
    memory: MemoryAccess,
    options: DebugTargetRspAdapterOptions = {},
  ) {
    this.target = target
    this.memory = memory
    this.stopSignal = options.stopSignal ?? 'S05'
  }

  async haltReason(): Promise<string> {
    return this.stopSignal
  }

  async readRegisters(): Promise<string> {
    const registers = await this.target.readCoreRegisters()
    const bytes = new Uint8Array(registers.length * 4)
    const view = new DataView(bytes.buffer)
    registers.forEach((register, index) => view.setUint32(index * 4, register, true))
    return bytesToHex(bytes)
  }

  async writeRegisters(hex: string): Promise<boolean> {
    const bytes = hexToBytes(hex)
    if (bytes.length % 4 !== 0) return false

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let index = 0; index < bytes.length / 4; index++) {
      await this.target.writeCoreRegister(index, view.getUint32(index * 4, true))
    }
    return true
  }

  async readMemory(address: number, length: number): Promise<Uint8Array> {
    return this.memory.read8(address, length)
  }

  async writeMemory(address: number, data: Uint8Array): Promise<boolean> {
    await this.memory.write8(address, data)
    return true
  }

  async continue(address?: number): Promise<string> {
    if (address !== undefined) {
      await this.target.writeCoreRegister(15, address)
    }
    await this.target.resume()
    return 'OK'
  }

  async step(address?: number): Promise<string> {
    if (address !== undefined) {
      await this.target.writeCoreRegister(15, address)
    }
    await this.target.step()
    return this.stopSignal
  }

  async setBreakpoint(address: number, _kind: number, type: string): Promise<boolean> {
    if (type !== '1') return false
    await this.target.setHardwareBreakpoint(address)
    return true
  }

  async clearBreakpoint(address: number, _kind: number, type: string): Promise<boolean> {
    if (type !== '1') return false
    await this.target.clearHardwareBreakpoint(address)
    return true
  }

  async qSupported(): Promise<string> {
    return 'PacketSize=4000;qXfer:features:read-'
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex payload must contain an even number of digits')
  }

  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < bytes.length; index++) {
    const value = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid hexadecimal byte at offset ${index}`)
    }
    bytes[index] = value
  }
  return bytes
}
