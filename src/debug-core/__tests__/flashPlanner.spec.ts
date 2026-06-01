import { describe, expect, it } from 'vitest'
import { planFlashRanges } from '../flashPlanner'
import type { ProgramSection } from '../programImage'

function section(name: string, address: number, length: number): ProgramSection {
  return {
    name,
    address,
    data: new Uint8Array(length),
    loadable: true,
  }
}

describe('flashPlanner', () => {
  it('plans erase pages across multiple flash regions with different page sizes', () => {
    const plan = planFlashRanges({
      regions: [
        { name: 'boot', start: 0x08000000, end: 0x08004000, pageSize: 0x400 },
        { name: 'app', start: 0x08004000, end: 0x08010000, pageSize: 0x1000 },
      ],
      sections: [
        section('.boot', 0x080003f0, 0x30),
        section('.text', 0x08004ff0, 0x30),
      ],
    })

    expect(plan.erasePages).toEqual([0x08000000, 0x08000400, 0x08004000, 0x08005000])
    expect(plan.programSections.map(item => item.name)).toEqual(['.boot', '.text'])
    expect(plan.verifyRanges).toEqual([
      { address: 0x080003f0, length: 0x30 },
      { address: 0x08004ff0, length: 0x30 },
    ])
  })

  it('ignores empty and non-loadable sections before planning', () => {
    const plan = planFlashRanges({
      regions: [{ name: 'flash', start: 0x08000000, end: 0x08010000, pageSize: 0x800 }],
      sections: [
        section('.empty', 0x08000000, 0),
        { ...section('.debug', 0x08000800, 4), loadable: false },
        section('.text', 0x08001000, 8),
      ],
    })

    expect(plan.erasePages).toEqual([0x08001000])
    expect(plan.programSections.map(item => item.name)).toEqual(['.text'])
  })

  it('rejects sections that are outside configured flash regions', () => {
    expect(() => planFlashRanges({
      regions: [{ name: 'flash', start: 0x08000000, end: 0x08001000, pageSize: 0x400 }],
      sections: [section('.text', 0x08000ff0, 0x20)],
    })).toThrow(/outside flash regions/i)
  })

  it('rejects overlapped flash region definitions', () => {
    expect(() => planFlashRanges({
      regions: [
        { name: 'flash-a', start: 0x08000000, end: 0x08002000, pageSize: 0x400 },
        { name: 'flash-b', start: 0x08001000, end: 0x08003000, pageSize: 0x400 },
      ],
      sections: [section('.text', 0x08000000, 0x100)],
    })).toThrow(/overlap/i)
  })

  it('rejects sections spanning a gap between non-contiguous regions', () => {
    expect(() => planFlashRanges({
      regions: [
        { name: 'flash-a', start: 0x08000000, end: 0x08001000, pageSize: 0x400 },
        { name: 'flash-b', start: 0x08002000, end: 0x08003000, pageSize: 0x400 },
      ],
      sections: [section('.text', 0x08000f00, 0x1400)],
    })).toThrow(/outside flash regions/i)
  })
})
