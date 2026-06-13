import { computed, shallowRef } from 'vue'
import type { ModbusPipelineDiagnostics } from '../modbus/pipelineDiagnostics'
import type { SerialSessionDiagnostics } from '../serial'

export type DiagnosticTone = 'ok' | 'warn' | 'error' | 'idle'

export type DiagnosticModule = 'platform' | 'serial' | 'modbus' | 'rtt' | 'shell' | 'chart'

export interface DiagnosticItem {
  id: string
  module: DiagnosticModule
  tone: DiagnosticTone
  title: string
  detail: string
  actionLabel?: string
  route?: string
  priority: number
}

export interface DiagnosticSnapshot {
  generatedAt: number
  highestTone: DiagnosticTone
  items: DiagnosticItem[]
}

export interface SerialDiagnosticError {
  code: string
  message: string
  detail?: string
  timestamp: number
}

export interface SerialDiagnosticInput {
  isSupported: boolean
  isConnected: boolean
  canReconnect: boolean
  isReconnecting: boolean
  session: SerialSessionDiagnostics
  lastError: SerialDiagnosticError | null
  now?: number
}

export interface ModbusDiagnosticInput {
  pipeline: ModbusPipelineDiagnostics
  responseGap: number
  pollingHealth: {
    tone: DiagnosticTone
    title: string
    detail: string
  } | null
}

export interface PlatformDiagnosticInput {
  serialSupported: boolean
  usbSupported: boolean
}

export interface RttDiagnosticInput {
  isSupported: boolean
  isConnected: boolean
  selfCheckTone?: DiagnosticTone | null
  selfCheckTitle?: string
  selfCheckDetail?: string
  breakpointTone?: DiagnosticTone | null
  breakpointTitle?: string
  breakpointDetail?: string
}

export interface ShellDiagnosticInput {
  isSerialConnected: boolean
  outputPaused: boolean
  hasPendingDangerousCommand: boolean
  lastErrorLine?: string
}

export interface ChartDiagnosticInput {
  isCollecting: boolean
  enabledChannels: number
  totalDataPoints: number
  source: 'serial' | 'manual' | 'demo' | string
  isSerialConnected: boolean
  isReplaying: boolean
}

type Translator = (key: string, params?: Record<string, unknown>) => string

const moduleOrder: DiagnosticModule[] = ['platform', 'serial', 'modbus', 'rtt', 'shell', 'chart']

const toneRank: Record<DiagnosticTone, number> = {
  ok: 0,
  idle: 1,
  warn: 2,
  error: 3,
}

const moduleDiagnostics = shallowRef<Partial<Record<DiagnosticModule, DiagnosticItem[]>>>({})

function bySeverityPriorityAndModule(left: DiagnosticItem, right: DiagnosticItem): number {
  const toneDelta = toneRank[right.tone] - toneRank[left.tone]
  if (toneDelta !== 0) return toneDelta

  const priorityDelta = right.priority - left.priority
  if (priorityDelta !== 0) return priorityDelta

  const moduleDelta = moduleOrder.indexOf(left.module) - moduleOrder.indexOf(right.module)
  if (moduleDelta !== 0) return moduleDelta

  return left.id.localeCompare(right.id)
}

export function createDiagnosticSnapshot(items: DiagnosticItem[], now = Date.now()): DiagnosticSnapshot {
  const sortedItems = [...items].sort(bySeverityPriorityAndModule)
  const highestTone = sortedItems.reduce<DiagnosticTone>((highest, item) => {
    return toneRank[item.tone] > toneRank[highest] ? item.tone : highest
  }, 'ok')

  return {
    generatedAt: now,
    highestTone,
    items: sortedItems,
  }
}

export function setModuleDiagnostics(module: DiagnosticModule, items: DiagnosticItem[]): void {
  const nextDiagnostics = { ...moduleDiagnostics.value }

  if (items.length === 0) {
    delete nextDiagnostics[module]
  } else {
    nextDiagnostics[module] = items.map(item => ({ ...item, module }))
  }

  moduleDiagnostics.value = nextDiagnostics
}

export function resetDiagnostics(): void {
  moduleDiagnostics.value = {}
}

export function useGlobalDiagnostics() {
  const snapshot = computed(() => {
    const items = moduleOrder.flatMap(module => moduleDiagnostics.value[module] ?? [])
    return createDiagnosticSnapshot(items)
  })

  return {
    moduleDiagnostics,
    snapshot,
    setModuleDiagnostics,
    resetDiagnostics,
  }
}

