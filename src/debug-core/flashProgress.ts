export type FlashOperationProgressStage = 'erase' | 'program' | 'verify'

export interface FlashOperationProgress {
  stage: FlashOperationProgressStage
  completed: number
  total: number
  address?: number
  sectionName?: string
  bytes?: number
}

const STAGE_LABELS: Record<FlashOperationProgressStage, string> = {
  erase: '擦除',
  program: '写入',
  verify: '校验',
}

export function summarizeFlashOperationProgress(progress: FlashOperationProgress): string {
  const completed = Math.max(0, Math.floor(progress.completed))
  const total = Math.max(0, Math.floor(progress.total))
  const parts = [`${STAGE_LABELS[progress.stage]} ${completed}/${total}`]

  if (progress.address !== undefined) {
    parts.push(`@ ${formatAddress(progress.address)}`)
  }
  if (progress.sectionName) {
    parts.push(progress.sectionName)
  }
  if (progress.bytes !== undefined) {
    parts.push(`${Math.max(0, Math.floor(progress.bytes))}B`)
  }

  return parts.join(' ')
}

function formatAddress(value: number): string {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, '0')}`
}
