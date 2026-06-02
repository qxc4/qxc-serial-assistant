<script setup lang="ts">
import { ChevronDown, ChevronUp, Download, FileCode, Trash2, XCircle } from 'lucide-vue-next'
import type { ParsedDataItem, ParseStats } from '../../composables/useDataParse'
import type { ParseMode } from '../../stores/settings'

defineProps<{
  visible: boolean
  parseEnabled: boolean
  parseMode: ParseMode
  resultCount: number
  parseStats: ParseStats
  parsedResults: ParsedDataItem[]
  parseResultExpanded: Record<string, boolean>
  t: (key: string) => string
  formatBytes: (bytes: number[]) => string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  exportResults: []
  clearResults: []
  toggleResult: [id: string]
}>()
</script>

<template>
  <div
    v-if="visible && parseEnabled && parseMode !== 'none'"
    class="apple-panel border-t dark:border-slate-700 bg-slate-100 dark:bg-slate-900 max-h-64 overflow-hidden flex flex-col"
  >
    <div class="flex items-center justify-between px-4 py-2 border-b dark:border-slate-700 bg-white dark:bg-slate-800">
      <h3 class="font-bold text-sm flex items-center gap-2">
        <FileCode class="w-4 h-4" />
        {{ t('serial.parseResults') }}
        <span class="text-xs font-normal text-slate-500">
          ({{ parseStats.successCount }}/{{ parseStats.totalParsed }})
        </span>
      </h3>
      <div class="flex items-center gap-2">
        <button
          @click="emit('exportResults')"
          :disabled="resultCount === 0"
          class="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
          :title="t('serial.export')"
        >
          <Download class="w-4 h-4" />
        </button>
        <button
          @click="emit('clearResults')"
          :disabled="resultCount === 0"
          class="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
          :title="t('serial.clear')"
        >
          <Trash2 class="w-4 h-4" />
        </button>
        <button
          @click="emit('update:visible', false)"
          class="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <XCircle class="w-4 h-4" />
        </button>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
      <div
        v-for="result in parsedResults.slice(-50).reverse()"
        :key="result.id"
        class="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 overflow-hidden"
      >
        <div
          class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700"
          @click="emit('toggleResult', result.id)"
        >
          <component
            :is="parseResultExpanded[result.id] ? ChevronDown : ChevronUp"
            class="w-4 h-4 text-slate-400"
          />
          <span
            class="text-xs px-1.5 py-0.5 rounded"
            :class="result.error ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-green-100 dark:bg-green-900/30 text-green-600'"
          >
            {{ result.error ? t('serial.parseError') : t('serial.parseSuccess') }}
          </span>
          <span class="text-xs text-slate-500">
            {{ new Date(result.timestamp).toLocaleTimeString() }}
          </span>
          <span class="text-xs text-slate-600 dark:text-slate-400 flex-1 truncate">
            {{ result.description || result.error }}
          </span>
        </div>

        <div v-if="parseResultExpanded[result.id]" class="px-3 py-2 border-t dark:border-slate-700 text-xs space-y-2">
          <div>
            <span class="text-slate-500">{{ t('serial.rawData') }}:</span>
            <span class="ml-2 font-mono text-blue-600 dark:text-blue-400">{{ formatBytes(result.rawBytes) }}</span>
          </div>
          <div v-if="result.result?.frame">
            <span class="text-slate-500">{{ t('serial.address') }}:</span>
            <span class="ml-2 font-mono">{{ result.result.frame.address }}</span>
            <span class="text-slate-500 ml-4">{{ t('serial.functionCode') }}:</span>
            <span class="ml-2 font-mono">0x{{ result.result.frame.functionCode.toString(16).toUpperCase().padStart(2, '0') }}</span>
          </div>
          <div v-if="result.checksums && result.checksums.length > 0">
            <span class="text-slate-500">{{ t('serial.checksums') }}:</span>
            <span class="ml-2 space-x-2">
              <span v-for="cs in result.checksums" :key="cs.type" class="font-mono text-xs">
                {{ cs.type }}: <span class="text-purple-600 dark:text-purple-400">{{ cs.value }}</span>
              </span>
            </span>
          </div>
        </div>
      </div>

      <div v-if="resultCount === 0" class="text-center py-8 text-slate-400">
        <FileCode class="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p class="text-xs">{{ t('serial.noParseData') }}</p>
      </div>
    </div>
  </div>
</template>
