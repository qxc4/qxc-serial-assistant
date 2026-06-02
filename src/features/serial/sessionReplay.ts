export type SerialReplayDirection = 'rx' | 'tx'
export type SerialReplayMode = 'tx-only' | 'simulate-rx'

export interface SerialSessionSnapshot {
  baudRate: number
  dataBits: number
  stopBits: number
  parity: string
  receiveEncoding: string
  sendEncoding: string
  lineEnding: string
  capturedAt: string
}

export interface SerialReplayEvent {
  id: string
  direction: SerialReplayDirection
  timestamp: number
  offsetMs: number
  data: string
  hex: string
  isHex: boolean
  byteLength: number
}

export interface SerialSessionRecording {
  version: 1
  name: string
  createdAt: string
  snapshot: SerialSessionSnapshot
  events: SerialReplayEvent[]
}

export interface SerialSessionRecordingInput {
  name: string
  snapshot: SerialSessionSnapshot
  events: SerialReplayEvent[]
  createdAt?: string
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
    .join(' ')
}

export function createSerialSessionSnapshot(config: Omit<SerialSessionSnapshot, 'capturedAt'>): SerialSessionSnapshot {
  return {
    ...config,
    capturedAt: new Date().toISOString(),
  }
}

export function createSerialReplayEvent(
  data: Uint8Array,
  direction: SerialReplayDirection,
  startedAt: number,
  now = Date.now(),
  decoder = new TextDecoder(),
): SerialReplayEvent {
  return {
    id: `${direction}-${now}-${Math.random().toString(16).slice(2, 8)}`,
    direction,
    timestamp: now,
    offsetMs: Math.max(0, now - startedAt),
    data: decoder.decode(data),
    hex: bytesToHex(data),
    isHex: false,
    byteLength: data.byteLength,
  }
}

export function createSerialSessionRecording(input: SerialSessionRecordingInput): SerialSessionRecording {
  return {
    version: 1,
    name: input.name.trim() || 'serial-session',
    createdAt: input.createdAt ?? new Date().toISOString(),
    snapshot: input.snapshot,
    events: [...input.events].sort((a, b) => a.offsetMs - b.offsetMs),
  }
}

export function serializeSerialSessionRecording(recording: SerialSessionRecording): string {
  return JSON.stringify(recording, null, 2)
}

export function parseSerialSessionRecording(text: string): SerialSessionRecording {
  const parsed = JSON.parse(text) as Partial<SerialSessionRecording>
  if (parsed.version !== 1) {
    throw new Error('Unsupported serial session recording version')
  }
  if (!parsed.snapshot || !Array.isArray(parsed.events)) {
    throw new Error('Invalid serial session recording')
  }
  return createSerialSessionRecording({
    name: parsed.name ?? 'serial-session',
    createdAt: parsed.createdAt,
    snapshot: parsed.snapshot,
    events: parsed.events.map((event, index) => normalizeReplayEvent(event, index)),
  })
}

export function getReplayDelay(previous: SerialReplayEvent | null, current: SerialReplayEvent, speed: number): number {
  if (!previous || speed <= 0) return 0
  return Math.max(0, Math.round((current.offsetMs - previous.offsetMs) / speed))
}

export function filterReplayEvents(events: SerialReplayEvent[], mode: SerialReplayMode): SerialReplayEvent[] {
  if (mode === 'tx-only') {
    return events.filter(event => event.direction === 'tx')
  }
  return events
}

function normalizeReplayEvent(event: Partial<SerialReplayEvent>, index: number): SerialReplayEvent {
  const direction = event.direction === 'tx' ? 'tx' : 'rx'
  const hex = typeof event.hex === 'string' ? event.hex : ''
  const data = typeof event.data === 'string' ? event.data : ''
  return {
    id: typeof event.id === 'string' ? event.id : `${direction}-${index}`,
    direction,
    timestamp: typeof event.timestamp === 'number' ? event.timestamp : 0,
    offsetMs: typeof event.offsetMs === 'number' ? Math.max(0, event.offsetMs) : 0,
    data,
    hex,
    isHex: Boolean(event.isHex),
    byteLength: typeof event.byteLength === 'number' ? event.byteLength : Math.max(0, hex.split(/\s+/).filter(Boolean).length),
  }
}
