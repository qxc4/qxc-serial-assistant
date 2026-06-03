export type ConverterBase = 'bin' | 'oct' | 'dec' | 'hex'

export interface ConverterHistoryEntry {
  id: string
  sourceBase: ConverterBase
  targetBase: ConverterBase
  input: string
  result: string
  createdAt: string
}

export interface ConverterHistoryParseResult {
  success: boolean
  entries: ConverterHistoryEntry[]
  error?: string
}

const BASES = new Set<ConverterBase>(['bin', 'oct', 'dec', 'hex'])
const MAX_HISTORY = 30

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isConverterBase(value: unknown): value is ConverterBase {
  return typeof value === 'string' && BASES.has(value as ConverterBase)
}

function normalizeEntry(value: unknown): ConverterHistoryEntry | null {
  if (!isObject(value)) return null
  if (
    typeof value.id !== 'string' ||
    !isConverterBase(value.sourceBase) ||
    !isConverterBase(value.targetBase) ||
    typeof value.input !== 'string' ||
    typeof value.result !== 'string' ||
    typeof value.createdAt !== 'string'
  ) {
    return null
  }

  return {
    id: value.id,
    sourceBase: value.sourceBase,
    targetBase: value.targetBase,
    input: value.input,
    result: value.result,
    createdAt: value.createdAt,
  }
}

function sameConversion(a: ConverterHistoryEntry, b: ConverterHistoryEntry): boolean {
  return a.sourceBase === b.sourceBase &&
    a.targetBase === b.targetBase &&
    a.input === b.input &&
    a.result === b.result
}

export function addConverterHistoryEntry(
  history: ConverterHistoryEntry[],
  entry: ConverterHistoryEntry,
  maxHistory = MAX_HISTORY,
): ConverterHistoryEntry[] {
  const withoutDuplicate = history.filter(item => !sameConversion(item, entry))
  return [entry, ...withoutDuplicate].slice(0, maxHistory)
}

export function removeConverterHistoryEntry(history: ConverterHistoryEntry[], id: string): ConverterHistoryEntry[] {
  return history.filter(entry => entry.id !== id)
}

export function clearConverterHistory(_history: ConverterHistoryEntry[]): ConverterHistoryEntry[] {
  return []
}

export function serializeConverterHistory(entries: ConverterHistoryEntry[], exportedAt = new Date().toISOString()): string {
  return JSON.stringify({
    version: 1,
    exportedAt,
    entries: entries.slice(0, MAX_HISTORY),
  }, null, 2)
}

export function parseConverterHistory(raw: string): ConverterHistoryParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { success: false, entries: [], error: '转换历史不是有效 JSON' }
  }

  if (!isObject(parsed) || !Array.isArray(parsed.entries)) {
    return { success: false, entries: [], error: '转换历史缺少 entries 数组' }
  }

  return {
    success: true,
    entries: parsed.entries.map(normalizeEntry).filter((entry): entry is ConverterHistoryEntry => entry !== null).slice(0, MAX_HISTORY),
  }
}
