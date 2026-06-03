import { describe, expect, it } from 'vitest'
import {
  addAsciiHistoryEntry,
  clearAsciiHistory,
  parseAsciiHistory,
  removeAsciiHistoryEntry,
  serializeAsciiHistory,
  type AsciiHistoryEntry,
} from '../asciiHistory'

const baseEntry: AsciiHistoryEntry = {
  id: 'ascii-65',
  dec: 65,
  hex: '41',
  bin: '01000001',
  char: 'A',
  desc: 'Capital letter A',
  copiedAt: '2026-06-03T00:00:00.000Z',
}

describe('ascii history', () => {
  it('adds newest copied row first and de-duplicates by decimal code', () => {
    const first = addAsciiHistoryEntry([], baseEntry)
    const second = addAsciiHistoryEntry(first, {
      ...baseEntry,
      id: 'ascii-65-new',
      copiedAt: '2026-06-03T00:01:00.000Z',
    })

    expect(first).toEqual([baseEntry])
    expect(second).toEqual([{
      ...baseEntry,
      id: 'ascii-65-new',
      copiedAt: '2026-06-03T00:01:00.000Z',
    }])
  })

  it('removes and clears history entries', () => {
    expect(removeAsciiHistoryEntry([baseEntry], 'ascii-65')).toEqual([])
    expect(clearAsciiHistory([baseEntry])).toEqual([])
  })

  it('serializes and parses history safely', () => {
    const raw = serializeAsciiHistory([baseEntry])
    const parsed = parseAsciiHistory(raw)

    expect(JSON.parse(raw).version).toBe(1)
    expect(parsed.success).toBe(true)
    expect(parsed.entries).toEqual([baseEntry])
  })

  it('rejects invalid payloads and drops malformed entries', () => {
    expect(parseAsciiHistory('bad json').success).toBe(false)
    expect(parseAsciiHistory(JSON.stringify({ entries: [] })).success).toBe(true)
    expect(parseAsciiHistory(JSON.stringify({ entries: [{ dec: '65' }] })).entries).toEqual([])
  })
})
