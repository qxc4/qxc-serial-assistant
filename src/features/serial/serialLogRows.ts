export interface SerialLogSourceEntry {
  id: number | string
  timestamp: number
  data: string
  direction: 'rx' | 'tx'
  rawBytes?: Uint8Array
}

export interface SerialLogDisplayRow extends SerialLogSourceEntry {
  id: string
  sourceId: number | string
  isContinuation: boolean
}

export function createSerialLogRows(items: SerialLogSourceEntry[]): SerialLogDisplayRow[] {
  return items.flatMap(item => {
    const lines = item.data.split(/\r\n|\r|\n/)
    return lines.map((line, index) => ({
      ...item,
      id: `${item.id}:${index}`,
      sourceId: item.id,
      data: line,
      isContinuation: index > 0,
    }))
  })
}