export function buildPlatformDiagnostics(input: PlatformDiagnosticInput, t: Translator): DiagnosticItem[] {
  const items: DiagnosticItem[] = []

  if (!input.serialSupported) {
    items.push({
      id: 'platform-web-serial-unsupported',
      module: 'platform',
      tone: 'error',
      title: t('diagnostics.platform.serialUnsupported.title'),
      detail: t('diagnostics.platform.serialUnsupported.detail'),
      priority: 100,
    })
  }

  if (!input.usbSupported) {
    items.push({
      id: 'platform-web-usb-unsupported',
      module: 'platform',
      tone: 'warn',
      title: t('diagnostics.platform.usbUnsupported.title'),
      detail: t('diagnostics.platform.usbUnsupported.detail'),
      priority: 80,
    })
  }

  if (items.length === 0) {
    items.push({
      id: 'platform-ready',
      module: 'platform',
      tone: 'ok',
      title: t('diagnostics.platform.ready.title'),
      detail: t('diagnostics.platform.ready.detail'),
      priority: 10,
    })
  }

  return items
}

export function buildSerialDiagnostics(input: SerialDiagnosticInput, t: Translator): DiagnosticItem[] {
  const items: DiagnosticItem[] = []
  const now = input.now ?? Date.now()

  if (!input.isSupported) {
    items.push({
      id: 'serial-unsupported',
      module: 'serial',
      tone: 'error',
      title: t('diagnostics.serial.unsupported.title'),
      detail: t('diagnostics.serial.unsupported.detail'),
      route: '/',
      actionLabel: t('diagnostics.actions.openSerial'),
      priority: 100,
    })
  }

  if (!input.isConnected) {
    items.push({
      id: 'serial-disconnected',
      module: 'serial',
      tone: input.canReconnect ? 'warn' : 'idle',
      title: input.canReconnect
        ? t('diagnostics.serial.reconnectAvailable.title')
        : t('diagnostics.serial.disconnected.title'),
      detail: input.canReconnect
        ? t('diagnostics.serial.reconnectAvailable.detail')
        : t('diagnostics.serial.disconnected.detail'),
      route: '/',
      actionLabel: t('diagnostics.actions.openSerial'),
      priority: input.canReconnect ? 72 : 30,
    })
  }

  if (input.isReconnecting) {
    items.push({
      id: 'serial-reconnecting',
      module: 'serial',
      tone: 'warn',
      title: t('diagnostics.serial.reconnecting.title'),
      detail: t('diagnostics.serial.reconnecting.detail'),
      route: '/',
      actionLabel: t('diagnostics.actions.openSerial'),
      priority: 70,
    })
  }

  if (input.lastError) {
    items.push({
      id: 'serial-last-error',
      module: 'serial',
      tone: 'error',
      title: t('diagnostics.serial.lastError.title'),
      detail: input.lastError.detail || input.lastError.message,
      route: '/',
      actionLabel: t('diagnostics.actions.openSerial'),
      priority: 90,
    })
  }

  const waitAfterSendMs = input.session.lastTxAt === null ? 0 : now - input.session.lastTxAt
  if (
    input.isConnected
    && input.session.txEntries > 0
    && !input.session.receiveAfterLastTx
    && waitAfterSendMs >= 2_000
  ) {
    items.push({
      id: 'serial-no-response',
      module: 'serial',
      tone: 'warn',
      title: t('diagnostics.serial.noResponse.title'),
      detail: t('diagnostics.serial.noResponse.detail', { seconds: Math.round(waitAfterSendMs / 1000) }),
      route: '/',
      actionLabel: t('diagnostics.actions.openSerial'),
      priority: 65,
    })
  }

  if (input.isConnected && input.session.silenceMs !== null && input.session.silenceMs >= 5_000) {
    items.push({
      id: 'serial-silent',
      module: 'serial',
      tone: 'warn',
      title: t('diagnostics.serial.silent.title'),
      detail: t('diagnostics.serial.silent.detail', { seconds: Math.round(input.session.silenceMs / 1000) }),
      route: '/',
      actionLabel: t('diagnostics.actions.openSerial'),
      priority: 55,
    })
  }

  if (items.length === 0) {
    items.push({
      id: 'serial-active',
      module: 'serial',
      tone: 'ok',
      title: t('diagnostics.serial.active.title'),
      detail: t('diagnostics.serial.active.detail'),
      route: '/',
      actionLabel: t('diagnostics.actions.openSerial'),
      priority: 10,
    })
  }

  return items
}

