<script setup lang="ts">
import type { RttSidePanelTab, RttSidePanelTabKey } from '../../debug-core/rttSidePanelTabs'

withDefaults(defineProps<{
  visible?: boolean
  tabs: RttSidePanelTab[]
  activeTab: RttSidePanelTabKey
}>(), {
  visible: true,
})

defineEmits<{
  'update:activeTab': [value: RttSidePanelTabKey]
}>()
</script>

<template>
  <aside
    v-if="visible"
    class="apple-inspector w-72 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 flex min-h-0 flex-col overflow-hidden overscroll-contain"
  >
    <div class="grid grid-cols-4 gap-1 border-b border-slate-200 dark:border-slate-800 p-2">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :data-testid="`rtt-side-tab-${tab.key}`"
        @click="$emit('update:activeTab', tab.key)"
        class="rounded-lg px-1 py-1.5 text-[10px] font-medium transition-colors"
        :class="activeTab === tab.key
          ? 'bg-blue-500 text-white shadow-sm'
          : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <slot />
    </div>
  </aside>
</template>
