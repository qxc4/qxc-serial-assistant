export type DataType = 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32'

export type ByteOrder = 'ABCD' | 'DCBA' | 'BADC' | 'CDAB'

export interface RegisterValue {
  address: number
  raw: string
  parsed: string | number
  type: DataType
}

export function reorderBytes(bytes: number[], order: ByteOrder): number[] {
  if (bytes.length === 2) {
    switch (order) {
      case 'DCBA': return [bytes[1], bytes[0]]
      case 'ABCD':
      case 'BADC':
      case 'CDAB':
      default: return bytes
    }
  }

  if (bytes.length === 4) {
    switch (order) {
      case 'ABCD': return [bytes[0], bytes[1], bytes[2], bytes[3]]
      case 'DCBA': return [bytes[3], bytes[2], bytes[1], bytes[0]]
      case 'BADC': return [bytes[1], bytes[0], bytes[3], bytes[2]]
      case 'CDAB': return [bytes[2], bytes[3], bytes[0], bytes[1]]
      default: return bytes
    }
  }

  return bytes
}

export function parseRegisterData(
  data: number[],
  startAddress: number,
  type: DataType,
  byteOrder: ByteOrder,
): RegisterValue[] {
  const registers: RegisterValue[] = []
  const bytesPerValue = type === 'uint16' || type === 'int16' ? 2 : 4

  for (let i = 0; i < data.length; i += bytesPerValue) {
    if (i + bytesPerValue > data.length) break

    const rawBytes = data.slice(i, i + bytesPerValue)
    const reordered = reorderBytes(rawBytes, byteOrder)
    const rawHex = rawBytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')

    let parsedValue: string | number

    switch (type) {
      case 'uint16':
        parsedValue = (reordered[0] << 8) | reordered[1]
        break
      case 'int16': {
        const val = (reordered[0] << 8) | reordered[1]
        parsedValue = val > 0x7FFF ? val - 0x10000 : val
        break
      }
      case 'uint32':
        parsedValue = (reordered[0] << 24) | (reordered[1] << 16) | (reordered[2] << 8) | reordered[3]
        break
      case 'int32': {
        const val = (reordered[0] << 24) | (reordered[1] << 16) | (reordered[2] << 8) | reordered[3]
        parsedValue = val > 0x7FFFFFFF ? val - 0x100000000 : val
        break
      }
      case 'float32': {
        const buffer = new ArrayBuffer(4)
        const view = new DataView(buffer)
        reordered.forEach((b, idx) => view.setUint8(idx, b))
        parsedValue = view.getFloat32(0, false).toFixed(6)
        break
      }
      default:
        parsedValue = rawHex
    }

    registers.push({
      address: startAddress + Math.floor(i / 2),
      raw: rawHex,
      parsed: parsedValue,
      type,
    })
  }

  return registers
}

