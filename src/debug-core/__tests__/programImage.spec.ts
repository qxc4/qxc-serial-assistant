import { describe, expect, it } from 'vitest'
import {
  parseElfImage,
  parseIntelHex,
  planFlashOperations,
} from '../programImage'

describe('programImage', () => {
  it('parses Intel HEX extended linear address records', () => {
    const image = parseIntelHex([
      ':020000040800F2',
      ':0400100001020304E2',
      ':00000001FF',
    ].join('\n'))

    expect(image.format).toBe('hex')
    expect(image.sections).toEqual([
      {
        name: '.hex.0',
        address: 0x08000010,
        data: new Uint8Array([1, 2, 3, 4]),
        loadable: true,
      },
    ])
  })

  it('parses a minimal ELF header', () => {
    const bytes = new Uint8Array(52)
    bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1, 0], 0)
    const view = new DataView(bytes.buffer)
    view.setUint16(16, 2, true)
    view.setUint16(18, 0x28, true)
    view.setUint32(24, 0x08000101, true)

    const image = parseElfImage(bytes)

    expect(image.format).toBe('elf')
    expect(image.entryPoint).toBe(0x08000101)
    expect(image.arch).toBe('arm')
  })

  it('plans erase/program/verify operations by flash page', () => {
    const plan = planFlashOperations({
      baseAddress: 0x08000000,
      pageSize: 1024,
      sections: [
        {
          name: '.text',
          address: 0x080003f0,
          data: new Uint8Array(64),
          loadable: true,
        },
      ],
    })

    expect(plan.erasePages).toEqual([0x08000000, 0x08000400])
    expect(plan.programSections).toHaveLength(1)
    expect(plan.verifyRanges).toEqual([{ address: 0x080003f0, length: 64 }])
  })
})
