<script setup lang="ts">
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Cpu,
  Download,
  HelpCircle,
  PanelRight,
  Pause,
  Play,
  Radio,
  Trash2,
  Unplug,
  Usb,
  X,
} from 'lucide-vue-next'
import type { RttBackend } from '../../types/rtt'

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error' | string
type WorkbenchChip = {
  key: string
  label: string
  value: string
  tone: 'ok' | 'warn' | 'error' | 'idle'
}

const backend = defineModel<RttBackend>('backend', { required: true })
const showTopConfigDetails = defineModel<boolean>('showTopConfigDetails', { required: true })
const webUsbProtocol = defineModel<'swd' | 'jtag'>('webUsbProtocol', { required: true })
const webUsbFrequency = defineModel<number>('webUsbFrequency', { required: true })
const rttScanStartInput = defineModel<string>('rttScanStartInput', { required: true })
const rttScanEndInput = defineModel<string>('rttScanEndInput', { required: true })
const rttScanStepInput = defineModel<number>('rttScanStepInput', { required: true })
const autoScroll = defineModel<boolean>('autoScroll', { required: true })
const showHelpPanel = defineModel<boolean>('showHelpPanel', { required: true })
const showRightPanel = defineModel<boolean>('showRightPanel', { required: true })

defineProps<{
  connectionState: ConnectionState
  stateIndicator: string
  isConnected: boolean
  isPaused: boolean
  connectBtnText: string
  isWebUsbMode: boolean
  rttBackendOptions: Array<{ value: RttBackend; label: string }>
  rttFrequencyOptions: Array<{ value: number; label: string }>
  channelsLength: number
  workbenchStatusChips: readonly WorkbenchChip[]
  logStats: { total: number; errors: number; warnings: number }
  webUsbProbeName: string
  hasWebUsbProbe: boolean
  webUsbSupported: boolean
  webUsbScanRangeError: string
  errorMessage: string
  t: (key: string) => string
}>()

defineEmits<{
  connectToggle: []
  togglePause: []
  selectWebUsbDevice: []
  applyWebUsbScanRange: []
  clearLogs: []
  exportLogs: []
  clearError: []
}>()
</script>

