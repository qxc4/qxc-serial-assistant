import { describe, expect, it } from 'vitest'
import {
  addConverterHistoryEntry,
  clearConverterHistory,
  parseConverterHistory,
  removeConverterHistoryEntry,
  serializeConverterHistory,
  type ConverterHistoryEntry,
} from '../converterHistory'

const baseEntry: ConverterHistoryEntry = {
  id: 'entry-1',
  sourceBase: 'dec',
  targetBase: 'hex',
  input: '255',
  result: 'FF',
  createdAt: '2026-06-03T00:00:00.000Z',
}

describe('converter history', () => {
  it('adds newest conversion first and de-duplicates equivalent conversions', () => {
    const first = addConverterHistoryEntry([], baseEntry)
    const second = addConverterHistoryEntry(first, {
      ...baseEntry,
      id: 'entry-2',
      createdAt: '2026-06-03T00:01:00.000Z',
    })

    expect(first).toEqual([baseEntry])
    expect(second).toEqual([{
      ...baseEntry,
      id: 'entry-2',
      createdAt: '2026-06-03T00:01:00.000Z',
    }])
  })

  it('removes and clears history entries', () => {
    expect(removeConverterHistoryEntry([baseEntry], 'entry-1')).toEqual([])
    expect(clearConverterHistory([baseEntry])).toEqual([])
  })

  it('serializes and parses converter history safely', () => {
    const raw = serializeConverterHistory([baseEntry])
    const parsed = parseConverterHistory(raw)

    expect(JSON.parse(raw).version).toBe(1)
    expect(parsed.success).toBe(true)
    expect(parsed.entries).toEqual([baseEntry])
  })

  it('rejects invalid history payloads', () => {
    expect(parseConverterHistory('bad json').success).toBe(false)
    expect(parseConverterHistory(JSON.stringify({ entries: [] })).success).toBe(true)
    expect(parseConverterHistory(JSON.stringify({ entries: [{ input: 1 }] })).entries).toEqual([])
  })
})
