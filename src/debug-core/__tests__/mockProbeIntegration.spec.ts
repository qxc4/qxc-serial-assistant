import { describe, expect, test } from 'vitest'
import { createFlashProgrammer } from '../flashProgrammer'
import { MockMemoryTarget, ProbeMockDriver } from '../mockProbeDriver'
import { RttMemorySession } from '../rttMemorySession'

const RAM_BASE = 0x20000000

function writeU32(memory: MockMemoryTarget, address: number, value: number): void {
  memory.seedUint32(address, value)
}

function seedRttControlBlock(memory: MockMemoryTarget): void {
  const cb = RAM_BASE + 0x100
  const upBuffer = RAM_BASE + 0x1000
  const downBuffer = RAM_BASE + 0x1100

  memory.seed(cb, new TextEncoder().encode('SEGGER RTT'))
  writeU32(memory, cb + 16, 1)
  writeU32(memory, cb + 20, 1)
  writeU32(memory, cb + 24, upBuffer)
  writeU32(memory, cb + 28, 8)
  writeU32(memory, cb + 32, 4)
  writeU32(memory, cb + 36, 0)
  writeU32(memory, cb + 40, 0)
  writeU32(memory, cb + 48, downBuffer)
  writeU32(memory, cb + 52, 8)
  writeU32(memory, cb + 56, 0)
  writeU32(memory, cb + 60, 0)
  writeU32(memory, cb + 64, 0)
  memory.seed(upBuffer, new TextEncoder().encode('PING....'))
}

describe('hardware mock integration', () => {
  test('mock probe driver records connection, protocol, and frequency', async () => {
    const driver = new ProbeMockDriver({ kind: 'cmsis-dap', displayName: 'Mock CMSIS-DAP' })

    await driver.connect()
    await driver.setProtocol('jtag')
    await driver.setFrequency(1_000_000)

    expect(driver.connected).toBe(true)
    expect(driver.protocol).toBe('jtag')
    expect(driver.frequencyHz).toBe(1_000_000)

    await driver.disconnect()
    expect(driver.connected).toBe(false)
  })

  test('mock memory supports RAM read/write and 32-bit access', async () => {
    const memory = new MockMemoryTarget({ baseAddress: RAM_BASE, size: 0x1000 })

    await memory.write8(RAM_BASE, new Uint8Array([1, 2, 3, 4]))
    expect(Array.from(await memory.read8(RAM_BASE, 4))).toEqual([1, 2, 3, 4])

    await memory.write32(RAM_BASE + 4, new Uint32Array([0x12345678]))
    expect(Array.from(await memory.read32(RAM_BASE + 4, 1))).toEqual([0x12345678])
  })

  test('mock memory drives RTT scan, up read, and down write', async () => {
    const memory = new MockMemoryTarget({ baseAddress: RAM_BASE, size: 0x2000 })
    seedRttControlBlock(memory)

    const session = new RttMemorySession(memory)
    const block = await session.scan(RAM_BASE, RAM_BASE + 0x2000)
    const up = await session.readUpChannel(0)
    await session.writeDownChannel(0, new TextEncoder().encode('OK'))

    expect(block.address).toBe(RAM_BASE + 0x100)
    expect(new TextDecoder().decode(up)).toBe('PING')
    expect(new TextDecoder().decode(await memory.read8(RAM_BASE + 0x1100, 2))).toBe('OK')
  })

  test('mock flash backend supports erase, program, and verify', async () => {
    const flashBase = 0x08000000
    const memory = new MockMemoryTarget({ baseAddress: flashBase, size: 0x4000 })
    const programmer = createFlashProgrammer(memory, [{ name: 'mock-flash', start: flashBase, end: flashBase + 0x4000, pageSize: 1024 }])
    const section = {
      name: '.text',
      address: flashBase,
      data: new Uint8Array([0x11, 0x22, 0x33]),
      loadable: true,
    }

    await programmer.erasePages([flashBase])
    await programmer.programSections([section])
    const report = await programmer.verifySectionsDetailed([section])

    expect(memory.erasedPages).toEqual([flashBase])
    expect(report.ok).toBe(true)
    expect(report.checkedBytes).toBe(3)
  })
})