<template>
  <div class="apple-toolbar shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white/85 dark:bg-slate-900/85 px-3 py-2">
    <div class="flex items-center gap-2 flex-wrap">
      <div class="flex items-center gap-2">
        <div class="w-2.5 h-2.5 rounded-full shrink-0" :class="stateIndicator" />
        <span class="text-xs text-slate-500 dark:text-slate-400">
          {{ connectionState === 'connected' ? t('rtt.connected') : connectionState === 'connecting' ? t('rtt.connecting') : t('rtt.disconnected') }}
        </span>
      </div>

      <div class="w-px h-5 bg-slate-200 dark:bg-slate-700" />

      <div class="flex items-center gap-1.5">
        <label class="text-xs text-slate-500 dark:text-slate-400">{{ t('rtt.backend') }}</label>
        <select
          v-model="backend"
          :disabled="isConnected"
          class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          <option v-for="opt in rttBackendOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div class="apple-chip flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
        <span class="uppercase">{{ backend }}</span>
        <span>·</span>
        <span>{{ channelsLength }}ch</span>
      </div>

      <button
        @click="showTopConfigDetails = !showTopConfigDetails"
        class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        :title="showTopConfigDetails ? '收起高级配置' : '展开高级配置'"
      >
        <component :is="showTopConfigDetails ? ChevronUp : ChevronDown" class="w-3.5 h-3.5" />
        <span>{{ showTopConfigDetails ? '收起配置' : '展开配置' }}</span>
      </button>

      <div class="w-px h-5 bg-slate-200 dark:bg-slate-700" />

      <button
        @click="$emit('connectToggle')"
        :disabled="connectionState === 'connecting'"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all"
        :class="isConnected
          ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-800'
          : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 border border-green-200 dark:border-green-800 disabled:opacity-50'"
      >
        <Unplug v-if="isConnected" class="w-3.5 h-3.5" />
        <Usb v-else class="w-3.5 h-3.5" />
        {{ connectBtnText }}
      </button>

      <button
        @click="$emit('togglePause')"
        class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-all"
        :class="isPaused
          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'"
        :title="isPaused ? t('rtt.resume') : t('rtt.pause')"
      >
        <Play v-if="isPaused" class="w-3.5 h-3.5" />
        <Pause v-else class="w-3.5 h-3.5" />
      </button>

      <button
        @click="showRightPanel = !showRightPanel"
        class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
        :title="t('rtt.togglePanel')"
      >
        <PanelRight class="w-3.5 h-3.5" />
      </button>

      <button
        @click="showHelpPanel = !showHelpPanel"
        class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-all"
        :class="showHelpPanel ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'"
        :title="t('rtt.help')"
      >
        <HelpCircle class="w-3.5 h-3.5" />
      </button>

      <div class="ml-auto flex items-center gap-1.5 text-[11px]">
        <span
          v-for="chip in workbenchStatusChips"
          :key="chip.key"
          class="px-2 py-1 rounded-lg border"
          :class="chip.tone === 'ok'
            ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800'
            : chip.tone === 'warn'
              ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800'
              : chip.tone === 'error'
                ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'"
        >
          {{ chip.label }}: {{ chip.value }}
        </span>
        <span class="apple-chip px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{{ logStats.total }} {{ t('rtt.entries') }}</span>
        <span v-if="logStats.errors > 0" class="px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400">
          {{ logStats.errors }} {{ t('rtt.errors') }}
        </span>
        <span v-if="logStats.warnings > 0" class="px-2 py-1 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-500 dark:text-yellow-400">
          {{ logStats.warnings }} {{ t('rtt.warnings') }}
        </span>
      </div>
    </div>

    <div v-if="showTopConfigDetails" class="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-3 flex-wrap rounded-xl bg-white/55 dark:bg-slate-800/30 px-2.5 py-2">
      <template v-if="isWebUsbMode">
        <button
          @click="$emit('selectWebUsbDevice')"
          :disabled="isConnected"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-all"
          :class="hasWebUsbProbe
            ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'"
        >
          <Cpu class="w-3.5 h-3.5" />
          {{ hasWebUsbProbe ? webUsbProbeName : '选择设备' }}
        </button>

        <div class="flex items-center gap-1.5">
          <label class="text-xs text-slate-500 dark:text-slate-400">协议</label>
          <select
            v-model="webUsbProtocol"
            :disabled="isConnected"
            class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <option value="swd">SWD</option>
            <option value="jtag">JTAG</option>
          </select>
        </div>

        <div class="flex items-center gap-1.5">
          <label class="text-xs text-slate-500 dark:text-slate-400">频率</label>
          <select
            v-model.number="webUsbFrequency"
            :disabled="isConnected"
            class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <option v-for="opt in rttFrequencyOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="flex items-center gap-1.5">
          <label class="text-xs text-slate-500 dark:text-slate-400">扫描</label>
          <input
            v-model="rttScanStartInput"
            :disabled="isConnected"
            type="text"
            class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 w-28 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            @blur="$emit('applyWebUsbScanRange')"
          />
          <span class="text-xs text-slate-400 dark:text-slate-500">-</span>
          <input
            v-model="rttScanEndInput"
            :disabled="isConnected"
            type="text"
            class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 w-28 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            @blur="$emit('applyWebUsbScanRange')"
          />
          <input
            v-model.number="rttScanStepInput"
            :disabled="isConnected"
            type="number"
            min="4"
            step="4"
            title="扫描步长"
            class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 w-16 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            @blur="$emit('applyWebUsbScanRange')"
          />
          <button
            @click="$emit('applyWebUsbScanRange')"
            :disabled="isConnected"
            class="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            应用
          </button>
        </div>

        <div v-if="webUsbScanRangeError" class="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
          <AlertCircle class="w-3.5 h-3.5" />
          <span>{{ webUsbScanRangeError }}</span>
        </div>

        <div v-if="!webUsbSupported" class="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
          <AlertCircle class="w-3.5 h-3.5" />
          <span>需要 Chrome/Edge 89+</span>
        </div>
      </template>

      <button
        @click="$emit('clearLogs')"
        class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
        :title="t('rtt.clearLogs')"
      >
        <Trash2 class="w-3.5 h-3.5" />
      </button>

      <button
        @click="$emit('exportLogs')"
        class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
        :title="t('rtt.exportLogs')"
      >
        <Download class="w-3.5 h-3.5" />
      </button>

      <button
        @click="autoScroll = !autoScroll"
        class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-all"
        :class="autoScroll ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
        :title="t('rtt.autoScroll')"
      >
        <Radio class="w-3.5 h-3.5" />
      </button>
    </div>

    <div
      v-if="errorMessage"
      class="mt-2 flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-3 py-1.5"
    >
      <AlertCircle class="w-3.5 h-3.5 shrink-0" />
      <span class="flex-1">{{ errorMessage }}</span>
      <button @click="$emit('clearError')" class="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300">
        <X class="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
</template>
