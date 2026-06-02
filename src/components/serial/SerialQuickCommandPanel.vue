<script setup lang="ts">
import { ref, computed } from 'vue'
import { Loader2, Pause, Play, Plus, Send, Trash } from 'lucide-vue-next'
import SerialSessionReplayPanel from './SerialSessionReplayPanel.vue'
import type {
  ProtocolTemplate,
  QuickCommand,
  SerialReplayEvent,
  SerialReplayMode,
  SerialSessionRecording,
} from '../../features/serial'

const props = defineProps<{
  quickCommands: QuickCommand[]
  enabledQuickCommands: QuickCommand[]
  protocolTemplates: ProtocolTemplate[]
  selectedProtocolTemplateId: string
  selectedProtocolTemplate: ProtocolTemplate | null
  protocolTemplateHint: string
  isConnected: boolean
  hasRunnableQuickCommands: boolean
  isSendingQuickCommands: boolean
  isLooping: boolean
  loopInterval: number
  replayMode: SerialReplayMode
  replaySpeed: number
  isRecordingSession: boolean
  recordedReplayEvents: SerialReplayEvent[]
  loadedSessionRecording: SerialSessionRecording | null
  isReplayingSession: boolean
  replayCursor: number
  replayEventsForMode: SerialReplayEvent[]
  simulatedReplayEvents: SerialReplayEvent[]
  canStartSessionReplay: boolean
  t: (key: string) => string
}>()

const emit = defineEmits<{
  'update:selectedProtocolTemplateId': [value: string]
  'update:loopInterval': [value: number]
  'update:replayMode': [value: SerialReplayMode]
  'update:replaySpeed': [value: number]
  addCommand: []
  sendSelected: []
  toggleLoopSend: []
  applySelectedProtocolTemplate: []
  sendCommand: [command: QuickCommand]
  deleteCommand: [id: number]
  sessionReplayFileSelected: [event: Event]
  startSessionRecording: []
  stopSessionRecording: []
  exportSessionRecording: []
  startSessionReplay: []
  stopSessionReplay: []
}>()

const replayFileInputRef = ref<HTMLInputElement | null>(null)

const selectedTemplateId = computed({
  get: () => props.selectedProtocolTemplateId,
  set: value => emit('update:selectedProtocolTemplateId', value),
})

const localLoopInterval = computed({
  get: () => props.loopInterval,
  set: value => emit('update:loopInterval', Number(value)),
})

const localReplayMode = computed({
  get: () => props.replayMode,
  set: value => emit('update:replayMode', value),
})

const localReplaySpeed = computed({
  get: () => props.replaySpeed,
  set: value => emit('update:replaySpeed', Number(value)),
})

function openReplayFile() {
  replayFileInputRef.value?.click()
}
</script>

