import type { FlashProgrammer } from './debugInterfaces'
import type { ProgramImage, ProgramSection } from './programImage'
import type { FlashRegion } from './flashPlanner'
import { planFlashRanges } from './flashPlanner'

export interface FlashBackend {
  erasePage(address: number): Promise<void>
  program(address: number, data: Uint8Array): Promise<void>
  read(address: number, length: number): Promise<Uint8Array>
}

class CoreFlashProgrammer implements FlashProgrammer {
  private readonly backend: FlashBackend
  private readonly regions: FlashRegion[]

  constructor(
    backend: FlashBackend,
    regions: FlashRegion[],
  ) {
    this.backend = backend
    this.regions = regions
  }

  async erasePages(addresses: number[]): Promise<void> {
    for (const address of addresses) {
      await this.backend.erasePage(address)
    }
  }

  async programSections(sections: ProgramSection[]): Promise<void> {
    for (const section of sections) {
      if (!section.loadable || section.data.length === 0) continue
      await this.backend.program(section.address, section.data)
    }
  }

  async verifySections(sections: ProgramSection[]): Promise<boolean> {
    for (const section of sections) {
      if (!section.loadable || section.data.length === 0) continue
      const readback = await this.backend.read(section.address, section.data.length)
      if (!sameBytes(readback, section.data)) {
        return false
      }
    }
    return true
  }

  async programImage(image: ProgramImage): Promise<void> {
    const plan = planFlashRanges({
      regions: this.regions,
      sections: image.sections,
    })

    await this.erasePages(plan.erasePages)
    await this.programSections(plan.programSections)
    const verified = await this.verifySections(plan.programSections)
    if (!verified) {
      throw new Error('Flash verify failed after programming')
    }
  }
}

export function createFlashProgrammer(
  backend: FlashBackend,
  regions: FlashRegion[],
): FlashProgrammer {
  return new CoreFlashProgrammer(backend, regions)
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false
  }
  return true
}