export function buildModbusDiagnostics(input: ModbusDiagnosticInput, t: Translator): DiagnosticItem[] {
  const items: DiagnosticItem[] = []

  if (input.responseGap > 0) {
    items.push({
      id: 'modbus-response-gap',
      module: 'modbus',
      tone: input.responseGap >= 2 ? 'error' : 'warn',
      title: t('diagnostics.modbus.responseGap.title'),
      detail: t('diagnostics.modbus.responseGap.detail', { count: input.responseGap }),
      route: '/modbus',
      actionLabel: t('diagnostics.actions.openModbus'),
      priority: 95,
    })
  }

  if (input.pipeline.failed > 0) {
    items.push({
      id: 'modbus-parse-failed',
      module: 'modbus',
      tone: 'warn',
      title: t('diagnostics.modbus.parseFailed.title'),
      detail: input.pipeline.lastError || t('diagnostics.modbus.parseFailed.detail', { count: input.pipeline.failed }),
      route: '/modbus',
      actionLabel: t('diagnostics.actions.openModbus'),
      priority: 82,
    })
  }

  if (input.pipeline.exceptionFrames > 0) {
    items.push({
      id: 'modbus-exception-frame',
      module: 'modbus',
      tone: 'warn',
      title: t('diagnostics.modbus.exceptionFrame.title'),
      detail: t('diagnostics.modbus.exceptionFrame.detail', { count: input.pipeline.exceptionFrames }),
      route: '/modbus',
      actionLabel: t('diagnostics.actions.openModbus'),
      priority: 78,
    })
  }

  if (input.pipeline.total > 0 && input.pipeline.successRate < 60) {
    items.push({
      id: 'modbus-low-success-rate',
      module: 'modbus',
      tone: 'warn',
      title: t('diagnostics.modbus.lowSuccessRate.title'),
      detail: t('diagnostics.modbus.lowSuccessRate.detail', { rate: input.pipeline.successRate }),
      route: '/modbus',
      actionLabel: t('diagnostics.actions.openModbus'),
      priority: 76,
    })
  }

  if (input.pollingHealth && input.pollingHealth.tone !== 'ok') {
    items.push({
      id: 'modbus-polling-health',
      module: 'modbus',
      tone: input.pollingHealth.tone,
      title: input.pollingHealth.title,
      detail: input.pollingHealth.detail,
      route: '/modbus',
      actionLabel: t('diagnostics.actions.openModbus'),
      priority: 70,
    })
  }

  if (items.length === 0) {
    items.push({
      id: input.pipeline.total > 0 ? 'modbus-active' : 'modbus-idle',
      module: 'modbus',
      tone: input.pipeline.total > 0 ? 'ok' : 'idle',
      title: input.pipeline.total > 0
        ? t('diagnostics.modbus.active.title')
        : t('diagnostics.modbus.idle.title'),
      detail: input.pipeline.total > 0
        ? t('diagnostics.modbus.active.detail')
        : t('diagnostics.modbus.idle.detail'),
      route: '/modbus',
      actionLabel: t('diagnostics.actions.openModbus'),
      priority: 10,
    })
  }

  return items
}

export function buildRttDiagnostics(input: RttDiagnosticInput, t: Translator): DiagnosticItem[] {
  const items: DiagnosticItem[] = []

  if (!input.isSupported) {
    items.push({
      id: 'rtt-unsupported',
      module: 'rtt',
      tone: 'error',
      title: t('diagnostics.rtt.unsupported.title'),
      detail: t('diagnostics.rtt.unsupported.detail'),
      route: '/rtt',
      actionLabel: t('diagnostics.actions.openRtt'),
      priority: 100,
    })
  }

  if (!input.isConnected) {
    items.push({
      id: 'rtt-disconnected',
      module: 'rtt',
      tone: 'idle',
      title: t('diagnostics.rtt.disconnected.title'),
      detail: t('diagnostics.rtt.disconnected.detail'),
      route: '/rtt',
      actionLabel: t('diagnostics.actions.openRtt'),
      priority: 30,
    })
  }

  items.push({
    id: 'rtt-experimental',
    module: 'rtt',
    tone: 'idle',
    title: t('diagnostics.rtt.experimental.title'),
    detail: t('diagnostics.rtt.experimental.detail'),
    route: '/rtt',
    actionLabel: t('diagnostics.actions.openRtt'),
    priority: 20,
  })

  if (input.breakpointTone && input.breakpointTone !== 'ok') {
    items.push({
      id: 'rtt-breakpoints',
      module: 'rtt',
      tone: input.breakpointTone,
      title: input.breakpointTitle || t('diagnostics.rtt.breakpoints.title'),
      detail: input.breakpointDetail || t('diagnostics.rtt.breakpoints.detail'),
      route: '/rtt',
      actionLabel: t('diagnostics.actions.openRtt'),
      priority: 66,
    })
  }

  if (input.selfCheckTone && input.selfCheckTone !== 'ok') {
    items.push({
      id: 'rtt-self-check',
      module: 'rtt',
      tone: input.selfCheckTone,
      title: input.selfCheckTitle || t('diagnostics.rtt.selfCheck.title'),
      detail: input.selfCheckDetail || t('diagnostics.rtt.selfCheck.detail'),
      route: '/rtt',
      actionLabel: t('diagnostics.actions.openRtt'),
      priority: 75,
    })
  }

  return items
}