<template>
  <div class="flex min-h-0 flex-col flex-1 overflow-hidden">
    <div class="apple-toolbar h-10 border-b dark:border-slate-700 flex items-center justify-between px-3 bg-white/85 dark:bg-slate-800/85">
      <div class="min-w-0">
        <h2 class="font-semibold text-sm text-slate-700 dark:text-slate-300 truncate">{{ t('serial.quickCommands') }}</h2>
        <p class="text-[10px] text-slate-400">
          {{ enabledQuickCommands.length }} / {{ quickCommands.length }} 可执行
        </p>
      </div>
      <div class="flex items-center gap-1 text-slate-500">
        <button data-testid="quick-add-command" @click="emit('addCommand')" class="p-1.5 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" :title="t('serial.addCommand')">
          <Plus class="w-4 h-4"/>
        </button>
        <button
          @click="emit('sendSelected')"
          :disabled="!isConnected || !hasRunnableQuickCommands || isSendingQuickCommands"
          class="p-1.5 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded disabled:opacity-50"
          :title="t('serial.executeAll')"
        >
          <Loader2 v-if="isSendingQuickCommands" class="w-4 h-4 animate-spin"/>
          <Play v-else class="w-4 h-4"/>
        </button>
      </div>
    </div>

    <div class="px-3 py-2 flex items-center gap-2 border-b dark:border-slate-700 bg-white/70 dark:bg-slate-800/70">
      <button
        @click="emit('toggleLoopSend')"
        :disabled="!isConnected || !hasRunnableQuickCommands"
        class="flex-1 py-1.5 rounded text-xs flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
        :class="isLooping ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-slate-400 text-white hover:bg-slate-500'"
      >
        <component :is="isLooping ? Pause : Play" class="w-3 h-3"/>
        {{ isLooping ? t('serial.stopLoop') : t('serial.loopSend') }}
      </button>
      <div class="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
        <span>{{ t('serial.interval') }}</span>
        <input type="number" v-model="localLoopInterval" class="w-14 border dark:border-slate-700 rounded px-1 py-1 text-center outline-none">
        <span>ms</span>
      </div>
    </div>

    <div class="border-b border-slate-200 bg-white/80 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/80">
      <div class="mb-1.5 flex items-center justify-between gap-2">
        <div class="min-w-0">
          <h3 class="truncate text-xs font-medium text-slate-600 dark:text-slate-300">协议模板库</h3>
          <p class="truncate text-[10px] text-slate-400">生成快捷命令和解析建议</p>
        </div>
        <button
          @click="emit('applySelectedProtocolTemplate')"
          class="shrink-0 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300"
        >
          应用
        </button>
      </div>
      <select
        v-model="selectedTemplateId"
        class="mb-1.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
      >
        <option v-for="template in protocolTemplates" :key="template.id" :value="template.id">
          {{ template.name }}
        </option>
      </select>
      <p class="line-clamp-2 text-[10px] text-slate-500 dark:text-slate-400">
        {{ selectedProtocolTemplate?.description }}
      </p>
      <p v-if="protocolTemplateHint" class="mt-1 line-clamp-2 text-[10px] text-blue-600 dark:text-blue-300">
        {{ protocolTemplateHint }}
      </p>
    </div>

    <input
      ref="replayFileInputRef"
      type="file"
      accept=".json,.qxc-session.json,application/json"
      class="hidden"
      @change="emit('sessionReplayFileSelected', $event)"
    />
    <SerialSessionReplayPanel
      v-model:replay-mode="localReplayMode"
      v-model:replay-speed="localReplaySpeed"
      :is-recording-session="isRecordingSession"
      :recorded-replay-events="recordedReplayEvents"
      :loaded-session-recording="loadedSessionRecording"
      :is-replaying-session="isReplayingSession"
      :replay-cursor="replayCursor"
      :replay-events-for-mode="replayEventsForMode"
      :simulated-replay-events="simulatedReplayEvents"
      :can-start-session-replay="canStartSessionReplay"
      @start-session-recording="emit('startSessionRecording')"
      @stop-session-recording="emit('stopSessionRecording')"
      @export-session-recording="emit('exportSessionRecording')"
      @open-session-replay-file="openReplayFile"
      @start-session-replay="emit('startSessionReplay')"
      @stop-session-replay="emit('stopSessionReplay')"
    />

    <div class="flex-1 min-h-0 overflow-y-auto p-2">
      <div class="flex items-center px-2 py-1 text-[10px] text-slate-500 mb-1 sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
        <div class="w-7 text-center">{{ t('serial.quickCmdEnable') }}</div>
        <div class="flex-1">{{ t('serial.quickCmdContent') }}</div>
        <div class="w-9 text-center">HEX</div>
        <div class="w-14 text-center">{{ t('serial.quickCmdDelay') }}</div>
        <div class="w-16 text-center">{{ t('serial.quickCmdAction') }}</div>
      </div>
      <div v-for="cmd in quickCommands" :key="cmd.id"
        class="flex items-center gap-1.5 px-2 py-1.5 mb-1 bg-white dark:bg-slate-800 rounded border dark:border-slate-700 shadow-sm group text-xs">
        <div class="w-7 flex justify-center">
          <input type="checkbox" v-model="cmd.enabled" class="rounded w-3.5 h-3.5 cursor-pointer">
        </div>
        <div class="flex-1 flex flex-col gap-0.5 min-w-0">
          <input type="text" v-model="cmd.content" :placeholder="t('serial.quickCmdContentPlaceholder')" class="w-full text-xs font-mono bg-transparent border-b border-transparent focus:border-blue-300 outline-none truncate">
          <input type="text" v-model="cmd.description" :placeholder="t('serial.quickCmdNotePlaceholder')" class="w-full text-[9px] text-slate-400 bg-transparent outline-none truncate">
        </div>
        <div class="w-9 flex justify-center">
          <input type="checkbox" v-model="cmd.isHex" class="rounded w-3 h-3 cursor-pointer">
        </div>
        <div class="w-14">
          <input type="number" v-model="cmd.delay" class="w-full text-[10px] text-center border dark:border-slate-700 rounded py-0.5 outline-none focus:border-blue-300 bg-transparent">
        </div>
        <div class="w-16 flex justify-center gap-0.5">
          <button @click="emit('sendCommand', cmd)" :disabled="!isConnected || !cmd.content.trim()" class="p-1 text-slate-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded disabled:opacity-50" :title="t('serial.quickCmdSend')">
            <Send class="w-3.5 h-3.5"/>
          </button>
          <button @click="emit('deleteCommand', cmd.id)" class="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" :title="t('serial.delete')">
            <Trash class="w-3.5 h-3.5"/>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
