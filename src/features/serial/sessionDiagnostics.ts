export interface SerialDiagnosticEntry {
  timestamp: number
  direction: 'rx' | 'tx'
  data: string
}

export interface SerialSessionDiagnostics {
  totalEntries: number
  txEntries: number
  rxEntries: number
  lastTxAt: number | null
  lastRxAt: number | null
  averageTxIntervalMs: number | null
  receiveAfterLastTx: boolean
  silenceMs: number | null
}

export function summarizeSerialSession(entries: SerialDiagnosticEntry[], now = Date.now()): SerialSessionDiagnostics {
  const txEntries = entries.filter(entry => entry.direction === 'tx')
  const rxEntries = entries.filter(entry => entry.direction === 'rx')
  const lastTxAt = txEntries.at(-1)?.timestamp ?? null
  const lastRxAt = rxEntries.at(-1)?.timestamp ?? null

  let averageTxIntervalMs: number | null = null
  if (txEntries.length >= 2) {
    let totalInterval = 0
    for (let index = 1; index < txEntries.length; index++) {
      totalInterval += txEntries[index]!.timestamp - txEntries[index - 1]!.timestamp
    }
    averageTxIntervalMs = Math.round(totalInterval / (txEntries.length - 1))
  }

  const latestActivityAt = Math.max(lastTxAt ?? 0, lastRxAt ?? 0)

  return {
    totalEntries: entries.length,
    txEntries: txEntries.length,
    rxEntries: rxEntries.length,
    lastTxAt,
    lastRxAt,
    averageTxIntervalMs,
    receiveAfterLastTx: lastTxAt !== null && lastRxAt !== null && lastRxAt >= lastTxAt,
    silenceMs: latestActivityAt > 0 ? Math.max(0, now - latestActivityAt) : null,
  }
}

export function formatSerialDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.round(ms / 100) / 10}s`
  return `${Math.round(ms / 60_000)}min`
}
