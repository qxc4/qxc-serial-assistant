import { describe, expect, it } from 'vitest'
import {
  createFlashRegionFromProfile,
  createUnsupportedFlashFamilyMessage,
  detectFlashFamilyFromText,
  FLASH_FAMILY_PROFILES,
  getFlashFamilyProfile,
} from '../flashFamilies'

describe('flashFamilies', () => {
  it('provides profiles for STM32G0/G4/H7', () => {
    expect(getFlashFamilyProfile('stm32g0').pageSize).toBe(2048)
    expect(getFlashFamilyProfile('stm32g4').eraseModel).toBe('bank-page')
    expect(getFlashFamilyProfile('stm32h7').pageSize).toBe(128 * 1024)
  })

  it('creates flash regions from profiles', () => {
    expect(createFlashRegionFromProfile(FLASH_FAMILY_PROFILES.stm32h7)).toEqual({
      name: 'STM32H7 main flash',
      start: 0x08000000,
      end: 0x08200000,
      pageSize: 128 * 1024,
    })
  })

  it('detects profiles from chip text and marks unsupported erase algorithms', () => {
    expect(detectFlashFamilyFromText('STM32G431 Cortex-M4')?.family).toBe('stm32g4')
    expect(detectFlashFamilyFromText('STM32H743 Cortex-M7')?.family).toBe('stm32h7')
    expect(detectFlashFamilyFromText('unknown target')).toBeNull()
    expect(createUnsupportedFlashFamilyMessage(FLASH_FAMILY_PROFILES.stm32g0)).toContain('尚未实现')
    expect(createUnsupportedFlashFamilyMessage(FLASH_FAMILY_PROFILES.stm32f1)).toBe('')
  })
})
