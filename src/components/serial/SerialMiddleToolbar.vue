<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight, Columns, Copy, Download, Mic, Send, Trash2 } from 'lucide-vue-next'

type DisplayMode = 'rx' | 'tx' | 'mixed'
type EncodingMode = 'utf8' | 'ascii' | 'gbk' | 'hex'

const props = defineProps<{
  displayMode: DisplayMode
  receiveEncoding: EncodingMode
  sendEncoding: EncodingMode
  showTimestamp: boolean
  autoScroll: boolean
  dataCount: number
  toolbarExpanded: {
    display: boolean
    encoding: boolean
    options: boolean
  }
  t: (key: string) => string
}>()

const emit = defineEmits<{
  'update:displayMode': [value: DisplayMode]
  'update:receiveEncoding': [value: EncodingMode]
  'update:sendEncoding': [value: EncodingMode]
  'update:showTimestamp': [value: boolean]
  'update:autoScroll': [value: boolean]
  copyData: []
  exportData: []
  clearData: []
  clearTx: []
}>()

const localDisplayMode = computed({
  get: () => props.displayMode,
  set: value => emit('update:displayMode', value),
})

const localReceiveEncoding = computed({
  get: () => props.receiveEncoding,
  set: value => emit('update:receiveEncoding', value),
})

const localSendEncoding = computed({
  get: () => props.sendEncoding,
  set: value => emit('update:sendEncoding', value),
})

const localShowTimestamp = computed({
  get: () => props.showTimestamp,
  set: value => emit('update:showTimestamp', value),
})

const localAutoScroll = computed({
  get: () => props.autoScroll,
  set: value => emit('update:autoScroll', value),
})
</script>

