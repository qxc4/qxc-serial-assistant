<script setup lang="ts">
import { computed } from 'vue'
import { Maximize, PanelBottom, PanelLeft, PanelRight, Search, Usb, XCircle } from 'lucide-vue-next'
import SerialSessionStrip from './SerialSessionStrip.vue'
import type { SerialSessionDescriptor, SerialSessionDiagnostics } from '../../features/serial'

const props = defineProps<{
  isConnected: boolean
  connectionSummary: string
  searchQuery: string
  filteredCount: number
  dataCount: number
  serialResponseState: string
  serialSessionDiagnostics: SerialSessionDiagnostics
  serialSessions: SerialSessionDescriptor[]
  activeSerialSessionId: string
  activeSerialSession: SerialSessionDescriptor | null
  maxSessions: number
  showLeftPanel: boolean
  showBottomPanel: boolean
  showRightPanel: boolean
  t: (key: string) => string
  formatSerialDuration: (ms: number | null) => string
}>()

const emit = defineEmits<{
  'update:searchQuery': [value: string]
  'update:showLeftPanel': [value: boolean]
  'update:showBottomPanel': [value: boolean]
  'update:showRightPanel': [value: boolean]
  addSession: []
  removeSession: [id: string]
  setActiveSession: [id: string]
}>()

const localSearchQuery = computed({
  get: () => props.searchQuery,
  set: value => emit('update:searchQuery', value),
})

function maximizeView() {
  emit('update:showLeftPanel', false)
  emit('update:showBottomPanel', false)
  emit('update:showRightPanel', false)
}
</script>

<template>
  <div class="apple-toolbar border-b dark:border-slate-700 bg-slate-50/85 dark:bg-slate-900/85 shrink-0 px-3 py-2">
    <div class="flex items-center gap-2">
      <button
        @click="emit('update:showLeftPanel', true)"
        class="min-w-0 max-w-[240px] rounded-lg border px-2.5 py-1.5 text-left transition-colors flex items-center gap-2"
        :class="isConnected
          ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'"
        title="打开连接抽屉"
      >
        <Usb class="h-4 w-4 shrink-0" />
        <span class="min-w-0">
          <span class="block truncate text-[11px] font-semibold">
            {{ isConnected ? t('serial.connected') : t('serial.serialSettings') }}
          </span>
          <span class="block truncate text-[10px] opacity-75">{{ connectionSummary }}</span>
        </span>
      </button>

      <div class="relative min-w-0 flex-1 max-w-sm">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          v-model="localSearchQuery"
          type="text"
          :placeholder="t('serial.searchPlaceholder')"
          class="w-full pl-9 pr-7 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-shadow"
        />
        <button
          v-if="searchQuery"
          @click="localSearchQuery = ''"
          class="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          <XCircle class="w-3.5 h-3.5" />
        </button>
      </div>

      <div class="hidden md:flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 px-2 py-1 rounded bg-white dark:bg-slate-800 border dark:border-slate-700">
        <span>{{ filteredCount }}</span>
        <span>/</span>
        <span>{{ dataCount.toLocaleString() }}</span>
      </div>

      <div class="hidden xl:flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
        <span
          class="rounded-full px-2 py-0.5"
          :class="serialSessionDiagnostics.receiveAfterLastTx ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300'"
        >
          {{ serialResponseState }}
        </span>
        <span>TX {{ serialSessionDiagnostics.txEntries }}</span>
        <span>RX {{ serialSessionDiagnostics.rxEntries }}</span>
        <span>静默 {{ formatSerialDuration(serialSessionDiagnostics.silenceMs) }}</span>
        <span v-if="serialSessionDiagnostics.averageTxIntervalMs !== null">
          均隔 {{ formatSerialDuration(serialSessionDiagnostics.averageTxIntervalMs) }}
        </span>
      </div>

      <div class="flex items-center gap-1 text-slate-600 dark:text-slate-400">
        <button @click="emit('update:showLeftPanel', !showLeftPanel)" :class="showLeftPanel ? 'text-slate-900 dark:text-slate-100 bg-slate-200 dark:bg-slate-700' : 'text-slate-400'" class="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors" title="切换连接抽屉"><PanelLeft class="w-4 h-4" /></button>
        <button @click="emit('update:showBottomPanel', !showBottomPanel)" :class="showBottomPanel ? 'text-slate-900 dark:text-slate-100 bg-slate-200 dark:bg-slate-700' : 'text-slate-400'" class="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors" title="切换底部栏"><PanelBottom class="w-4 h-4" /></button>
        <button @click="emit('update:showRightPanel', !showRightPanel)" :class="showRightPanel ? 'text-slate-900 dark:text-slate-100 bg-slate-200 dark:bg-slate-700' : 'text-slate-400'" class="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors" title="切换右侧栏"><PanelRight class="w-4 h-4" /></button>
        <button @click="maximizeView" class="p-1.5 text-slate-400 hover:text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors" title="最大化视图"><Maximize class="w-4 h-4" /></button>
      </div>
    </div>
    <div class="mt-2 flex items-center gap-2">
      <SerialSessionStrip
        class="min-w-0 flex-1"
        :sessions="serialSessions"
        :active-session-id="activeSerialSessionId"
        :max-sessions="maxSessions"
        :is-connected="isConnected"
        @add-session="emit('addSession')"
        @remove-session="emit('removeSession', $event)"
        @set-active-session="emit('setActiveSession', $event)"
      />
      <div
        v-if="activeSerialSession"
        class="hidden shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 lg:block"
      >
        {{ activeSerialSession.connectionLabel }}
      </div>
    </div>
  </div>
</template>
