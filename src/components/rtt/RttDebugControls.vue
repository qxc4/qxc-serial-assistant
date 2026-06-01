<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { RefreshCw } from 'lucide-vue-next'

type DebugControlState = 'idle' | 'running' | 'halted' | 'reset' | 'error'
type DebugAction = 'halt' | 'resume' | 'step' | 'reset'

interface CoreRegisterItem {
  name: string
  value: number
  isKey: boolean
}

const props = defineProps<{
  isConnected: boolean
  debugControlState: DebugControlState
  debugControlError: string
  breakpointInput: string
  hardwareBreakpoints: number[]
  breakpointRestoreStatus: string
  coreRegisterItems: CoreRegisterItem[]
  memoryViewAddressInput: string
  memoryViewLengthInput: number
  memoryViewHexLines: string[]
  memoryViewError: string
  pcFocusRequestId: number
  formatHexAddress: (value: number) => string
}>()

const emit = defineEmits<{
  'update:breakpointInput': [value: string]
  'update:memoryViewAddressInput': [value: string]
  'update:memoryViewLengthInput': [value: number]
  refreshCoreRegisters: []
  debugAction: [action: DebugAction]
  addHardwareBreakpoint: []
  removeHardwareBreakpoint: [address: number]
  clearAllHardwareBreakpoints: []
  readMemoryPreview: []
}>()

const registerPanelRef = ref<HTMLElement | null>(null)

async function readMemoryAtRegister(name: 'PC' | 'SP'): Promise<void> {
  const register = props.coreRegisterItems.find(item => item.name === name)
  if (!register) return
  emit('update:memoryViewAddressInput', props.formatHexAddress(register.value))
  await nextTick()
  emit('readMemoryPreview')
}

watch(() => props.pcFocusRequestId, async () => {
  await nextTick()
  registerPanelRef.value
    ?.querySelector<HTMLElement>('[data-reg-name="PC"]')
    ?.scrollIntoView({ block: 'nearest' })
})
</script>

<template>
  <div class="p-3 border-b border-slate-200 dark:border-slate-800">
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400">调试控制</h3>
      <button
        @click="emit('refreshCoreRegisters')"
        :disabled="!isConnected"
        class="p-1 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
        title="刷新寄存器"
      >
        <RefreshCw class="w-3 h-3" />
      </button>
    </div>

    <div class="grid grid-cols-4 gap-1.5 mb-2">
      <button
        v-for="action in ['halt', 'resume', 'step', 'reset'] as const"
        :key="action"
        @click="emit('debugAction', action)"
        :disabled="!isConnected"
        class="px-2 py-1 rounded text-[10px] border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
      >
        {{ action }}
      </button>
    </div>

    <div class="text-[10px] text-slate-500 dark:text-slate-400 mb-2">
      状态: {{ debugControlState }}
    </div>

    <div class="flex items-center gap-1.5 mb-2">
      <input
        :value="breakpointInput"
        @input="emit('update:breakpointInput', ($event.target as HTMLInputElement).value)"
        type="text"
        placeholder="断点地址(0x...)"
        class="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-[10px] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        @click="emit('addHardwareBreakpoint')"
        :disabled="!isConnected"
        class="px-2 py-1 rounded text-[10px] border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
      >
        加断点
      </button>
    </div>

    <div v-if="hardwareBreakpoints.length > 0" class="space-y-1 mb-2 max-h-20 overflow-auto pr-1">
      <div
        v-for="address in hardwareBreakpoints"
        :key="`bp-${address}`"
        class="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400"
      >
        <span>{{ formatHexAddress(address) }}</span>
        <button
          @click="emit('removeHardwareBreakpoint', address)"
          class="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
        >
          删除
        </button>
      </div>
    </div>

    <div class="flex items-center justify-between mb-2">
      <div v-if="breakpointRestoreStatus" class="text-[10px] text-slate-500 dark:text-slate-400">
        {{ breakpointRestoreStatus }}
      </div>
      <button
        @click="emit('clearAllHardwareBreakpoints')"
        :disabled="hardwareBreakpoints.length === 0"
        class="px-2 py-1 rounded text-[10px] border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
      >
        清空断点
      </button>
    </div>

    <div
      ref="registerPanelRef"
      class="grid grid-cols-2 gap-1 text-[10px] text-slate-500 dark:text-slate-400 max-h-36 overflow-auto pr-1"
    >
      <div
        v-for="item in coreRegisterItems"
        :key="item.name"
        :data-reg-name="item.name"
        class="flex items-center justify-between rounded px-1.5 py-1"
        :class="item.isKey
          ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
          : 'bg-slate-50 dark:bg-slate-800/50'"
      >
        <span class="text-slate-400 dark:text-slate-500">{{ item.name }}</span>
        <span class="font-mono text-slate-600 dark:text-slate-300">{{ formatHexAddress(item.value) }}</span>
      </div>
    </div>

    <div class="mt-2 border-t border-slate-200 dark:border-slate-700 pt-2">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-[10px] text-slate-500 dark:text-slate-400">内存查看</span>
        <div class="flex items-center gap-1">
          <button
            @click="readMemoryAtRegister('PC')"
            :disabled="!isConnected"
            class="px-1.5 py-1 rounded text-[10px] border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            PC
          </button>
          <button
            @click="readMemoryAtRegister('SP')"
            :disabled="!isConnected"
            class="px-1.5 py-1 rounded text-[10px] border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            SP
          </button>
          <button
            @click="emit('readMemoryPreview')"
            :disabled="!isConnected"
            class="px-2 py-1 rounded text-[10px] border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            读取
          </button>
        </div>
      </div>
      <div class="grid grid-cols-[1fr_auto] gap-1.5 mb-1.5">
        <input
          :value="memoryViewAddressInput"
          @input="emit('update:memoryViewAddressInput', ($event.target as HTMLInputElement).value)"
          type="text"
          placeholder="地址(0x...)"
          class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-[10px] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          :value="memoryViewLengthInput"
          @input="emit('update:memoryViewLengthInput', Number(($event.target as HTMLInputElement).value))"
          type="number"
          min="16"
          max="512"
          step="16"
          class="w-20 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-[10px] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div v-if="memoryViewHexLines.length > 0" class="max-h-28 overflow-auto rounded bg-slate-50 dark:bg-slate-800/50 p-1.5 font-mono text-[10px] text-slate-600 dark:text-slate-300 space-y-0.5">
        <div v-for="line in memoryViewHexLines" :key="line">{{ line }}</div>
      </div>
      <div v-if="memoryViewError" class="text-[10px] text-red-600 dark:text-red-400 mt-1">
        {{ memoryViewError }}
      </div>
    </div>

    <div v-if="debugControlError" class="text-[10px] text-red-600 dark:text-red-400 mt-2">
      {{ debugControlError }}
    </div>
  </div>
</template>
