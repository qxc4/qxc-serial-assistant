import { describe, expect, it } from 'vitest'
import {
  createSerialSearchSegments,
  updateSerialSearchHistory,
  filterSerialLogEntries,
  parseSerialSearchQuery,
  type SerialSearchSourceEntry,
} from '../serialSearch'

const entries: SerialSearchSourceEntry[] = [
  { id: 1, timestamp: 1, direction: 'rx', data: 'Hello led thread', rawBytes: new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]) },
  { id: 2, timestamp: 2, direction: 'tx', data: 'AT+RESET', rawBytes: new Uint8Array([0x41, 0x54, 0x2b, 0x52]) },
  { id: 3, timestamp: 3, direction: 'rx', data: 'Key_not_Pressed', rawBytes: new Uint8Array([0xaa, 0x55, 0x01]) },
]

describe('serialSearch', () => {
  it('parses direction and multiple text terms', () => {
    const parsed = parseSerialSearchQuery('dir:rx hello thread')

    expect(parsed.direction).toBe('rx')
    expect(parsed.terms).toEqual(['hello', 'thread'])
  })

  it('filters by display mode, direction directive, text terms and raw hex bytes', () => {
    expect(filterSerialLogEntries(entries, 'hello thread', 'mixed').map(item => item.id)).toEqual([1])
    expect(filterSerialLogEntries(entries, 'dir:tx reset', 'mixed').map(item => item.id)).toEqual([2])
    expect(filterSerialLogEntries(entries, 'hex:AA5501', 'mixed').map(item => item.id)).toEqual([3])
    expect(filterSerialLogEntries(entries, 'dir:tx', 'rx')).toEqual([])
  })

  it('creates case-insensitive highlight segments for text terms', () => {
    const segments = createSerialSearchSegments('Key_not_Pressed', 'key pressed')

    expect(segments).toEqual([
      { text: 'Key', matched: true },
      { text: '_not_', matched: false },
      { text: 'Pressed', matched: true },
    ])
  })

  it('updates search history with trimmed unique newest-first entries', () => {
    expect(updateSerialSearchHistory(['old', 'key'], ' key ', 3)).toEqual(['key', 'old'])
    expect(updateSerialSearchHistory(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b'])
    expect(updateSerialSearchHistory(['a'], '   ', 3)).toEqual(['a'])
  })
})
