export interface AsciiHistoryEntry {
  id: string
  dec: number
  hex: string
  bin: string
  char: string
  desc: string
  copiedAt: string
}

export interface AsciiHistoryParseResult {
  success: boolean
  entries: AsciiHistoryEntry[]
  error?: string
}

const MAX_HISTORY = 12

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeEntry(value: unknown): AsciiHistoryEntry | null {
  if (!isObject(value)) return null
  if (
    typeof value.id !== 'string' ||
    typeof value.dec !== 'number' ||
    typeof value.hex !== 'string' ||
    typeof value.bin !== 'string' ||
    typeof value.char !== 'string' ||
    typeof value.desc !== 'string' ||
    typeof value.copiedAt !== 'string'
  ) {
    return null
  }

  return {
    id: value.id,
    dec: value.dec,
    hex: value.hex,
    bin: value.bin,
    char: value.char,
    desc: value.desc,
    copiedAt: value.copiedAt,
  }
}

export function addAsciiHistoryEntry(
  history: AsciiHistoryEntry[],
  entry: AsciiHistoryEntry,
  maxHistory = MAX_HISTORY,
): AsciiHistoryEntry[] {
  const withoutDuplicate = history.filter(item => item.dec !== entry.dec)
  return [entry, ...withoutDuplicate].slice(0, maxHistory)
}

export function removeAsciiHistoryEntry(history: AsciiHistoryEntry[], id: string): AsciiHistoryEntry[] {
  return history.filter(entry => entry.id !== id)
}

export function clearAsciiHistory(_history: AsciiHistoryEntry[]): AsciiHistoryEntry[] {
  return []
}

export function serializeAsciiHistory(entries: AsciiHistoryEntry[], exportedAt = new Date().toISOString()): string {
  return JSON.stringify({
    version: 1,
    exportedAt,
    entries: entries.slice(0, MAX_HISTORY),
  }, null, 2)
}

export function parseAsciiHistory(raw: string): AsciiHistoryParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { success: false, entries: [], error: 'ASCII history is not valid JSON' }
  }

  if (!isObject(parsed) || !Array.isArray(parsed.entries)) {
    return { success: false, entries: [], error: 'ASCII history missing entries array' }
  }

  return {
    success: true,
    entries: parsed.entries.map(normalizeEntry).filter((entry): entry is AsciiHistoryEntry => entry !== null).slice(0, MAX_HISTORY),
  }
}
