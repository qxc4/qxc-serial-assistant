import type {
  DebugProtocol,
  DebugTarget,
  MemoryAccess,
  ProbeDriver,
  ProbeIdentity,
  TargetRunState,
} from './debugInterfaces'
import { CortexMDebugTarget } from './cortexMDebugTarget'

type DapJsModule = typeof import('dapjs')
type CortexMInstance = InstanceType<DapJsModule['CortexM']>

const DEFAULT_CMSIS_DAP_FILTERS: USBDeviceFilter[] = [
  { vendorId: 0x0d28 },
  { vendorId: 0x2e8a },
  { vendorId: 0x1fc9 },
  { vendorId: 0xc251 },
]

function toBytes(words: Uint32Array, byteLength: number): Uint8Array {
  const bytes = new Uint8Array(words.length * 4)
  const view = new DataView(bytes.buffer)
  words.forEach((word, index) => view.setUint32(index * 4, word, true))
  return bytes.slice(0, byteLength)
}

function toWords(bytes: Uint8Array): Uint32Array {
  const paddedLength = Math.ceil(bytes.length / 4) * 4
  const padded = new Uint8Array(paddedLength)
  padded.set(bytes)
  const view = new DataView(padded.buffer)
  const words = new Uint32Array(paddedLength / 4)
  for (let index = 0; index < words.length; index++) {
    words[index] = view.getUint32(index * 4, true)
  }
  return words
}

export class CmsisDapWebDriver implements ProbeDriver, MemoryAccess, DebugTarget {
  identity: ProbeIdentity | null = null

  private device: USBDevice | null = null
  private dapjs: DapJsModule | null = null
  private processor: CortexMInstance | null = null
  private cortexTarget: CortexMDebugTarget | null = null
  private frequencyHz = 4_000_000
  private protocol: DebugProtocol = 'swd'
  private readonly filters: USBDeviceFilter[]

  constructor(filters: USBDeviceFilter[] = DEFAULT_CMSIS_DAP_FILTERS) {
    this.filters = filters
  }

  async requestDevice(): Promise<ProbeIdentity> {
    this.device = await navigator.usb.requestDevice({ filters: this.filters })
    this.identity = {
      kind: 'cmsis-dap',
      displayName: this.device.productName || 'CMSIS-DAP Probe',
      vendorId: this.device.vendorId,
      productId: this.device.productId,
      serialNumber: this.device.serialNumber,
    }
    return this.identity
  }

  async connect(): Promise<void> {
    if (!this.device) {
      await this.requestDevice()
    }

    this.dapjs = await import('dapjs')
    const transport = new this.dapjs.WebUSB(this.device!)
    this.processor = new this.dapjs.CortexM(transport, this.protocol === 'swd' ? 1 : 2, this.frequencyHz)
    await this.processor.connect()
  }

  async disconnect(): Promise<void> {
    await this.processor?.disconnect()
    this.processor = null
    this.cortexTarget = null
  }

  async setProtocol(protocol: DebugProtocol): Promise<void> {
    this.protocol = protocol
  }

  async setFrequency(frequencyHz: number): Promise<void> {
    this.frequencyHz = frequencyHz
  }

  async read8(address: number, length: number): Promise<Uint8Array> {
    const processor = this.getProcessor()
    const alignedAddress = address & ~0x03
    const prefix = address - alignedAddress
    const totalLength = prefix + length
    const words = await processor.readBlock(alignedAddress, Math.ceil(totalLength / 4))
    return toBytes(words, totalLength).slice(prefix, prefix + length)
  }

  async write8(address: number, data: Uint8Array): Promise<void> {
    const processor = this.getProcessor()
    if (address % 4 === 0 && data.length % 4 === 0) {
      await processor.writeBlock(address, toWords(data))
      return
    }

    for (let index = 0; index < data.length; index++) {
      await processor.writeMem16(address + index, data[index])
    }
  }

  async read32(address: number, words: number): Promise<Uint32Array> {
    return this.getProcessor().readBlock(address, words)
  }

  async write32(address: number, words: Uint32Array): Promise<void> {
    await this.getProcessor().writeBlock(address, words)
  }

  async halt(): Promise<TargetRunState> {
    await this.getProcessor().halt(true)
    return 'halted'
  }

  async resume(): Promise<TargetRunState> {
    await this.getProcessor().resume(true)
    return 'running'
  }

  async reset(): Promise<TargetRunState> {
    await this.getProcessor().softReset()
    return 'reset'
  }

  async step(): Promise<TargetRunState> {
    const processor = this.getProcessor()
    const pc = await processor.readCoreRegister(15)
    await processor.execute(0x20000000, new Uint32Array([0xbf00]), 0x20001000, pc)
    return 'halted'
  }

  async readCoreRegisters(): Promise<Uint32Array> {
    const registers = await this.getProcessor().readCoreRegisters([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
    return Uint32Array.from(registers)
  }

  async writeCoreRegister(registerIndex: number, value: number): Promise<void> {
    await this.getProcessor().writeCoreRegister(registerIndex, value)
  }

  async setHardwareBreakpoint(address: number): Promise<void> {
    await this.getCortexTarget().setHardwareBreakpoint(address)
  }

  async clearHardwareBreakpoint(address: number): Promise<void> {
    await this.getCortexTarget().clearHardwareBreakpoint(address)
  }

  private getProcessor(): CortexMInstance {
    if (!this.processor) {
      throw new Error('CMSIS-DAP driver is not connected')
    }
    return this.processor
  }

  private getCortexTarget(): CortexMDebugTarget {
    if (!this.cortexTarget) {
      this.cortexTarget = new CortexMDebugTarget(this)
    }
    return this.cortexTarget
  }
}
