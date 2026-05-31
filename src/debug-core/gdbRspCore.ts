export interface GdbRspAdapter {
  haltReason(): Promise<string>
  readRegisters(): Promise<string>
  writeRegisters(hex: string): Promise<boolean>
  readMemory(address: number, length: number): Promise<Uint8Array>
  writeMemory(address: number, data: Uint8Array): Promise<boolean>
  continue(address?: number): Promise<string>
  step(address?: number): Promise<string>
  setBreakpoint(address: number, kind: number, type: string): Promise<boolean>
  clearBreakpoint(address: number, kind: number, type: string): Promise<boolean>
  qSupported(): Promise<string>
}

export interface DecodedPacket {
  payload: string
  checksum: string
}

export function checksumPayload(payload: string): string {
  let checksum = 0
  for (let index = 0; index < payload.length; index++) {
    checksum = (checksum + payload.charCodeAt(index)) & 0xff
  }
  return checksum.toString(16).padStart(2, '0')
}

export function encodePacket(payload: string): string {
  return `$${payload}#${checksumPayload(payload)}`
}

export function decodePacket(packet: string): DecodedPacket {
  const match = /^\$(.*)#([0-9a-fA-F]{2})$/.exec(packet)
  if (!match) {
    throw new Error('Invalid GDB-RSP packet')
  }

  const [, payload, checksum] = match
  const normalizedChecksum = checksum.toLowerCase()
  const actualChecksum = checksumPayload(payload)
  if (normalizedChecksum !== actualChecksum) {
    throw new Error(`Invalid GDB-RSP checksum: expected ${normalizedChecksum}, got ${actualChecksum}`)
  }

  return { payload, checksum: normalizedChecksum }
}

function parseHexNumber(value: string): number {
  const parsed = Number.parseInt(value, 16)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid hexadecimal number: ${value}`)
  }
  return parsed
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
    bytes[index] = parseHexNumber(hex.slice(index * 2, index * 2 + 2))
  }
  return bytes
}

export async function handleGdbCommand(payload: string, adapter: GdbRspAdapter): Promise<string> {
  if (payload === '?') return adapter.haltReason()
  if (payload === 'g') return adapter.readRegisters()
  if (payload.startsWith('G')) return (await adapter.writeRegisters(payload.slice(1))) ? 'OK' : 'E01'
  if (payload === 'qSupported') return adapter.qSupported()
  if (payload.startsWith('qSupported:')) return adapter.qSupported()

  const readMemoryMatch = /^m([0-9a-fA-F]+),([0-9a-fA-F]+)$/.exec(payload)
  if (readMemoryMatch) {
    const [, address, length] = readMemoryMatch
    return bytesToHex(await adapter.readMemory(parseHexNumber(address), parseHexNumber(length)))
  }

  const writeMemoryMatch = /^M([0-9a-fA-F]+),([0-9a-fA-F]+):([0-9a-fA-F]*)$/.exec(payload)
  if (writeMemoryMatch) {
    const [, address, , data] = writeMemoryMatch
    return (await adapter.writeMemory(parseHexNumber(address), hexToBytes(data))) ? 'OK' : 'E02'
  }

  const continueMatch = /^c([0-9a-fA-F]+)?$/.exec(payload)
  if (continueMatch) {
    const [, address] = continueMatch
    return adapter.continue(address ? parseHexNumber(address) : undefined)
  }

  const stepMatch = /^s([0-9a-fA-F]+)?$/.exec(payload)
  if (stepMatch) {
    const [, address] = stepMatch
    return adapter.step(address ? parseHexNumber(address) : undefined)
  }

  const breakpointMatch = /^([Zz])([0-4]),([0-9a-fA-F]+),([0-9a-fA-F]+)$/.exec(payload)
  if (breakpointMatch) {
    const [, op, type, address, kind] = breakpointMatch
    const ok = op === 'Z'
      ? await adapter.setBreakpoint(parseHexNumber(address), parseHexNumber(kind), type)
      : await adapter.clearBreakpoint(parseHexNumber(address), parseHexNumber(kind), type)
    return ok ? 'OK' : 'E03'
  }

  return ''
}
