export type SerialSearchDirection = 'rx' | 'tx'
export type SerialSearchDisplayMode = 'mixed' | 'rx' | 'tx'

export interface SerialSearchSourceEntry {
  id: number | string
  timestamp: number
  data: string
  direction: SerialSearchDirection
  rawBytes?: Uint8Array
}

export interface ParsedSerialSearchQuery {
  raw: string
  direction: SerialSearchDirection | null
  terms: string[]
  hexNeedle: Uint8Array | null
}

export interface SerialSearchSegment {
  text: string
  matched: boolean
}

function tokenizeSearchQuery(query: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (const char of query.trim()) {
    if ((char === '"' || char === "'") && quote === null) {
      quote = char
      continue
    }
    if (char === quote) {
      quote = null
      continue
    }
    if (/\s/.test(char) && quote === null) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (current) tokens.push(current)
  return tokens
}

function parseHexNeedle(value: string): Uint8Array | null {
  const compact = value.replace(/[^a-fA-F0-9]/g, '')
  if (compact.length === 0 || compact.length % 2 !== 0) return null

  const bytes = new Uint8Array(compact.length / 2)
  for (let index = 0; index < bytes.length; index++) {
    const byte = Number.parseInt(compact.slice(index * 2, index * 2 + 2), 16)
    if (Number.isNaN(byte)) return null
    bytes[index] = byte
  }
  return bytes
}

export function parseSerialSearchQuery(query: string): ParsedSerialSearchQuery {
  const tokens = tokenizeSearchQuery(query)
  const terms: string[] = []
  let direction: SerialSearchDirection | null = null
  let hexNeedle: Uint8Array | null = null

  for (const token of tokens) {
    const lower = token.toLowerCase()
    if (lower === 'dir:rx' || lower === 'rx:') {
      direction = 'rx'
      continue
    }
    if (lower === 'dir:tx' || lower === 'tx:') {
      direction = 'tx'
      continue
    }
    if (lower.startsWith('hex:')) {
      hexNeedle = parseHexNeedle(token.slice(4))
      continue
    }
    terms.push(lower)
  }

  return {
    raw: query,
    direction,
    terms,
    hexNeedle,
  }
}

function includesBytes(source: Uint8Array | undefined, needle: Uint8Array): boolean {
  if (!source || needle.length === 0 || needle.length > source.length) return false

  for (let start = 0; start <= source.length - needle.length; start++) {
    let matched = true
    for (let offset = 0; offset < needle.length; offset++) {
      if (source[start + offset] !== needle[offset]) {
        matched = false
        break
      }
    }
    if (matched) return true
  }
  return false
}

export function filterSerialLogEntries<T extends SerialSearchSourceEntry>(
  entries: T[],
  query: string,
  displayMode: SerialSearchDisplayMode,
): T[] {
  const parsed = parseSerialSearchQuery(query)
  const modeDirection = displayMode === 'mixed' ? null : displayMode
  const hasQuery = parsed.terms.length > 0 || parsed.hexNeedle !== null || parsed.direction !== null || modeDirection !== null

  if (!hasQuery) return entries

  return entries.filter(entry => {
    if (modeDirection && entry.direction !== modeDirection) return false
    if (parsed.direction && entry.direction !== parsed.direction) return false
    if (parsed.terms.length > 0) {
      const haystack = entry.data.toLowerCase()
      if (!parsed.terms.every(term => haystack.includes(term))) return false
    }
    if (parsed.hexNeedle && !includesBytes(entry.rawBytes, parsed.hexNeedle)) return false
    return true
  })
}

export function createSerialSearchSegments(text: string, query: string): SerialSearchSegment[] {
  const terms = parseSerialSearchQuery(query).terms
    .filter(term => term.length > 0)
    .sort((left, right) => right.length - left.length)

  if (terms.length === 0 || text.length === 0) return [{ text, matched: false }]

  const lowerText = text.toLowerCase()
  const matched = new Array<boolean>(text.length).fill(false)

  for (const term of terms) {
    let cursor = 0
    while (cursor < lowerText.length) {
      const index = lowerText.indexOf(term, cursor)
      if (index < 0) break
      for (let offset = index; offset < index + term.length; offset++) {
        matched[offset] = true
      }
      cursor = index + term.length
    }
  }

  const segments: SerialSearchSegment[] = []
  let start = 0
  while (start < text.length) {
    const state = matched[start] ?? false
    let end = start + 1
    while (end < text.length && matched[end] === state) end++
    segments.push({ text: text.slice(start, end), matched: state })
    start = end
  }
  return segments
}

export function updateSerialSearchHistory(history: string[], query: string, maxItems = 10): string[] {
  const normalized = query.trim()
  if (!normalized) return history
  return [
    normalized,
    ...history.filter(item => item.toLowerCase() !== normalized.toLowerCase()),
  ].slice(0, maxItems)
}
