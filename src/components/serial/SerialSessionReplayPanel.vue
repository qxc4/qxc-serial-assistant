<script setup lang="ts">
import type { SerialReplayEvent, SerialReplayMode, SerialSessionRecording } from '../../features/serial'

defineProps<{
  isRecordingSession: boolean
  recordedReplayEvents: SerialReplayEvent[]
  loadedSessionRecording: SerialSessionRecording | null
  replayMode: SerialReplayMode
  replaySpeed: number
  isReplayingSession: boolean
  replayCursor: number
  replayEventsForMode: SerialReplayEvent[]
  simulatedReplayEvents: SerialReplayEvent[]
  canStartSessionReplay: boolean
}>()

const emit = defineEmits<{
  startSessionRecording: []
  stopSessionRecording: []
  exportSessionRecording: []
  openSessionReplayFile: []
  startSessionReplay: []
  stopSessionReplay: []
  'update:replayMode': [value: SerialReplayMode]
  'update:replaySpeed': [value: number]
}>()
</script>

<template>
  <div class="border-b border-slate-200 bg-white/80 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/80">
    <div class="mb-1.5 flex items-center justify-between gap-2">
      <div class="min-w-0">
        <h3 class="truncate text-xs font-medium text-slate-600 dark:text-slate-300">会话录制与回放</h3>
        <p class="truncate text-[10px] text-slate-400">
          {{ recordedReplayEvents.length }} 条录制 / {{ loadedSessionRecording?.events.length ?? 0 }} 条已导入
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <button
          v-if="!isRecordingSession"
          @click="emit('startSessionRecording')"
          class="rounded border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
        >
          录制
        </button>
        <button
          v-else
          @click="emit('stopSessionRecording')"
          class="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
        >
          停止
        </button>
        <button
          @click="emit('exportSessionRecording')"
          :disabled="recordedReplayEvents.length === 0"
          class="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
        >
          导出
        </button>
        <button
          @click="emit('openSessionReplayFile')"
          class="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300"
        >
          导入
        </button>
      </div>
    </div>
    <div class="grid grid-cols-[1fr_72px] gap-1.5">
      <select
        :value="replayMode"
        @change="emit('update:replayMode', ($event.target as HTMLSelectElement).value as SerialReplayMode)"
        class="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
      >
        <option value="tx-only">只回放 TX 到串口</option>
        <option value="simulate-rx">模拟 RX/TX 日志</option>
      </select>
      <select
        :value="replaySpeed"
        @change="emit('update:replaySpeed', Number(($event.target as HTMLSelectElement).value))"
        class="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
      >
        <option :value="0.5">0.5x</option>
        <option :value="1">1x</option>
        <option :value="2">2x</option>
        <option :value="4">4x</option>
      </select>
    </div>
    <div class="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
      <span class="truncate">
        {{ loadedSessionRecording?.name ?? '未导入会话' }}
        <template v-if="isReplayingSession"> · {{ replayCursor }} / {{ replayEventsForMode.length }}</template>
      </span>
      <button
        v-if="!isReplayingSession"
        @click="emit('startSessionReplay')"
        :disabled="!canStartSessionReplay"
        class="shrink-0 rounded border border-green-200 bg-green-50 px-2 py-1 font-medium text-green-700 hover:bg-green-100 disabled:opacity-50 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300"
      >
        回放
      </button>
      <button
        v-else
        @click="emit('stopSessionReplay')"
        class="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
      >
        停止回放
      </button>
    </div>
    <div v-if="simulatedReplayEvents.length" class="mt-1.5 max-h-14 overflow-y-auto rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] dark:border-slate-700 dark:bg-slate-900">
      <div v-for="event in simulatedReplayEvents" :key="event.id" class="flex items-center gap-1 font-mono">
        <span :class="event.direction === 'rx' ? 'text-green-600 dark:text-green-300' : 'text-blue-600 dark:text-blue-300'">{{ event.direction.toUpperCase() }}</span>
        <span class="truncate text-slate-500 dark:text-slate-400">{{ event.hex || event.data }}</span>
      </div>
    </div>
  </div>
</template>
