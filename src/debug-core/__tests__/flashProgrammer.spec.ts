import { describe, expect, it } from 'vitest'
import { createFlashProgrammer } from '../flashProgrammer'
import type { ProgramImage, ProgramSection } from '../programImage'

class MockFlashBackend {
  readonly pagesErased: number[] = []
  readonly writes: Array<{ address: number; data: Uint8Array }> = []
  readonly memory = new Map<number, number>()

  async erasePage(address: number): Promise<void> {
    this.pagesErased.push(address)
  }

  async program(address: number, data: Uint8Array): Promise<void> {
    this.writes.push({ address, data })
    for (let index = 0; index < data.length; index++) {
      this.memory.set(address + index, data[index] ?? 0)
    }
  }

  async read(address: number, length: number): Promise<Uint8Array> {
    const out = new Uint8Array(length)
    for (let index = 0; index < length; index++) {
      out[index] = this.memory.get(address + index) ?? 0xff
    }
    return out
  }
}

function imageWithSingleSection(): ProgramImage {
  const section: ProgramSection = {
    name: '.text',
    address: 0x080001f8,
    data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    loadable: true,
  }
  return {
    format: 'bin',
    sections: [section],
  }
}

describe('flashProgrammer', () => {
  it('erases, programs, and verifies using region-based planner', async () => {
    const backend = new MockFlashBackend()
    const programmer = createFlashProgrammer(
      backend,
      [{ name: 'flash', start: 0x08000000, end: 0x08010000, pageSize: 0x200 }],
    )

    const image = imageWithSingleSection()
    await programmer.programImage(image)

    expect(backend.pagesErased).toEqual([0x08000000])
    expect(backend.writes).toHaveLength(1)
    expect(backend.writes[0]?.address).toBe(0x080001f8)
  })

  it('returns false when verify detects a mismatch', async () => {
    const backend = new MockFlashBackend()
    const programmer = createFlashProgrammer(
      backend,
      [{ name: 'flash', start: 0x08000000, end: 0x08010000, pageSize: 0x200 }],
    )
    const section = imageWithSingleSection().sections[0]!

    await programmer.erasePages([0x08000000])
    await programmer.programSections([section])
    backend.memory.set(section.address + 3, 0xaa)

    const ok = await programmer.verifySections([section])
    expect(ok).toBe(false)
  })

  it('reports the first verify mismatch address and bytes', async () => {
    const backend = new MockFlashBackend()
    const programmer = createFlashProgrammer(
      backend,
      [{ name: 'flash', start: 0x08000000, end: 0x08010000, pageSize: 0x200 }],
    )
    const section = imageWithSingleSection().sections[0]!

    await programmer.programSections([section])
    backend.memory.set(section.address + 3, 0xaa)

    const report = await programmer.verifySectionsDetailed([section])

    expect(report.ok).toBe(false)
    expect(report.mismatch).toEqual({
      sectionName: '.text',
      address: section.address + 3,
      expected: 4,
      actual: 0xaa,
      offset: 3,
    })
  })
})
