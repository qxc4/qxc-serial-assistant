import { describe, expect, it } from 'vitest'
import {
  addShellFavoriteCommand,
  parseShellFavoriteCommands,
  removeShellFavoriteCommand,
  serializeShellFavoriteCommands,
} from '../shellFavorites'

describe('shell favorites', () => {
  it('adds trimmed commands, de-duplicates and keeps latest first', () => {
    const favorites = addShellFavoriteCommand(['help'], '  version  ')
    const moved = addShellFavoriteCommand(favorites, 'help')

    expect(favorites).toEqual(['version', 'help'])
    expect(moved).toEqual(['help', 'version'])
  })

  it('removes favorite commands by exact command', () => {
    expect(removeShellFavoriteCommand(['help', 'version'], 'help')).toEqual(['version'])
  })

  it('serializes and parses favorite command files', () => {
    const raw = serializeShellFavoriteCommands(['help', 'version'], '2026-06-03T00:00:00.000Z')
    const parsed = parseShellFavoriteCommands(raw)

    expect(JSON.parse(raw).version).toBe(1)
    expect(parsed.success).toBe(true)
    expect(parsed.commands).toEqual(['help', 'version'])
  })

  it('rejects invalid favorite command imports', () => {
    expect(parseShellFavoriteCommands('bad json').success).toBe(false)
    expect(parseShellFavoriteCommands(JSON.stringify({ commands: [] })).success).toBe(false)
    expect(parseShellFavoriteCommands(JSON.stringify({ commands: [1, 2] })).success).toBe(false)
  })
})
