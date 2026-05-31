export type ProgramImageFormat = 'bin' | 'hex' | 'elf'
export type ProgramArch = 'arm' | 'unknown'

export interface ProgramSection {
  name: string
  address: number
  data: Uint8Array
  loadable: boolean
}

export interface ProgramImage {
  format: ProgramImageFormat
  sections: ProgramSection[]
  entryPoint?: number
  arch?: ProgramArch
}

export interface FlashPlanInput {
  baseAddress: number
  pageSize: number
  sections: ProgramSection[]
}

export interface FlashPlan {
  erasePages: number[]
  programSections: ProgramSection[]
  verifyRanges: Array<{ address: number; length: number }>
}

function hexByte(value: string): number {
  const parsed = Number.parseInt(value, 16)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid hex byte: ${value}`)
  }
  return parsed
}

function parseRecord(line: string): { length: number; address: number; type: number; data: Uint8Array } {
  const trimmed = line.trim()
  if (!trimmed) {
    throw new Error('Empty Intel HEX record')
  }
  if (!trimmed.startsWith(':')) {
    throw new Error(`Invalid Intel HEX record: ${trimmed}`)
  }

  const length = hexByte(trimmed.slice(1, 3))
  const address = Number.parseInt(trimmed.slice(3, 7), 16)
  const type = hexByte(trimmed.slice(7, 9))
  const data = new Uint8Array(length)

  for (let index = 0; index < length; index++) {
    data[index] = hexByte(trimmed.slice(9 + index * 2, 11 + index * 2))
  }

  return { length, address, type, data }
}

export function parseIntelHex(text: string): ProgramImage {
  const sections: ProgramSection[] = []
  let upperAddress = 0
  let sectionIndex = 0

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const record = parseRecord(line)

    if (record.type === 0x00) {
      sections.push({
        name: `.hex.${sectionIndex++}`,
        address: upperAddress + record.address,
        data: record.data,
        loadable: true,
      })
    } else if (record.type === 0x04) {
      upperAddress = ((record.data[0] << 8) | record.data[1]) << 16
    } else if (record.type === 0x01) {
      break
    }
  }

  return { format: 'hex', sections }
}

export function parseBinaryImage(data: Uint8Array, baseAddress = 0x08000000): ProgramImage {
  return {
    format: 'bin',
    sections: [{ name: '.bin', address: baseAddress, data, loadable: true }],
  }
}

export function parseElfImage(data: Uint8Array): ProgramImage {
  if (data.length < 52) {
    throw new Error('ELF file is too small')
  }
  if (data[0] !== 0x7f || data[1] !== 0x45 || data[2] !== 0x4c || data[3] !== 0x46) {
    throw new Error('Invalid ELF magic')
  }
  if (data[4] !== 1 || data[5] !== 1) {
    throw new Error('Only 32-bit little-endian ELF files are supported in the first browser debugger core')
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const machine = view.getUint16(18, true)
  const entryPoint = view.getUint32(24, true)

  return {
    format: 'elf',
    sections: [],
    entryPoint,
    arch: machine === 0x28 ? 'arm' : 'unknown',
  }
}

export function planFlashOperations(input: FlashPlanInput): FlashPlan {
  const loadableSections = input.sections.filter(section => section.loadable && section.data.length > 0)
  const pageSet = new Set<number>()

  for (const section of loadableSections) {
    const startPage = Math.floor((section.address - input.baseAddress) / input.pageSize)
    const endPage = Math.floor((section.address + section.data.length - 1 - input.baseAddress) / input.pageSize)

    for (let page = startPage; page <= endPage; page++) {
      pageSet.add(input.baseAddress + page * input.pageSize)
    }
  }

  return {
    erasePages: Array.from(pageSet).sort((a, b) => a - b),
    programSections: loadableSections,
    verifyRanges: loadableSections.map(section => ({
      address: section.address,
      length: section.data.length,
    })),
  }
}
