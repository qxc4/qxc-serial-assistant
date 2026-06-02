<script setup lang="ts">
import type { SerialSessionDescriptor } from '../../features/serial'
import { Plus, X } from 'lucide-vue-next'

defineProps<{
  sessions: SerialSessionDescriptor[]
  activeSessionId: string
  maxSessions: number
  isConnected: boolean
}>()

const emit = defineEmits<{
  addSession: []
  removeSession: [id: string]
  setActiveSession: [id: string]
}>()
</script>

<template>
  <div class="flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white/80 px-1.5 py-1 dark:border-slate-700 dark:bg-slate-800/80">
    <button
      v-for="session in sessions"
      :key="session.id"
      @click="emit('setActiveSession', session.id)"
      class="group flex min-w-[118px] max-w-[170px] items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[10px] transition-colors"
      :class="session.id === activeSessionId
        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
        : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'"
      :title="`${session.name} · ${session.connectionLabel}`"
    >
      <span
        class="h-1.5 w-1.5 shrink-0 rounded-full"
        :class="session.isDefault && isConnected ? 'bg-green-400' : 'bg-slate-300 dark:bg-slate-600'"
      />
      <span class="min-w-0 flex-1">
        <span class="block truncate font-medium">{{ session.name }}</span>
        <span class="block truncate opacity-70">TX {{ session.stats.txBytes }} / RX {{ session.stats.rxBytes }}</span>
      </span>
      <button
        v-if="!session.isDefault"
        @click.stop="emit('removeSession', session.id)"
        class="shrink-0 rounded p-0.5 opacity-60 hover:bg-white/20 hover:opacity-100"
        title="移除会话"
      >
        <X class="h-3 w-3" />
      </button>
    </button>
    <button
      @click="emit('addSession')"
      :disabled="sessions.length >= maxSessions"
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-slate-700 dark:hover:text-slate-200"
      title="新增串口会话槽"
    >
      <Plus class="h-3.5 w-3.5" />
    </button>
  </div>
</template>
