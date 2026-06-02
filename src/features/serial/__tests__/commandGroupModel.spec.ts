import { describe, expect, it } from 'vitest'
import { CommandStatus } from '../../../types/command-group'
import {
  calculateCommandGroupProgress,
  calculateCommandGroupStats,
  createEmptyCommandGroup,
  createEmptyCommandItem,
  normalizeCommandGroup,
} from '../commandGroupModel'

describe('commandGroupModel', () => {
  it('creates stable default group and command models', () => {
    const group = createEmptyCommandGroup({ id: 'grp-fixed', now: 1000 })
    const command = createEmptyCommandItem({ id: 7 })

    expect(group).toMatchObject({
      id: 'grp-fixed',
      name: '未命名指令组',
      createdAt: 1000,
      updatedAt: 1000,
      globalTimeout: 5000,
      version: 1,
    })
    expect(command).toMatchObject({
      id: 7,
      content: '',
      delay: 500,
      timeout: 0,
      enabled: true,
      dependencies: [],
    })
  })

  it('normalizes older command groups without a version field', () => {
    const group = createEmptyCommandGroup({ id: 'grp-old' })
    const legacy = { ...group, version: 0 }

    expect(normalizeCommandGroup(legacy).version).toBe(1)
  })

  it('calculates execution stats and finished progress', () => {
    const commands = [
      createEmptyCommandItem({ id: 1 }),
      createEmptyCommandItem({ id: 2 }),
      createEmptyCommandItem({ id: 3 }),
      createEmptyCommandItem({ id: 4 }),
    ]
    const stats = calculateCommandGroupStats(commands, {
      1: CommandStatus.Success,
      2: CommandStatus.Failed,
      3: CommandStatus.Running,
      4: CommandStatus.Timeout,
    })

    expect(stats).toMatchObject({
      total: 4,
      success: 1,
      failed: 1,
      running: 1,
      timeout: 1,
    })
    expect(calculateCommandGroupProgress(stats)).toBe(75)
  })
})
