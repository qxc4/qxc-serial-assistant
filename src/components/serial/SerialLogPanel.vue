<script setup lang="ts">
import { computed, ref } from 'vue'
import VirtualList from '../VirtualList.vue'
import { createSerialLogRows, createSerialSearchSegments } from '../../features/serial'

export interface SerialLogEntry {
  id: number
  timestamp: number
  data: string
  direction: 'rx' | 'tx'
  rawBytes?: Uint8Array
}

const props = defineProps<{
  items: SerialLogEntry[]
  searchQuery: string
  showTimestamp: boolean
  formatTimestamp: (timestamp: number) => string
}>()

const emit = defineEmits<{
  scroll: [scrollTop: number]
}>()

const virtualListRef = ref<InstanceType<typeof VirtualList> | null>(null)
const displayRows = computed(() => createSerialLogRows(props.items))
const normalizedSearchQuery = computed(() => props.searchQuery.trim())

function scrollToBottom() {
  virtualListRef.value?.scrollToBottom()
}

defineExpose({ scrollToBottom })
</script>

<template>
  <div class="flex-1 font-mono text-sm relative min-h-0">
    <VirtualList
      ref="virtualListRef"
      :items="displayRows"
      :item-height="24"
      :buffer="5"
      key-field="id"
      class="h-full p-4"
      @scroll="emit('scroll', $event)"
    >
      <template #default="{ item }">
        <div class="min-w-0 truncate whitespace-nowrap" style="line-height: 24px;">
          <span v-if="showTimestamp && !item.isContinuation" class="text-slate-500 dark:text-slate-400 mr-2 select-none">
            [{{ formatTimestamp(item.timestamp) }}] {{ item.direction === 'rx' ? 'RX' : 'TX' }}:
          </span>
          <span v-else-if="showTimestamp" class="inline-block w-[15.5rem] shrink-0 select-none"></span>
          <span :class="item.direction === 'rx' ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'">
            <template v-if="normalizedSearchQuery">
              <span
                v-for="(segment, segmentIndex) in createSerialSearchSegments(item.data, normalizedSearchQuery)"
                :key="`${item.id}:match:${segmentIndex}`"
                :class="segment.matched ? 'rounded bg-yellow-200 px-0.5 text-slate-950 dark:bg-yellow-400/80 dark:text-slate-950' : ''"
              >
                {{ segment.text }}
              </span>
            </template>
            <template v-else>{{ item.data }}</template>
          </span>
        </div>
      </template>
    </VirtualList>
  </div>
</template>
