import { describe, expect, it } from 'vitest'
import { createSerialLogRows, serializeSerialLogEntries, type SerialLogSourceEntry } from '../serialLogRows'

const baseEntry: SerialLogSourceEntry = {
  id: 1,
  timestamp: 100,
  data: 'Hello\nWorld\r\nDone',
  direction: 'rx',
  rawBytes: new Uint8Array([1, 2]),
}

describe('serial log rows', () => {
  it('splits multiline payloads into fixed-height display rows', () => {
    const rows = createSerialLogRows([baseEntry])

    expect(rows.map(row => row.data)).toEqual(['Hello', 'World', 'Done'])
    expect(rows.map(row => row.isContinuation)).toEqual([false, true, true])
    expect(rows.every(row => row.timestamp === baseEntry.timestamp)).toBe(true)
  })

  it('keeps empty lines visible and creates stable row ids', () => {
    const rows = createSerialLogRows([{ ...baseEntry, data: 'A\n\nB' }])

    expect(rows.map(row => row.data)).toEqual(['A', '', 'B'])
    expect(rows.map(row => row.id)).toEqual(['1:0', '1:1', '1:2'])
  })

  it('serializes every log entry for complete copy/export output', () => {
    const items: SerialLogSourceEntry[] = Array.from({ length: 80 }, (_, index) => ({
      id: index + 1,
      timestamp: 1_700_000_000_000 + index,
      data: `packet-${index + 1}`,
      direction: index % 2 === 0 ? 'rx' : 'tx',
    }))

    const text = serializeSerialLogEntries(items, timestamp => `T${timestamp}`)

    expect(text).toContain('[T1700000000000] RX: packet-1')
    expect(text).toContain('[T1700000000079] TX: packet-80')
    expect(text.split('\n')).toHaveLength(80)
  })
})
