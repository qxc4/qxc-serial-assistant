const RTT_MAGIC = 'SEGGER RTT'
const RTT_DESCRIPTOR_SIZE = 24
const RTT_HEADER_SIZE = 24

export interface RttBufferDescriptor {
  number: number
  bufferAddress: number
  size: number
  writeOffset: number
  readOffset: number
  flags: number
}

export interface RttControlBlock {
  address: number
  maxUpBuffers: number
  maxDownBuffers: number
  upBuffers: RttBufferDescriptor[]
  downBuffers: RttBufferDescriptor[]
}

function readU32(data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new RangeError(`RTT field at offset ${offset} is outside the provided memory block`)
  }
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, true)
}

function parseDescriptor(data: Uint8Array, offset: number, number: number): RttBufferDescriptor {
  return {
    number,
    bufferAddress: readU32(data, offset),
    size: readU32(data, offset + 4),
    writeOffset: readU32(data, offset + 8),
    readOffset: readU32(data, offset + 12),
    flags: readU32(data, offset + 16),
  }
}

export function parseRttControlBlock(data: Uint8Array, address: number): RttControlBlock {
  const magic = new TextDecoder().decode(data.slice(0, RTT_MAGIC.length)).replace(/\0+$/, '')
  if (magic !== RTT_MAGIC) {
    throw new Error('RTT control block magic not found')
  }

  const maxUpBuffers = readU32(data, 16)
  const maxDownBuffers = readU32(data, 20)
  const upBuffers: RttBufferDescriptor[] = []
  const downBuffers: RttBufferDescriptor[] = []

  let offset = RTT_HEADER_SIZE
  for (let index = 0; index < maxUpBuffers; index++) {
    upBuffers.push(parseDescriptor(data, offset, index))
    offset += RTT_DESCRIPTOR_SIZE
  }

  for (let index = 0; index < maxDownBuffers; index++) {
    downBuffers.push(parseDescriptor(data, offset, index))
    offset += RTT_DESCRIPTOR_SIZE
  }

  return {
    address,
    maxUpBuffers,
    maxDownBuffers,
    upBuffers,
    downBuffers,
  }
}

export function computeReadableBytes(writeOffset: number, readOffset: number, size: number): number {
  if (size <= 0) return 0
  if (writeOffset >= readOffset) return writeOffset - readOffset
  return size - readOffset + writeOffset
}

export function computeWritableBytes(writeOffset: number, readOffset: number, size: number): number {
  if (size <= 1) return 0
  if (readOffset > writeOffset) return readOffset - writeOffset - 1
  return size - writeOffset + readOffset - 1
}

export function extractRingBufferBytes(
  buffer: Uint8Array,
  readOffset: number,
  writeOffset: number,
  size: number,
): Uint8Array {
  const available = computeReadableBytes(writeOffset, readOffset, size)
  const output = new Uint8Array(available)

  for (let index = 0; index < available; index++) {
    output[index] = buffer[(readOffset + index) % size]
  }

  return output
}
