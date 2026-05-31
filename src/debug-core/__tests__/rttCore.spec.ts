import { describe, expect, it } from 'vitest'
import {
  computeReadableBytes,
  computeWritableBytes,
  extractRingBufferBytes,
  parseRttControlBlock,
} from '../rttCore'

function writeU32(buffer: Uint8Array, offset: number, value: number): void {
  const view = new DataView(buffer.buffer)
  view.setUint32(offset, value, true)
}

describe('rttCore', () => {
  it('parses RTT control block descriptors', () => {
    const memory = new Uint8Array(96)
    memory.set(new TextEncoder().encode('SEGGER RTT'), 0)
    writeU32(memory, 16, 1)
    writeU32(memory, 20, 1)
    writeU32(memory, 24, 0x20000100)
    writeU32(memory, 28, 16)
    writeU32(memory, 32, 8)
    writeU32(memory, 36, 4)
    writeU32(memory, 40, 0)
    writeU32(memory, 48, 0x20000200)
    writeU32(memory, 52, 8)
    writeU32(memory, 56, 2)
    writeU32(memory, 60, 1)
    writeU32(memory, 64, 0)

    const block = parseRttControlBlock(memory, 0x20000000)

    expect(block.address).toBe(0x20000000)
    expect(block.upBuffers[0]).toMatchObject({
      number: 0,
      bufferAddress: 0x20000100,
      size: 16,
      writeOffset: 8,
      readOffset: 4,
    })
    expect(block.downBuffers[0]).toMatchObject({
      number: 0,
      bufferAddress: 0x20000200,
      size: 8,
      writeOffset: 2,
      readOffset: 1,
    })
  })

  it('computes readable and writable ring buffer space', () => {
    expect(computeReadableBytes(8, 4, 16)).toBe(4)
    expect(computeReadableBytes(2, 14, 16)).toBe(4)
    expect(computeWritableBytes(4, 8, 16)).toBe(3)
    expect(computeWritableBytes(14, 2, 16)).toBe(3)
  })

  it('extracts wrapped ring buffer bytes', () => {
    const ring = new Uint8Array([65, 66, 67, 68, 69, 70])
    const data = extractRingBufferBytes(ring, 4, 2, 6)

    expect(Array.from(data)).toEqual([69, 70, 65, 66])
  })
})
