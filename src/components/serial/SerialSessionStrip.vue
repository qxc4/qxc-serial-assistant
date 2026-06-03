<script setup lang="ts">
import type { SerialSessionDescriptor } from '../../features/serial'
import { Plus, X } from 'lucide-vue-next'

const props = defineProps<{
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

function isSessionConnected(session: SerialSessionDescriptor): boolean {
  return (session.isDefault && props.isConnected) || (!session.isDefault && session.connectionLabel !== '未连接')
}

function sessionStateLabel(session: SerialSessionDescriptor): string {
  return isSessionConnected(session) ? '已连接' : '未连接'
}
</script>

<template>
  <div class="flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white/80 px-1.5 py-1 dark:border-slate-700 dark:bg-slate-800/80">
    <button
      v-for="session in sessions"
      :key="session.id"
      :data-testid="`serial-session-${session.id}`"
      @click="emit('setActiveSession', session.id)"
      class="group flex min-w-[142px] max-w-[210px] items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[10px] transition-colors"
      :class="session.id === activeSessionId
        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
        : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'"
      :title="`${session.name} · ${session.connectionLabel} · TX ${session.stats.txBytes} / RX ${session.stats.rxBytes} / 日志 ${session.stats.events}`"
    >
      <span
        class="h-1.5 w-1.5 shrink-0 rounded-full"
        :class="isSessionConnected(session) ? 'bg-green-400' : 'bg-slate-300 dark:bg-slate-600'"
      />
      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-1">
          <span class="min-w-0 truncate font-medium">{{ session.name }}</span>
          <span class="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] opacity-80" :class="isSessionConnected(session) ? 'bg-emerald-500/15' : 'bg-slate-500/15'">
            {{ sessionStateLabel(session) }}
          </span>
        </span>
        <span class="block truncate opacity-70">TX {{ session.stats.txBytes }} / RX {{ session.stats.rxBytes }} / 日志 {{ session.stats.events }}</span>
      </span>
      <button
        v-if="!session.isDefault"
        :data-testid="`serial-session-remove-${session.id}`"
        @click.stop="emit('removeSession', session.id)"
        class="shrink-0 rounded p-0.5 opacity-60 hover:bg-white/20 hover:opacity-100"
        title="移除会话"
      >
        <X class="h-3 w-3" />
      </button>
    </button>
    <button
      data-testid="serial-session-add"
      @click="emit('addSession')"
      :disabled="sessions.length >= maxSessions"
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-slate-700 dark:hover:text-slate-200"
      title="新增串口会话"
    >
      <Plus class="h-3.5 w-3.5" />
    </button>
  </div>
</template>
