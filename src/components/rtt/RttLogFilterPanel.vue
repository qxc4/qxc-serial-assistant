<script setup lang="ts">
import { Search } from 'lucide-vue-next'
import type { RttChannel, RttLogLevel } from '../../types/rtt'

defineProps<{
  searchText: string
  selectedLevels: RttLogLevel[]
  selectedChannels: number[]
  channels: RttChannel[]
  levelOptions: Array<{ value: RttLogLevel; label: string; color: string }>
  levelBgMap: Partial<Record<RttLogLevel, string>>
  t: (key: string) => string
}>()

defineEmits<{
  'update:searchText': [value: string]
  toggleLevel: [value: RttLogLevel]
  toggleChannel: [value: number]
}>()
</script>

<template>
  <div class="p-3 border-b border-slate-200 dark:border-slate-800">
    <div class="relative">
      <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
      <input
        data-testid="rtt-filter-search"
        :value="searchText"
        @input="$emit('update:searchText', ($event.target as HTMLInputElement).value)"
        type="text"
        :placeholder="t('rtt.searchPlaceholder')"
        class="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded pl-8 pr-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  </div>

  <div class="p-3 border-b border-slate-200 dark:border-slate-800">
    <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{{ t('rtt.levelFilter') }}</h3>
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="opt in levelOptions"
        :key="opt.value"
        :data-testid="`rtt-level-${opt.value}`"
        @click="$emit('toggleLevel', opt.value)"
        class="px-2 py-1 rounded text-[10px] font-semibold border transition-all"
        :class="selectedLevels.includes(opt.value)
          ? `${opt.color} ${levelBgMap[opt.value] ?? ''} border-current/30`
          : 'text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:text-slate-600 dark:hover:text-slate-300'"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>

  <div class="p-3 border-b border-slate-200 dark:border-slate-800">
    <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{{ t('rtt.channelFilter') }}</h3>
    <div v-if="channels.length > 0" class="flex flex-wrap gap-1.5">
      <button
        v-for="ch in channels"
        :key="ch.number"
        :data-testid="`rtt-channel-${ch.number}`"
        @click="$emit('toggleChannel', ch.number)"
        class="px-2 py-1 rounded text-[10px] font-semibold border transition-all"
        :class="selectedChannels.includes(ch.number)
          ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800'
          : 'text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:text-slate-600 dark:hover:text-slate-300'"
      >
        Ch{{ ch.number }}
      </button>
    </div>
    <p v-else class="text-[10px] text-slate-400 dark:text-slate-500">{{ t('rtt.noChannels') }}</p>
  </div>
</template>