export function buildShellDiagnostics(input: ShellDiagnosticInput, t: Translator): DiagnosticItem[] {
  const items: DiagnosticItem[] = []

  if (!input.isSerialConnected) {
    items.push({
      id: 'shell-serial-disconnected',
      module: 'shell',
      tone: 'idle',
      title: t('diagnostics.shell.serialDisconnected.title'),
      detail: t('diagnostics.shell.serialDisconnected.detail'),
      route: '/shell',
      actionLabel: t('diagnostics.actions.openShell'),
      priority: 40,
    })
  }

  if (input.outputPaused) {
    items.push({
      id: 'shell-output-paused',
      module: 'shell',
      tone: 'warn',
      title: t('diagnostics.shell.outputPaused.title'),
      detail: t('diagnostics.shell.outputPaused.detail'),
      route: '/shell',
      actionLabel: t('diagnostics.actions.openShell'),
      priority: 70,
    })
  }

  if (input.hasPendingDangerousCommand) {
    items.push({
      id: 'shell-dangerous-command',
      module: 'shell',
      tone: 'warn',
      title: t('diagnostics.shell.dangerousCommand.title'),
      detail: t('diagnostics.shell.dangerousCommand.detail'),
      route: '/shell',
      actionLabel: t('diagnostics.actions.openShell'),
      priority: 80,
    })
  }

  if (input.lastErrorLine) {
    items.push({
      id: 'shell-last-error',
      module: 'shell',
      tone: 'warn',
      title: t('diagnostics.shell.lastError.title'),
      detail: input.lastErrorLine,
      route: '/shell',
      actionLabel: t('diagnostics.actions.openShell'),
      priority: 75,
    })
  }

  if (items.length === 0) {
    items.push({
      id: 'shell-ready',
      module: 'shell',
      tone: 'ok',
      title: t('diagnostics.shell.ready.title'),
      detail: t('diagnostics.shell.ready.detail'),
      route: '/shell',
      actionLabel: t('diagnostics.actions.openShell'),
      priority: 10,
    })
  }

  return items
}

export function buildChartDiagnostics(input: ChartDiagnosticInput, t: Translator): DiagnosticItem[] {
  const items: DiagnosticItem[] = []

  if (!input.isCollecting) {
    items.push({
      id: 'chart-not-collecting',
      module: 'chart',
      tone: 'idle',
      title: t('diagnostics.chart.notCollecting.title'),
      detail: t('diagnostics.chart.notCollecting.detail'),
      route: '/chart',
      actionLabel: t('diagnostics.actions.openChart'),
      priority: 30,
    })
  }

  if (input.enabledChannels === 0) {
    items.push({
      id: 'chart-no-enabled-channel',
      module: 'chart',
      tone: 'warn',
      title: t('diagnostics.chart.noEnabledChannel.title'),
      detail: t('diagnostics.chart.noEnabledChannel.detail'),
      route: '/chart',
      actionLabel: t('diagnostics.actions.openChart'),
      priority: 72,
    })
  }

  if (input.source === 'serial' && !input.isSerialConnected) {
    items.push({
      id: 'chart-serial-disconnected',
      module: 'chart',
      tone: 'warn',
      title: t('diagnostics.chart.serialDisconnected.title'),
      detail: t('diagnostics.chart.serialDisconnected.detail'),
      route: '/chart',
      actionLabel: t('diagnostics.actions.openChart'),
      priority: 76,
    })
  }

  if (input.isCollecting && input.totalDataPoints === 0) {
    items.push({
      id: 'chart-empty-data',
      module: 'chart',
      tone: 'warn',
      title: t('diagnostics.chart.emptyData.title'),
      detail: t('diagnostics.chart.emptyData.detail'),
      route: '/chart',
      actionLabel: t('diagnostics.actions.openChart'),
      priority: 64,
    })
  }

  if (input.isReplaying) {
    items.push({
      id: 'chart-replaying',
      module: 'chart',
      tone: 'idle',
      title: t('diagnostics.chart.replaying.title'),
      detail: t('diagnostics.chart.replaying.detail'),
      route: '/chart',
      actionLabel: t('diagnostics.actions.openChart'),
      priority: 20,
    })
  }

  if (items.length === 0) {
    items.push({
      id: 'chart-active',
      module: 'chart',
      tone: 'ok',
      title: t('diagnostics.chart.active.title'),
      detail: t('diagnostics.chart.active.detail'),
      route: '/chart',
      actionLabel: t('diagnostics.actions.openChart'),
      priority: 10,
    })
  }

  return items
}
