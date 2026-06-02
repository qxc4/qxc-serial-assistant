import type { FlashRegion } from './flashPlanner'

export type FlashChipFamily = 'stm32f1' | 'stm32f4' | 'stm32g0' | 'stm32g4' | 'stm32h7'
export type FlashEraseModel = 'page' | 'sector' | 'bank-page'

export interface FlashFamilyProfile {
  family: FlashChipFamily
  label: string
  start: number
  end: number
  pageSize: number
  eraseModel: FlashEraseModel
  detectionKeywords: string[]
  stlinkEraseSupported: boolean
  note: string
  recoveryAdvice: string[]
}

export const FLASH_FAMILY_PROFILES: Record<FlashChipFamily, FlashFamilyProfile> = {
  stm32f1: {
    family: 'stm32f1',
    label: 'STM32F1',
    start: 0x08000000,
    end: 0x08080000,
    pageSize: 1024,
    eraseModel: 'page',
    detectionKeywords: ['stm32f1', 'f1', 'cortex-m3', 'm3'],
    stlinkEraseSupported: true,
    note: '1KB 页擦除，512KB 默认范围。',
    recoveryAdvice: ['确认页大小是否为 1KB/2KB 具体型号差异。', '若校验失败，先全片擦除或降低 SWD 频率。'],
  },
  stm32f4: {
    family: 'stm32f4',
    label: 'STM32F4',
    start: 0x08000000,
    end: 0x08080000,
    pageSize: 16 * 1024,
    eraseModel: 'sector',
    detectionKeywords: ['stm32f4', 'f4', 'cortex-m4', 'm4'],
    stlinkEraseSupported: true,
    note: 'F4 扇区擦除，当前底层覆盖 0-7 扇区。',
    recoveryAdvice: ['确认固件是否跨越大扇区边界。', '若高地址扇区失败，缩小范围或扩展扇区表。'],
  },
  stm32g0: {
    family: 'stm32g0',
    label: 'STM32G0',
    start: 0x08000000,
    end: 0x08040000,
    pageSize: 2048,
    eraseModel: 'page',
    detectionKeywords: ['stm32g0', 'g0', 'cortex-m0+', 'm0+'],
    stlinkEraseSupported: false,
    note: '2KB 页常见配置；底层擦除算法待硬件验证。',
    recoveryAdvice: ['确认 DBANK/页大小配置后再执行真实擦除。', '当前建议先使用 dry-run 和外部工具交叉验证。'],
  },
  stm32g4: {
    family: 'stm32g4',
    label: 'STM32G4',
    start: 0x08000000,
    end: 0x08080000,
    pageSize: 2048,
    eraseModel: 'bank-page',
    detectionKeywords: ['stm32g4', 'g4', 'cortex-m4'],
    stlinkEraseSupported: false,
    note: '2KB bank page 常见配置；需按 DBANK/DUALBANK 进一步细化。',
    recoveryAdvice: ['检查目标 option bytes 的 bank 配置。', '若写入失败，先改用厂商工具确认页边界。'],
  },
  stm32h7: {
    family: 'stm32h7',
    label: 'STM32H7',
    start: 0x08000000,
    end: 0x08200000,
    pageSize: 128 * 1024,
    eraseModel: 'sector',
    detectionKeywords: ['stm32h7', 'h7', 'cortex-m7', 'm7'],
    stlinkEraseSupported: false,
    note: 'H7 扇区较大，默认按 128KB sector 规划。',
    recoveryAdvice: ['确认固件是否跨 bank/sector 边界。', 'H7 擦除耗时较长，失败时先降低 SWD 频率并检查供电。'],
  },
}

export function getFlashFamilyProfile(family: FlashChipFamily): FlashFamilyProfile {
  return FLASH_FAMILY_PROFILES[family]
}

export function createFlashRegionFromProfile(profile: FlashFamilyProfile): FlashRegion {
  return {
    name: `${profile.label} main flash`,
    start: profile.start,
    end: profile.end,
    pageSize: profile.pageSize,
  }
}

export function detectFlashFamilyFromText(text: string): FlashFamilyProfile | null {
  const normalized = text.toLowerCase()
  const profiles = Object.values(FLASH_FAMILY_PROFILES)
  const strongMatch = profiles.find(profile =>
    profile.detectionKeywords
      .filter(keyword => keyword.startsWith('stm32') || /^[fgh]\d$/i.test(keyword))
      .some(keyword => {
        const lower = keyword.toLowerCase()
        return normalized.includes(lower.startsWith('stm32') ? lower : `stm32${lower}`)
      })
  )
  if (strongMatch) return strongMatch

  return profiles.find(profile =>
    profile.detectionKeywords.some(keyword => normalized.includes(keyword.toLowerCase()))
  ) ?? null
}

export function createUnsupportedFlashFamilyMessage(profile: FlashFamilyProfile): string {
  if (profile.stlinkEraseSupported) return ''
  return `${profile.label} 已支持 dry-run/范围规划，但当前 ST-Link 纯 Web 擦除算法尚未实现。${profile.recoveryAdvice.join(' ')}`
}
