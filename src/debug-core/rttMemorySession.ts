import type { MemoryAccess, RttSession } from './debugInterfaces'
import {
  computeReadableBytes,
  computeWritableBytes,
  getRttDescriptorOffset,
  parseRttControlBlock,
  type RttControlBlock,
  writeUint32LE,
} from './rttCore'

const RTT_MAGIC_BYTES = new TextEncoder().encode('SEGGER RTT')
const DEFAULT_SCAN_CHUNK_SIZE = 1024
const DEFAULT_SCAN_STEP_SIZE = 16
const CONTROL_BLOCK_READ_SIZE = 512

export interface RttScanOptions {
  chunkSize?: number
  stepSize?: number
}

export class RttMemorySession implements RttSession {
  controlBlock: RttControlBlock | null = null
  private readonly memory: MemoryAccess

  constructor(memory: MemoryAccess) {
    this.memory = memory
  }

  async scan(searchStart: number, searchEnd: number, options: RttScanOptions = {}): Promise<RttControlBlock> {
    const chunkSize = options.chunkSize ?? DEFAULT_SCAN_CHUNK_SIZE
    const stepSize = options.stepSize ?? DEFAULT_SCAN_STEP_SIZE

    for (let address = searchStart; address < searchEnd; address += stepSize) {
      const readAddress = address
      const length = Math.min(chunkSize, searchEnd - readAddress)
      if (length < RTT_MAGIC_BYTES.length) break

      const chunk = await this.memory.read8(readAddress, length)
      const magicOffset = findBytes(chunk, RTT_MAGIC_BYTES)
      if (magicOffset < 0) continue

      const blockAddress = readAddress + magicOffset
      const controlBlockData = await this.memory.read8(blockAddress, CONTROL_BLOCK_READ_SIZE)
      this.controlBlock = parseRttControlBlock(controlBlockData, blockAddress)
      return this.controlBlock
    }

    throw new Error('RTT control block not found')
  }

  async readUpChannel(channel: number): Promise<Uint8Array> {
    const block = this.requireControlBlock()
    const descriptor = block.upBuffers[channel]
    if (!descriptor || descriptor.size <= 0) return new Uint8Array()

    const available = computeReadableBytes(descriptor.writeOffset, descriptor.readOffset, descriptor.size)
    if (available === 0) return new Uint8Array()

    const firstLength = Math.min(available, descriptor.size - descriptor.readOffset)
    const first = await this.memory.read8(descriptor.bufferAddress + descriptor.readOffset, firstLength)
    const secondLength = available - firstLength
    const second = secondLength > 0
      ? await this.memory.read8(descriptor.bufferAddress, secondLength)
      : new Uint8Array()

    const output = new Uint8Array(available)
    output.set(first, 0)
    output.set(second, first.length)

    const newReadOffset = (descriptor.readOffset + available) % descriptor.size
    const offsetAddress = block.address + getRttDescriptorOffset('up', channel, block.maxUpBuffers) + 12
    await this.memory.write8(offsetAddress, writeUint32LE(newReadOffset))
    descriptor.readOffset = newReadOffset

    return output
  }

  async writeDownChannel(channel: number, data: Uint8Array): Promise<void> {
    const block = this.requireControlBlock()
    const descriptor = block.downBuffers[channel]
    if (!descriptor || descriptor.size <= 0 || data.length === 0) return

    const writable = computeWritableBytes(descriptor.writeOffset, descriptor.readOffset, descriptor.size)
    if (data.length > writable) {
      throw new Error(`RTT down channel ${channel} does not have enough free space`)
    }

    const firstLength = Math.min(data.length, descriptor.size - descriptor.writeOffset)
    await this.memory.write8(descriptor.bufferAddress + descriptor.writeOffset, data.slice(0, firstLength))

    const secondLength = data.length - firstLength
    if (secondLength > 0) {
      await this.memory.write8(descriptor.bufferAddress, data.slice(firstLength))
    }

    const newWriteOffset = (descriptor.writeOffset + data.length) % descriptor.size
    const offsetAddress = block.address + getRttDescriptorOffset('down', channel, block.maxUpBuffers) + 8
    await this.memory.write8(offsetAddress, writeUint32LE(newWriteOffset))
    descriptor.writeOffset = newWriteOffset
  }

  private requireControlBlock(): RttControlBlock {
    if (!this.controlBlock) {
      throw new Error('RTT session has not scanned a control block')
    }
    return this.controlBlock
  }
}

function findBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer:
  for (let index = 0; index <= haystack.length - needle.length; index++) {
    for (let needleIndex = 0; needleIndex < needle.length; needleIndex++) {
      if (haystack[index + needleIndex] !== needle[needleIndex]) {
        continue outer
      }
    }
    return index
  }
  return -1
}
