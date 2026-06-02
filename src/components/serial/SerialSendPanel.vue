<script setup lang="ts">
import { computed } from 'vue'
import type { LineEndingConfig } from '../../stores/settings'
import type { LineEndingOption } from '../../features/serial'

const props = defineProps<{
  visible: boolean
  sendInput: string
  isHexSend: boolean
  isConnected: boolean
  lineEndingConfig: LineEndingConfig
  lineEndingOptions: LineEndingOption[]
  lineEndingPreview: string
  sendPreview: string
  t: (key: string) => string
}>()

const emit = defineEmits<{
  'update:sendInput': [value: string]
  'update:isHexSend': [value: boolean]
  send: []
}>()

const localSendInput = computed({
  get: () => props.sendInput,
  set: value => emit('update:sendInput', value),
})

const localIsHexSend = computed({
  get: () => props.isHexSend,
  set: value => emit('update:isHexSend', value),
})
</script>

<template>
  <div v-show="visible" class="h-32 flex flex-col p-4 relative">
    <textarea
      v-model="localSendInput"
      @keyup.ctrl.enter="emit('send')"
      :placeholder="t('serial.sendInputDesc')"
      class="flex-1 w-full resize-none outline-none text-sm font-mono"
    ></textarea>
    <div
      v-if="sendInput && lineEndingConfig.enabled && lineEndingPreview"
      class="absolute top-2 right-4 text-xs text-slate-400 dark:text-slate-500 font-mono truncate max-w-[60%]"
    >
      {{ t('serial.sendPreview') }}: {{ sendPreview }}
    </div>
    <div class="absolute bottom-4 right-4 flex items-center gap-3">
      <div class="flex items-center gap-1.5">
        <label class="flex items-center gap-1 text-xs cursor-pointer text-slate-600 dark:text-slate-400">
          <input type="checkbox" v-model="lineEndingConfig.enabled" class="rounded">
          {{ t('serial.lineEnding') }}
        </label>
        <select
          v-model="lineEndingConfig.type"
          :disabled="!lineEndingConfig.enabled"
          class="text-xs border dark:border-slate-700 rounded px-1.5 py-0.5 bg-white dark:bg-slate-800 outline-none disabled:opacity-50 max-w-[110px]"
        >
          <option v-for="opt in lineEndingOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <input
          v-if="lineEndingConfig.type === 'custom' && lineEndingConfig.enabled"
          v-model="lineEndingConfig.customValue"
          type="text"
          :placeholder="t('serial.lineEndingCustomPlaceholder')"
          class="text-xs border dark:border-slate-700 rounded px-1.5 py-0.5 bg-white dark:bg-slate-800 outline-none w-20 font-mono"
        />
      </div>
      <label class="flex items-center gap-1 text-xs cursor-pointer text-slate-600 dark:text-slate-400">
        <input type="checkbox" v-model="localIsHexSend" class="rounded"> HEX
      </label>
      <button
        @click="emit('send')"
        :disabled="!isConnected"
        class="px-6 py-2 bg-slate-400 hover:bg-slate-500 text-white rounded text-xs font-medium optimize-transition disabled:opacity-50"
      >
        {{ t('serial.send') }}
      </button>
    </div>
  </div>
</template>
