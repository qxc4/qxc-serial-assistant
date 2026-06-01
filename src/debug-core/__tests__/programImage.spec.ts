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

  it('parses ELF loadable sections and symbols', () => {
    const bytes = new Uint8Array(0x300)
    bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1, 0], 0)
    const view = new DataView(bytes.buffer)
    view.setUint16(16, 2, true)
    view.setUint16(18, 0x28, true)
    view.setUint32(24, 0x08000101, true)
    view.setUint32(32, 0x80, true) // e_shoff
    view.setUint16(40, 52, true) // e_ehsize
    view.setUint16(46, 40, true) // e_shentsize
    view.setUint16(48, 5, true) // e_shnum
    view.setUint16(50, 2, true) // e_shstrndx

    // .text data
    bytes.set([0x11, 0x22, 0x33, 0x44], 0x180)

    // .shstrtab: \0.text\0.shstrtab\0.symtab\0.strtab\0
    const shstrtab = new TextEncoder().encode('\0.text\0.shstrtab\0.symtab\0.strtab\0')
    bytes.set(shstrtab, 0x1a0)

    // .strtab: \0main\0
    const strtab = new TextEncoder().encode('\0main\0')
    bytes.set(strtab, 0x1d0)

    // .symtab entries
    // entry 1: main @ 0x08000101, size 4, type FUNC, bind GLOBAL
    view.setUint32(0x1f0, 1, true) // st_name
    view.setUint32(0x1f4, 0x08000101, true) // st_value
    view.setUint32(0x1f8, 4, true) // st_size
    view.setUint8(0x1fc, 0x12) // st_info
    view.setUint16(0x1fe, 1, true) // st_shndx

    const shoff = 0x80
    // section 1: .text
    view.setUint32(shoff + 40 + 0, 1, true) // sh_name
    view.setUint32(shoff + 40 + 4, 1, true) // sh_type PROGBITS
    view.setUint32(shoff + 40 + 8, 0x2, true) // sh_flags ALLOC
    view.setUint32(shoff + 40 + 12, 0x08000100, true)
    view.setUint32(shoff + 40 + 16, 0x180, true)
    view.setUint32(shoff + 40 + 20, 4, true)
    view.setUint32(shoff + 40 + 32, 4, true)

    // section 2: .shstrtab
    view.setUint32(shoff + 80 + 0, 7, true) // sh_name
    view.setUint32(shoff + 80 + 4, 3, true) // STRTAB
    view.setUint32(shoff + 80 + 16, 0x1a0, true)
    view.setUint32(shoff + 80 + 20, shstrtab.length, true)
    view.setUint32(shoff + 80 + 32, 1, true)

    // section 3: .symtab
    view.setUint32(shoff + 120 + 0, 17, true) // sh_name
    view.setUint32(shoff + 120 + 4, 2, true) // SYMTAB
    view.setUint32(shoff + 120 + 16, 0x1e0, true)
    view.setUint32(shoff + 120 + 20, 32, true)
    view.setUint32(shoff + 120 + 24, 4, true) // sh_link -> strtab
    view.setUint32(shoff + 120 + 36, 16, true) // sh_entsize

    // section 4: .strtab
    view.setUint32(shoff + 160 + 0, 25, true) // sh_name
    view.setUint32(shoff + 160 + 4, 3, true) // STRTAB
    view.setUint32(shoff + 160 + 16, 0x1d0, true)
    view.setUint32(shoff + 160 + 20, strtab.length, true)
    view.setUint32(shoff + 160 + 32, 1, true)

    const image = parseElfImage(bytes)

    expect(image.sections).toEqual([
      {
        name: '.text',
        address: 0x08000100,
        data: new Uint8Array([0x11, 0x22, 0x33, 0x44]),
        loadable: true,
      },
    ])
    expect(image.symbols).toEqual([
      {
        name: 'main',
        address: 0x08000101,
        size: 4,
        type: 'func',
      },
    ])
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
