import type { FlashPlan, ProgramSection } from './programImage'

export interface FlashRegion {
  name: string
  start: number
  end: number
  pageSize: number
}

export interface FlashRangePlanInput {
  regions: FlashRegion[]
  sections: ProgramSection[]
}

export function planFlashRanges(input: FlashRangePlanInput): FlashPlan {
  const regions = [...input.regions].sort((left, right) => left.start - right.start)
  validateRegions(regions)

  const programSections = input.sections
    .filter(section => section.loadable && section.data.length > 0)
    .sort((left, right) => left.address - right.address)

  const erasePages = new Set<number>()
  for (const section of programSections) {
    const sectionEnd = section.address + section.data.length
    const coveringRegions = regions.filter(region => rangesOverlap(section.address, sectionEnd, region.start, region.end))
    if (!coversRange(section.address, sectionEnd, coveringRegions)) {
      throw new Error(`Section ${section.name} is outside flash regions`)
    }

    for (const region of coveringRegions) {
      const start = Math.max(section.address, region.start)
      const end = Math.min(sectionEnd, region.end)
      addRegionPages(erasePages, region, start, end)
    }
  }

  return {
    erasePages: [...erasePages].sort((left, right) => left - right),
    programSections,
    verifyRanges: programSections.map(section => ({
      address: section.address,
      length: section.data.length,
    })),
  }
}

function validateRegions(regions: FlashRegion[]): void {
  for (let index = 0; index < regions.length; index++) {
    const region = regions[index]
    if (!region || region.end <= region.start || region.pageSize <= 0) {
      throw new Error(`Invalid flash region at index ${index}`)
    }
    const previous = regions[index - 1]
    if (previous && previous.end > region.start) {
      throw new Error(`Flash regions overlap: ${previous.name}, ${region.name}`)
    }
  }
}

function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean {
  return leftStart < rightEnd && rightStart < leftEnd
}

function coversRange(start: number, end: number, regions: FlashRegion[]): boolean {
  let cursor = start
  for (const region of regions) {
    if (region.start > cursor) return false
    if (region.end > cursor) cursor = region.end
    if (cursor >= end) return true
  }
  return cursor >= end
}

function addRegionPages(pages: Set<number>, region: FlashRegion, start: number, end: number): void {
  const firstPage = Math.floor((start - region.start) / region.pageSize)
  const lastPage = Math.floor((end - 1 - region.start) / region.pageSize)
  for (let page = firstPage; page <= lastPage; page++) {
    pages.add(region.start + page * region.pageSize)
  }
}
