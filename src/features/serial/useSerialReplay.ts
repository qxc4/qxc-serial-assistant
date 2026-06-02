import { computed, ref, type ComputedRef, type Ref } from 'vue'
import {
  createSerialReplayEvent,
  createSerialSessionRecording,
  filterReplayEvents,
  getReplayDelay,
  parseSerialSessionRecording,
  serializeSerialSessionRecording,
  type SerialReplayDirection,
  type SerialReplayEvent,
  type SerialReplayMode,
  type SerialSessionRecording,
  type SerialSessionSnapshot,
} from './sessionReplay'

export type SerialReplaySend = (data: string, isHex?: boolean) => Promise<void>
export type SerialReplayDownload = (content: string, filename: string, type: string) => void

export interface UseSerialReplayOptions {
  send: SerialReplaySend
  isConnected: Ref<boolean>
  createSnapshot: () => SerialSessionSnapshot
  showToast: (message: string) => void
  downloadTextFile?: SerialReplayDownload
}

export interface UseSerialReplayReturn {
  isRecordingSession: Ref<boolean>
  sessionRecordingName: Ref<string>
  recordedReplayEvents: Ref<SerialReplayEvent[]>
  loadedSessionRecording: Ref<SerialSessionRecording | null>
  sessionReplayFileInputRef: Ref<HTMLInputElement | null>
  replayMode: Ref<SerialReplayMode>
  replaySpeed: Ref<number>
  isReplayingSession: Ref<boolean>
  replayCursor: Ref<number>
  simulatedReplayEvents: Ref<SerialReplayEvent[]>
  replayEventsForMode: ComputedRef<SerialReplayEvent[]>
  canStartSessionReplay: ComputedRef<boolean>
  recordSerialSessionEvent: (data: Uint8Array, direction: SerialReplayDirection) => void
  startSessionRecording: () => void
  stopSessionRecording: () => void
  exportSessionRecording: () => void
  openSessionReplayFile: () => void
  handleSessionReplayFileSelected: (event: Event) => Promise<void>
  startSessionReplay: () => Promise<void>
  stopSessionReplay: () => void
}

function downloadTextFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function waitForReplayDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve()

  return new Promise(resolve => {
    const timeoutId = window.setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timeoutId)
      resolve()
    }, { once: true })
  })
}

export function useSerialReplay(options: UseSerialReplayOptions): UseSerialReplayReturn {
  const isRecordingSession = ref(false)
  const sessionRecordingStartedAt = ref(0)
  const sessionRecordingName = ref('serial-session')
  const recordedReplayEvents = ref<SerialReplayEvent[]>([])
  const loadedSessionRecording = ref<SerialSessionRecording | null>(null)
  const sessionReplayFileInputRef = ref<HTMLInputElement | null>(null)
  const replayMode = ref<SerialReplayMode>('tx-only')
  const replaySpeed = ref(1)
  const isReplayingSession = ref(false)
  const replayCursor = ref(0)
  const simulatedReplayEvents = ref<SerialReplayEvent[]>([])
  const download = options.downloadTextFile ?? downloadTextFile
  let replayAbortController: AbortController | null = null

  const replayEventsForMode = computed(() =>
    loadedSessionRecording.value ? filterReplayEvents(loadedSessionRecording.value.events, replayMode.value) : [],
  )
  const canStartSessionReplay = computed(() =>
    Boolean(loadedSessionRecording.value && replayEventsForMode.value.length > 0 && !isReplayingSession.value),
  )

  function recordSerialSessionEvent(data: Uint8Array, direction: SerialReplayDirection) {
    if (!isRecordingSession.value || sessionRecordingStartedAt.value <= 0) return
    const event = createSerialReplayEvent(data, direction, sessionRecordingStartedAt.value)
    recordedReplayEvents.value.push({
      ...event,
      isHex: direction === 'tx',
    })
  }

  function startSessionRecording() {
    recordedReplayEvents.value = []
    simulatedReplayEvents.value = []
    sessionRecordingStartedAt.value = Date.now()
    sessionRecordingName.value = `serial-session-${sessionRecordingStartedAt.value}`
    isRecordingSession.value = true
    options.showToast('已开始录制串口会话')
  }

  function stopSessionRecording() {
    isRecordingSession.value = false
    options.showToast(`已停止录制：${recordedReplayEvents.value.length} 条事件`)
  }

  function exportSessionRecording() {
    if (recordedReplayEvents.value.length === 0) {
      options.showToast('没有可导出的录制事件')
      return
    }
    const recording = createSerialSessionRecording({
      name: sessionRecordingName.value,
      snapshot: options.createSnapshot(),
      events: recordedReplayEvents.value,
    })
    download(
      serializeSerialSessionRecording(recording),
      `${recording.name}.qxc-session.json`,
      'application/json;charset=utf-8',
    )
  }

  function openSessionReplayFile() {
    sessionReplayFileInputRef.value?.click()
  }

  async function handleSessionReplayFileSelected(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    try {
      loadedSessionRecording.value = parseSerialSessionRecording(await file.text())
      replayCursor.value = 0
      simulatedReplayEvents.value = []
      options.showToast(`已导入会话：${loadedSessionRecording.value.events.length} 条事件`)
    } catch (error) {
      options.showToast(error instanceof Error ? error.message : '会话文件解析失败')
    }
  }

  async function startSessionReplay() {
    if (!loadedSessionRecording.value) {
      options.showToast('请先导入会话文件')
      return
    }
    if (replayMode.value === 'tx-only' && !options.isConnected.value) {
      options.showToast('TX 回放需要先连接串口')
      return
    }

    replayAbortController?.abort()
    replayAbortController = new AbortController()
    const signal = replayAbortController.signal
    const events = replayEventsForMode.value
    isReplayingSession.value = true
    replayCursor.value = 0
    simulatedReplayEvents.value = []

    try {
      let previous: SerialReplayEvent | null = null
      for (const event of events) {
        if (signal.aborted) break
        await waitForReplayDelay(getReplayDelay(previous, event, replaySpeed.value), signal)
        if (signal.aborted) break

        if (replayMode.value === 'tx-only') {
          await options.send(event.hex, true)
        } else {
          simulatedReplayEvents.value = [...simulatedReplayEvents.value.slice(-19), event]
        }
        replayCursor.value += 1
        previous = event
      }
    } catch (error) {
      options.showToast(error instanceof Error ? error.message : '会话回放失败')
    } finally {
      isReplayingSession.value = false
      replayAbortController = null
    }
  }

  function stopSessionReplay() {
    replayAbortController?.abort()
    replayAbortController = null
    isReplayingSession.value = false
  }

  return {
    isRecordingSession,
    sessionRecordingName,
    recordedReplayEvents,
    loadedSessionRecording,
    sessionReplayFileInputRef,
    replayMode,
    replaySpeed,
    isReplayingSession,
    replayCursor,
    simulatedReplayEvents,
    replayEventsForMode,
    canStartSessionReplay,
    recordSerialSessionEvent,
    startSessionRecording,
    stopSessionRecording,
    exportSessionRecording,
    openSessionReplayFile,
    handleSessionReplayFileSelected,
    startSessionReplay,
    stopSessionReplay,
  }
}
