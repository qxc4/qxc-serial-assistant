export type ProgramImageFormat = 'bin' | 'hex' | 'elf'
export type ProgramArch = 'arm' | 'unknown'

export interface ProgramSection {
  name: string
  address: number
  data: Uint8Array
  loadable: boolean
}

export type ProgramSymbolType = 'func' | 'object' | 'unknown'

export interface ProgramSymbol {
  name: string
  address: number
  size: number
  type: ProgramSymbolType
}

export interface ProgramImage {
  format: ProgramImageFormat
  sections: ProgramSection[]
  symbols?: ProgramSymbol[]
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
  const sectionHeaderOffset = view.getUint32(32, true)
  const sectionHeaderSize = view.getUint16(46, true)
  const sectionHeaderCount = view.getUint16(48, true)
  const sectionNameTableIndex = view.getUint16(50, true)

  if (sectionHeaderOffset === 0 || sectionHeaderSize < 40 || sectionHeaderCount === 0) {
    return {
      format: 'elf',
      sections: [],
      symbols: [],
      entryPoint,
      arch: machine === 0x28 ? 'arm' : 'unknown',
    }
  }

  const headers = readSectionHeaders(view, sectionHeaderOffset, sectionHeaderSize, sectionHeaderCount)
  const sectionNameHeader = headers[sectionNameTableIndex]
  const sectionNameTable = sectionNameHeader ? readBytes(data, sectionNameHeader.offset, sectionNameHeader.size) : new Uint8Array()

  const sections = headers
    .map((header, index) => ({ header, name: readString(sectionNameTable, header.nameOffset) || `.section.${index}` }))
    .filter(({ header }) => (header.flags & 0x2) !== 0 && header.size > 0)
    .map(({ header, name }) => ({
      name,
      address: header.address,
      data: readBytes(data, header.offset, header.size),
      loadable: true,
    }))

  const symbols: ProgramSymbol[] = []
  for (const header of headers) {
    if (header.type !== 2 || header.entrySize < 16 || header.size === 0) continue
    const stringTableHeader = headers[header.link]
    if (!stringTableHeader) continue

    const stringTable = readBytes(data, stringTableHeader.offset, stringTableHeader.size)
    const entryCount = Math.floor(header.size / header.entrySize)
    for (let symbolIndex = 1; symbolIndex < entryCount; symbolIndex++) {
      const entryOffset = header.offset + symbolIndex * header.entrySize
      if (entryOffset + 16 > data.length) break

      const nameOffset = view.getUint32(entryOffset, true)
      const value = view.getUint32(entryOffset + 4, true)
      const size = view.getUint32(entryOffset + 8, true)
      const info = view.getUint8(entryOffset + 12)
      const name = readString(stringTable, nameOffset)
      if (!name) continue

      symbols.push({
        name,
        address: value,
        size,
        type: mapElfSymbolType(info & 0x0f),
      })
    }
  }

  return {
    format: 'elf',
    sections,
    symbols,
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

interface ElfSectionHeader {
  nameOffset: number
  type: number
  flags: number
  address: number
  offset: number
  size: number
  link: number
  entrySize: number
}

function readSectionHeaders(
  view: DataView,
  offset: number,
  entrySize: number,
  count: number,
): ElfSectionHeader[] {
  const headers: ElfSectionHeader[] = []
  for (let index = 0; index < count; index++) {
    const headerOffset = offset + index * entrySize
    if (headerOffset + 40 > view.byteLength) break

    headers.push({
      nameOffset: view.getUint32(headerOffset, true),
      type: view.getUint32(headerOffset + 4, true),
      flags: view.getUint32(headerOffset + 8, true),
      address: view.getUint32(headerOffset + 12, true),
      offset: view.getUint32(headerOffset + 16, true),
      size: view.getUint32(headerOffset + 20, true),
      link: view.getUint32(headerOffset + 24, true),
      entrySize: view.getUint32(headerOffset + 36, true),
    })
  }
  return headers
}

function readBytes(data: Uint8Array, offset: number, size: number): Uint8Array {
  if (offset >= data.length || size <= 0) return new Uint8Array()
  const end = Math.min(data.length, offset + size)
  return data.slice(offset, end)
}

function readString(table: Uint8Array, startOffset: number): string {
  if (startOffset <= 0 || startOffset >= table.length) return ''

  let end = startOffset
  while (end < table.length && table[end] !== 0) {
    end++
  }

  return new TextDecoder().decode(table.slice(startOffset, end))
}

function mapElfSymbolType(type: number): ProgramSymbolType {
  if (type === 2) return 'func'
  if (type === 1) return 'object'
  return 'unknown'
}
