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

export interface FlashDryRunSection {
  name: string
  address: number
  endAddress: number
  bytes: number
  erasePages: number
  regionNames: string[]
}

export interface FlashDryRunReport {
  plan: FlashPlan
  sections: FlashDryRunSection[]
  totalProgramBytes: number
  totalVerifyBytes: number
  warnings: string[]
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

export function createFlashDryRunReport(input: FlashRangePlanInput): FlashDryRunReport {
  const regions = [...input.regions].sort((left, right) => left.start - right.start)
  const plan = planFlashRanges({ ...input, regions })
  const ignoredSections = input.sections.filter(section => !section.loadable || section.data.length === 0)
  const warnings: string[] = []

  if (plan.programSections.length === 0) {
    warnings.push('No loadable program sections were found.')
  }
  if (ignoredSections.length > 0) {
    warnings.push(`${ignoredSections.length} empty or non-loadable section(s) will be skipped.`)
  }

  const sections = plan.programSections.map(section => {
    const endAddress = section.address + section.data.length
    const coveredRegions = regions.filter(region => rangesOverlap(section.address, endAddress, region.start, region.end))
    const erasePages = coveredRegions.reduce((total, region) => {
      const start = Math.max(section.address, region.start)
      const end = Math.min(endAddress, region.end)
      return total + countRegionPages(region, start, end)
    }, 0)

    return {
      name: section.name,
      address: section.address,
      endAddress,
      bytes: section.data.length,
      erasePages,
      regionNames: coveredRegions.map(region => region.name),
    }
  })

  const totalProgramBytes = sections.reduce((total, section) => total + section.bytes, 0)
  const totalVerifyBytes = plan.verifyRanges.reduce((total, range) => total + range.length, 0)
  if (totalVerifyBytes !== totalProgramBytes) {
    warnings.push('Verify byte count differs from planned program byte count.')
  }

  return {
    plan,
    sections,
    totalProgramBytes,
    totalVerifyBytes,
    warnings,
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

function countRegionPages(region: FlashRegion, start: number, end: number): number {
  if (end <= start) return 0
  const firstPage = Math.floor((start - region.start) / region.pageSize)
  const lastPage = Math.floor((end - 1 - region.start) / region.pageSize)
  return Math.max(0, lastPage - firstPage + 1)
}
