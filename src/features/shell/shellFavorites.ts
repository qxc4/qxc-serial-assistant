export interface ShellFavoriteCommandsImportResult {
  success: boolean
  commands: string[]
  error?: string
}

const MAX_FAVORITES = 50

function normalizeCommand(command: string): string {
  return command.trim()
}

export function addShellFavoriteCommand(commands: string[], command: string, maxFavorites = MAX_FAVORITES): string[] {
  const normalized = normalizeCommand(command)
  if (!normalized) return commands
  const withoutDuplicate = commands.filter(item => item !== normalized)
  return [normalized, ...withoutDuplicate].slice(0, maxFavorites)
}

export function removeShellFavoriteCommand(commands: string[], command: string): string[] {
  return commands.filter(item => item !== command)
}

export function serializeShellFavoriteCommands(commands: string[], exportedAt = new Date().toISOString()): string {
  return JSON.stringify({
    version: 1,
    exportedAt,
    commands: commands.map(normalizeCommand).filter(Boolean).slice(0, MAX_FAVORITES),
  }, null, 2)
}

export function parseShellFavoriteCommands(raw: string): ShellFavoriteCommandsImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { success: false, commands: [], error: '收藏命令文件不是有效 JSON' }
  }

  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { commands?: unknown }).commands)) {
    return { success: false, commands: [], error: '收藏命令文件缺少 commands 数组' }
  }

  const commands = ((parsed as { commands: unknown[] }).commands)
    .filter((item): item is string => typeof item === 'string')
    .map(normalizeCommand)
    .filter(Boolean)
    .slice(0, MAX_FAVORITES)

  if (commands.length === 0) {
    return { success: false, commands: [], error: '收藏命令文件没有可用命令' }
  }

  return { success: true, commands: [...new Set(commands)] }
}
