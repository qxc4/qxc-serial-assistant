import { describe, expect, it } from 'vitest'
import {
  checksumPayload,
  decodePacket,
  encodePacket,
  handleGdbCommand,
} from '../gdbRspCore'

describe('gdbRspCore', () => {
  it('encodes and decodes packets with checksum validation', () => {
    expect(checksumPayload('m1000,4')).toBe('8e')

    const packet = encodePacket('m1000,4')
    expect(packet).toBe('$m1000,4#8e')
    expect(decodePacket(packet)).toEqual({ payload: 'm1000,4', checksum: '8e' })
  })

  it('rejects packets with invalid checksum', () => {
    expect(() => decodePacket('$?#00')).toThrow(/checksum/i)
  })

  it('handles basic RSP commands through the debug adapter', async () => {
    const calls: string[] = []
    const response = await handleGdbCommand('?', {
      async haltReason() {
        calls.push('haltReason')
        return 'S05'
      },
      async readRegisters() {
        return '00'
      },
      async writeRegisters() {
        return true
      },
      async readMemory() {
        return new Uint8Array()
      },
      async writeMemory() {
        return true
      },
      async continue() {
        return 'OK'
      },
      async step() {
        return 'S05'
      },
      async setBreakpoint() {
        return true
      },
      async clearBreakpoint() {
        return true
      },
      async qSupported() {
        return 'PacketSize=4000'
      },
    })

    expect(response).toBe('S05')
    expect(calls).toEqual(['haltReason'])
  })

  it('handles memory read and breakpoint commands', async () => {
    const requests: string[] = []
    const adapter = {
      async haltReason() { return 'S05' },
      async readRegisters() { return '00' },
      async writeRegisters() { return true },
      async readMemory(address: number, length: number) {
        requests.push(`m:${address.toString(16)}:${length}`)
        return new Uint8Array([1, 2, 255])
      },
      async writeMemory() { return true },
      async continue() { return 'OK' },
      async step() { return 'S05' },
      async setBreakpoint(address: number) {
        requests.push(`z:${address.toString(16)}`)
        return true
      },
      async clearBreakpoint() { return true },
      async qSupported() { return 'PacketSize=4000' },
    }

    expect(await handleGdbCommand('m20000000,3', adapter)).toBe('0102ff')
    expect(await handleGdbCommand('Z1,8000124,2', adapter)).toBe('OK')
    expect(requests).toEqual(['m:20000000:3', 'z:8000124'])
  })
})