<template>
  <div class="px-3 py-1.5 flex items-center gap-2 flex-wrap border-t dark:border-slate-700 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-900 shrink-0">
    <div class="flex items-center gap-1">
      <button
        class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
        @click="toolbarExpanded.display = !toolbarExpanded.display"
        title="显示模式"
      >
        <ChevronRight class="w-3 h-3 transition-transform" :class="toolbarExpanded.display ? 'rotate-90' : ''"/>
      </button>
      <Transition name="slide">
        <div v-show="toolbarExpanded.display" class="flex gap-1">
          <button
            class="px-3 py-1.5 rounded border dark:border-slate-700 text-xs flex items-center gap-1 transition-colors"
            :class="localDisplayMode === 'rx' ? 'border-blue-300 text-blue-600 bg-blue-50' : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:bg-slate-700'"
            @click="localDisplayMode = 'rx'"
            title="仅显示接收"
          >
            <Mic class="w-3 h-3"/> RX
          </button>
          <button
            class="px-3 py-1.5 rounded border dark:border-slate-700 text-xs flex items-center gap-1 transition-colors"
            :class="localDisplayMode === 'tx' ? 'border-blue-300 text-blue-600 bg-blue-50' : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:bg-slate-700'"
            @click="localDisplayMode = 'tx'"
            title="仅显示发送"
          >
            <Send class="w-3 h-3"/> TX
          </button>
          <button
            class="px-3 py-1.5 rounded border dark:border-slate-700 text-xs flex items-center gap-1 transition-colors"
            :class="localDisplayMode === 'mixed' ? 'border-blue-300 text-blue-600 bg-blue-50' : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:bg-slate-700'"
            @click="localDisplayMode = 'mixed'"
            :title="t('serial.mixedDisplay')"
          >
            <Columns class="w-3 h-3"/> {{ t('serial.modeMixed') }}
          </button>
        </div>
      </Transition>
    </div>

    <div class="w-px h-6 bg-slate-300 dark:bg-slate-600"></div>

    <div class="flex items-center gap-1">
      <button
        class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
        @click="toolbarExpanded.encoding = !toolbarExpanded.encoding"
        :title="t('serial.encodingSettings')"
      >
        <ChevronRight class="w-3 h-3 transition-transform" :class="toolbarExpanded.encoding ? 'rotate-90' : ''"/>
      </button>
      <Transition name="slide">
        <div v-show="toolbarExpanded.encoding" class="flex gap-1">
          <select
            v-model="localReceiveEncoding"
            class="border dark:border-slate-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-slate-800 outline-none"
            :title="t('serial.rxEncodingFormat')"
          >
            <option value="utf8">{{ t('serial.rxUtf8') }}</option>
            <option value="ascii">{{ t('serial.rxAscii') }}</option>
            <option value="gbk">{{ t('serial.rxGbk') }}</option>
            <option value="hex">{{ t('serial.rxHex') }}</option>
          </select>
          <select
            v-model="localSendEncoding"
            class="border dark:border-slate-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-slate-800 outline-none"
            :title="t('serial.txEncodingFormat')"
          >
            <option value="utf8">{{ t('serial.txUtf8') }}</option>
            <option value="ascii">{{ t('serial.txAscii') }}</option>
            <option value="gbk">{{ t('serial.txGbk') }}</option>
            <option value="hex">{{ t('serial.txHex') }}</option>
          </select>
        </div>
      </Transition>
    </div>

    <div class="w-px h-6 bg-slate-300 dark:bg-slate-600"></div>

    <div class="flex items-center gap-1">
      <button
        class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
        @click="toolbarExpanded.options = !toolbarExpanded.options"
        :title="t('serial.displayOptions')"
      >
        <ChevronRight class="w-3 h-3 transition-transform" :class="toolbarExpanded.options ? 'rotate-90' : ''"/>
      </button>
      <Transition name="slide">
        <div v-show="toolbarExpanded.options" class="flex gap-1 items-center">
          <span class="text-[10px] text-slate-500 dark:text-slate-400 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">
            {{ dataCount.toLocaleString() }} {{ t('serial.entries') }}
          </span>
          <button
            class="px-3 py-1.5 rounded border dark:border-slate-700 text-xs flex items-center gap-1 transition-colors"
            :class="localShowTimestamp ? 'border-blue-300 text-blue-600 bg-blue-50' : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:bg-slate-700'"
            @click="localShowTimestamp = !localShowTimestamp"
          >
            {{ t('serial.timestamp') }}
          </button>
          <button
            class="px-3 py-1.5 rounded text-xs flex items-center gap-1 transition-colors"
            :class="localAutoScroll ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 border dark:border-slate-700 hover:bg-slate-100 dark:bg-slate-700'"
            @click="localAutoScroll = !localAutoScroll"
          >
            {{ t('serial.autoScroll') }}
          </button>
          <button class="px-3 py-1.5 rounded border dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:bg-slate-700 text-xs flex items-center gap-1" @click="emit('exportData')">
            <Download class="w-3 h-3" /> {{ t('serial.exportLog') }}
          </button>
          <button
            data-testid="serial-copy-log"
            class="px-3 py-1.5 rounded border dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:bg-slate-700 text-xs flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="dataCount === 0"
            :title="t('serial.copyLog')"
            @click="emit('copyData')"
          >
            <Copy class="w-3 h-3" /> {{ t('serial.copyLog') }}
          </button>
        </div>
      </Transition>
    </div>

    <div class="w-px h-6 bg-slate-300 dark:bg-slate-600"></div>

    <div class="flex gap-1.5 ml-auto">
      <button class="px-2.5 py-1.5 rounded bg-slate-800 text-white text-xs flex items-center gap-1 hover:bg-slate-700 transition-colors" @click="emit('clearData')">
        <Trash2 class="w-3 h-3" /> {{ t('serial.clearRx') }}
      </button>
      <button class="px-2.5 py-1.5 rounded bg-slate-800 text-white text-xs flex items-center gap-1 hover:bg-slate-700 transition-colors" @click="emit('clearTx')">
        <Trash2 class="w-3 h-3" /> {{ t('serial.clearTx') }}
      </button>
    </div>
  </div>
</template>
