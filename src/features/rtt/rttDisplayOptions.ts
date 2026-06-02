import { Zap } from 'lucide-vue-next'
import type { RttBackend, RttLogLevel } from '../../types/rtt'

export const RTT_STATE_COLOR_MAP: Record<string, string> = {
  disconnected: 'bg-slate-400',
  connecting: 'bg-yellow-500 animate-pulse',
  connected: 'bg-green-500',
  error: 'bg-red-500',
}

export const RTT_LEVEL_COLOR_MAP: Record<string, string> = {
  trace: 'text-slate-500 dark:text-slate-400',
  debug: 'text-blue-600 dark:text-blue-400',
  info: 'text-green-600 dark:text-green-400',
  warn: 'text-yellow-600 dark:text-yellow-400',
  error: 'text-red-600 dark:text-red-400',
}

export const RTT_LEVEL_BG_MAP: Record<string, string> = {
  trace: 'bg-slate-100 dark:bg-slate-800/50',
  debug: 'bg-blue-50 dark:bg-blue-900/20',
  info: 'bg-green-50 dark:bg-green-900/20',
  warn: 'bg-yellow-50 dark:bg-yellow-900/20',
  error: 'bg-red-50 dark:bg-red-900/20',
}

export const rttFrequencyOptions = [
  { value: 1000000, label: '1 MHz' },
  { value: 2000000, label: '2 MHz' },
  { value: 4000000, label: '4 MHz' },
  { value: 8000000, label: '8 MHz' },
  { value: 16000000, label: '16 MHz' },
]

export const rttBackendOptions: Array<{ value: RttBackend; label: string; icon?: unknown }> = [
  { value: 'webusb', label: 'WebUSB 调试工作台', icon: Zap },
]

export const rttLevelOptions: Array<{ value: RttLogLevel; label: string; color: string }> = [
  { value: 'trace', label: 'TRACE', color: 'text-slate-500' },
  { value: 'debug', label: 'DEBUG', color: 'text-blue-500' },
  { value: 'info', label: 'INFO', color: 'text-green-500' },
  { value: 'warn', label: 'WARN', color: 'text-yellow-500' },
  { value: 'error', label: 'ERROR', color: 'text-red-500' },
]
