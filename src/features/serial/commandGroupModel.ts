import type { CommandGroup, CommandItem, CommandStatus } from '../../types/command-group'
import { CommandStatus as CmdStatus, FailurePolicy as FailPolicy } from '../../types/command-group'

export interface CommandGroupStats {
  total: number
  pending: number
  running: number
  success: number
  failed: number
  skipped: number
  timeout: number
}

export function createCommandGroupId(now = Date.now(), random = Math.random()): string {
  return `grp_${now}_${random.toString(36).substring(2, 8)}`
}

export function createEmptyCommandGroup(options: {
  id?: string
  now?: number
  name?: string
} = {}): CommandGroup {
  const now = options.now ?? Date.now()
  return {
    id: options.id ?? createCommandGroupId(now),
    name: options.name ?? '未命名指令组',
    description: '',
    createdAt: now,
    updatedAt: now,
    commands: [],
    onFailure: FailPolicy.SkipAndContinue,
    globalTimeout: 5000,
    version: 1,
  }
}

export function createEmptyCommandItem(options: {
  id?: number
  now?: number
  random?: number
} = {}): CommandItem {
  return {
    id: options.id ?? ((options.now ?? Date.now()) + (options.random ?? Math.random())),
    content: '',
    description: '',
    isHex: false,
    delay: 500,
    timeout: 0,
    enabled: true,
    dependencies: [],
  }
}

export function normalizeCommandGroup(group: CommandGroup): CommandGroup {
  return {
    ...group,
    version: group.version || 1,
  }
}

export function calculateCommandGroupStats(
  commands: CommandItem[],
  commandStatusMap: Record<number, CommandStatus>,
): CommandGroupStats {
  const stats: CommandGroupStats = {
    total: commands.length,
    pending: 0,
    running: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    timeout: 0,
  }

  for (const status of Object.values(commandStatusMap)) {
    switch (status) {
      case CmdStatus.Pending:
        stats.pending++
        break
      case CmdStatus.Running:
        stats.running++
        break
      case CmdStatus.Success:
        stats.success++
        break
      case CmdStatus.Failed:
        stats.failed++
        break
      case CmdStatus.Skipped:
        stats.skipped++
        break
      case CmdStatus.Timeout:
        stats.timeout++
        break
    }
  }

  return stats
}

export function calculateCommandGroupProgress(stats: CommandGroupStats): number {
  if (stats.total === 0) return 0
  const finished = stats.success + stats.failed + stats.skipped + stats.timeout
  return Math.round((finished / stats.total) * 100)
}
