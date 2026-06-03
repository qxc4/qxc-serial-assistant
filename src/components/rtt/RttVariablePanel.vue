<script setup lang="ts">
import { computed } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import type { VariableImageSummary, VariableSpec, VariableValue } from '../../debug-core'

const props = defineProps<{
  isConnected: boolean
  variableElfName: string
  variableSpecs: VariableSpec[]
  filteredVariableValues: VariableValue[]
  variableImageSummary: VariableImageSummary | null
  variableError: string
  variableLoading: boolean
  variableFilterText: string
  variableAutoRefresh: boolean
  variableRefreshMs: number
  formatVariableAddress: (address: number) => string
  formatVariableValue: (item: VariableValue) => string
}>()

const emit = defineEmits<{
  'update:variableFilterText': [value: string]
  'update:variableAutoRefresh': [value: boolean]
  'update:variableRefreshMs': [value: number]
  importElf: []
  refreshVariables: []
}>()

const localVariableFilterText = computed({
  get: () => props.variableFilterText,
  set: value => emit('update:variableFilterText', value),
})

const localVariableAutoRefresh = computed({
  get: () => props.variableAutoRefresh,
  set: value => emit('update:variableAutoRefresh', value),
})

const localVariableRefreshMs = computed({
  get: () => props.variableRefreshMs,
  set: value => emit('update:variableRefreshMs', Number(value)),
})
</script>

<template>
  <div class="p-3 border-b border-slate-200 dark:border-slate-800">
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400">变量</h3>
      <div class="flex items-center gap-1">
        <button
          data-testid="rtt-variable-import"
          @click="emit('importElf')"
          class="px-2 py-1 rounded text-[10px] border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          导入 ELF
        </button>
        <button
          data-testid="rtt-variable-refresh"
          @click="emit('refreshVariables')"
          :disabled="variableLoading || !isConnected || variableSpecs.length === 0"
          class="p-1 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
          title="刷新变量"
        >
          <RefreshCw class="w-3 h-3" :class="variableLoading ? 'animate-spin' : ''" />
        </button>
      </div>
    </div>

    <div class="flex items-center gap-1.5 mb-2">
      <input
        data-testid="rtt-variable-filter"
        v-model="localVariableFilterText"
        type="text"
        placeholder="筛选变量"
        class="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-[10px] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <label class="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
        <input data-testid="rtt-variable-auto" v-model="localVariableAutoRefresh" type="checkbox" class="w-3 h-3" />
        自动
      </label>
      <select
        data-testid="rtt-variable-refresh-ms"
        v-model.number="localVariableRefreshMs"
        :disabled="!variableAutoRefresh"
        class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 text-[10px] text-slate-700 dark:text-slate-200 disabled:opacity-50"
      >
        <option :value="200">200ms</option>
        <option :value="500">500ms</option>
        <option :value="1000">1s</option>
      </select>
    </div>

    <p class="text-[10px] text-slate-500 dark:text-slate-400 truncate mb-1" :title="variableElfName || '未导入 ELF'">
      {{ variableElfName || '未导入 ELF' }}
    </p>
    <p class="text-[10px] text-slate-400 dark:text-slate-500 mb-1">
      {{ variableSpecs.length }} 个变量 / {{ filteredVariableValues.length }} 条显示
      <template v-if="variableImageSummary">
        · 函数 {{ variableImageSummary.functionSymbols }} · 对象 {{ variableImageSummary.objectSymbols }}
      </template>
    </p>
    <div v-if="variableImageSummary" class="mb-2 grid grid-cols-2 gap-1 text-[10px] text-slate-500 dark:text-slate-400">
      <div class="rounded border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900">
        PC 函数：
        <span class="font-mono text-slate-700 dark:text-slate-200">
          {{ variableImageSummary.currentFunction?.name ?? '-' }}
        </span>
      </div>
      <div class="rounded border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900">
        primitive {{ variableImageSummary.readableVariables }} / best-effort {{ variableImageSummary.bestEffortVariables }}
      </div>
    </div>

    <div v-if="variableError" class="text-[10px] text-red-600 dark:text-red-400 mb-2">
      {{ variableError }}
    </div>

    <div class="grid grid-cols-[1.2fr_1fr_1.6fr] gap-1 text-[10px] text-slate-400 dark:text-slate-500 mb-1">
      <span>名称(类型)</span>
      <span>地址</span>
      <span class="text-right">值</span>
    </div>

    <div v-if="filteredVariableValues.length > 0" class="space-y-1 max-h-40 overflow-auto pr-1">
      <div
        v-for="item in filteredVariableValues"
        :key="`${item.name}-${item.address}`"
        class="grid grid-cols-[1.2fr_1fr_1.6fr] gap-1 items-center text-[10px]"
      >
        <span class="truncate text-slate-600 dark:text-slate-300" :title="item.note ? `${item.name}: ${item.note}` : item.name">
          {{ item.name }}({{ item.type }})
          <span v-if="item.displayKind && item.displayKind !== 'primitive'" class="text-[9px] text-amber-600 dark:text-amber-300">
            {{ item.displayKind }}
          </span>
        </span>
        <span class="text-slate-500 dark:text-slate-400">{{ formatVariableAddress(item.address) }}</span>
        <span v-if="item.error" class="text-red-500 dark:text-red-400 truncate text-right" :title="item.error">ERR</span>
        <span v-else class="text-slate-500 dark:text-slate-400 text-right" :title="formatVariableValue(item)">{{ formatVariableValue(item) }}</span>
      </div>
    </div>
  </div>
</template>
