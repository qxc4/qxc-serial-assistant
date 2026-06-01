import { describe, expect, it } from 'vitest'
import { summarizeFlashOperationProgress } from '../flashProgress'

describe('flashProgress', () => {
  it('summarizes erase, program, and verify progress', () => {
    expect(summarizeFlashOperationProgress({
      stage: 'erase',
      completed: 1,
      total: 4,
      address: 0x08000400,
    })).toBe('擦除 1/4 @ 0x08000400')

    expect(summarizeFlashOperationProgress({
      stage: 'program',
      completed: 2,
      total: 3,
      sectionName: '.text',
      bytes: 128,
    })).toBe('写入 2/3 .text 128B')

    expect(summarizeFlashOperationProgress({
      stage: 'verify',
      completed: 4096,
      total: 4096,
      bytes: 4096,
    })).toBe('校验 4096/4096 4096B')
  })
})
