<script setup lang="ts">
import { ref } from 'vue'
import VirtualList from '../VirtualList.vue'

export interface SerialLogEntry {
  id: number
  timestamp: number
  data: string
  direction: 'rx' | 'tx'
  rawBytes?: Uint8Array
}

defineProps<{
  items: SerialLogEntry[]
  showTimestamp: boolean
  formatTimestamp: (timestamp: number) => string
}>()

const emit = defineEmits<{
  scroll: [scrollTop: number]
}>()

const virtualListRef = ref<InstanceType<typeof VirtualList> | null>(null)

function scrollToBottom() {
  virtualListRef.value?.scrollToBottom()
}

defineExpose({ scrollToBottom })
</script>

<template>
  <div class="flex-1 font-mono text-sm relative min-h-0">
    <VirtualList
      ref="virtualListRef"
      :items="items"
      :item-height="24"
      :buffer="5"
      key-field="id"
      class="h-full p-4"
      @scroll="emit('scroll', $event)"
    >
      <template #default="{ item }">
        <div class="mb-1 whitespace-pre-wrap break-all" style="line-height: 24px;">
          <span v-if="showTimestamp" class="text-slate-500 dark:text-slate-400 mr-2 select-none">
            [{{ formatTimestamp(item.timestamp) }}] {{ item.direction === 'rx' ? 'RX' : 'TX' }}:
          </span>
          <span :class="item.direction === 'rx' ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'">
            {{ item.data }}
          </span>
        </div>
      </template>
    </VirtualList>
  </div>
</template>
