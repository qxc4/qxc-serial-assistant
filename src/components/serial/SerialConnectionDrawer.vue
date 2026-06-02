<script setup lang="ts">
import { computed } from 'vue'
import { Bluetooth, FileCode, Usb, XCircle } from 'lucide-vue-next'
import type { CustomProtocolConfig, ParseMode } from '../../stores/settings'

type ActiveTab = 'serial' | 'bluetooth'
type Parity = 'none' | 'even' | 'odd'

const props = defineProps<{
  visible: boolean
  activeTab: ActiveTab
  isSupported: boolean
  isConnected: boolean
  canReconnect: boolean
  baudRate: number
  dataBits: number
  stopBits: number
  parity: Parity
  baudRatePresets: number[]
  isCustomBaudRate: boolean
  customBaudRateInput: string
  parseEnabled: boolean
  parseMode: ParseMode
  customProtocolConfig: CustomProtocolConfig
  lengthFieldEnabled: boolean
  parseResultCount: number
  showParsePanel: boolean
  t: (key: string) => string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'update:activeTab': [value: ActiveTab]
  'update:baudRate': [value: number]
  'update:dataBits': [value: number]
  'update:stopBits': [value: number]
  'update:parity': [value: Parity]
  'update:isCustomBaudRate': [value: boolean]
  'update:customBaudRateInput': [value: string]
  'update:parseEnabled': [value: boolean]
  'update:parseMode': [value: ParseMode]
  'update:lengthFieldEnabled': [value: boolean]
  'update:showParsePanel': [value: boolean]
  connect: []
  disconnect: []
  reconnect: []
  bluetoothComingSoon: []
}>()

const localActiveTab = computed({
  get: () => props.activeTab,
  set: value => emit('update:activeTab', value),
})
const localBaudRate = computed({
  get: () => props.baudRate,
  set: value => emit('update:baudRate', Number(value)),
})
const localDataBits = computed({
  get: () => props.dataBits,
  set: value => emit('update:dataBits', Number(value)),
})
const localStopBits = computed({
  get: () => props.stopBits,
  set: value => emit('update:stopBits', Number(value)),
})
const localParity = computed({
  get: () => props.parity,
  set: value => emit('update:parity', value),
})
const localParseEnabled = computed({
  get: () => props.parseEnabled,
  set: value => emit('update:parseEnabled', value),
})
const localParseMode = computed({
  get: () => props.parseMode,
  set: value => emit('update:parseMode', value),
})
const localLengthFieldEnabled = computed({
  get: () => props.lengthFieldEnabled,
  set: value => emit('update:lengthFieldEnabled', value),
})

function updateCustomBaudRate(value: string) {
  emit('update:customBaudRateInput', value)
  const parsed = Number(value)
  if (Number.isInteger(parsed) && parsed > 0) {
    emit('update:baudRate', parsed)
  }
}
</script>

<template>
  <Transition name="serial-drawer">
    <div v-if="visible" class="apple-sidebar absolute inset-y-0 left-0 z-30 w-80 max-w-[calc(100vw-1rem)] shrink-0 bg-white/95 dark:bg-slate-800/95 border-r border-slate-200 dark:border-slate-700 shadow-2xl backdrop-blur flex min-h-0 flex-col">
      <div class="flex h-12 border-b dark:border-slate-700 text-center">
        <div
          class="flex-1 cursor-pointer flex justify-center items-center gap-2 border-b-2 transition-colors"
          :class="localActiveTab === 'serial' ? 'border-blue-600 font-semibold text-blue-600' : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900'"
          @click="localActiveTab = 'serial'"
        >
          <Usb class="w-4 h-4" /> {{ t('serial.serialTab') }}
        </div>
        <div
          data-testid="serial-drawer-bluetooth"
          class="flex-1 cursor-pointer flex justify-center items-center gap-2 text-slate-400 hover:bg-slate-50 dark:bg-slate-900 border-b-2 border-transparent"
          @click="emit('bluetoothComingSoon')"
        >
          <Bluetooth class="w-4 h-4" /> {{ t('serial.bluetoothTab') }}
        </div>
        <button
          data-testid="serial-drawer-close"
          @click="emit('update:visible', false)"
          class="w-11 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          title="关闭连接抽屉"
        >
          <XCircle class="w-4 h-4" />
        </button>
      </div>

      <div class="p-4 flex min-h-0 flex-col gap-4 overflow-y-auto">
        <div>
          <h2 class="font-bold text-base mb-1">{{ t('serial.serialSettings') }}</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">{{ t('serial.serialSettingsDesc') }}</p>
        </div>

        <div v-if="!isSupported" class="text-xs text-red-600 bg-red-50 p-2 rounded">
          {{ t('serial.notSupported') }}
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('settings.baudRate') }}</label>
          <div v-if="!isCustomBaudRate" class="flex gap-1">
            <select
              v-model.number="localBaudRate"
              :disabled="isConnected"
              class="flex-1 border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm"
            >
              <option v-for="rate in baudRatePresets" :key="rate" :value="rate">{{ rate }}</option>
            </select>
            <button
              @click="emit('update:isCustomBaudRate', true)"
              :disabled="isConnected"
              class="px-3 py-2 border dark:border-slate-700 rounded bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-50"
              :title="t('serial.customBaud')"
            >
              {{ t('serial.customBaud') }}
            </button>
          </div>
          <div v-else class="flex gap-1">
            <input
              type="number"
              :value="customBaudRateInput"
              :disabled="isConnected"
              @input="updateCustomBaudRate(($event.target as HTMLInputElement).value)"
              min="1"
              :placeholder="t('serial.customBaud')"
              class="flex-1 border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm"
            />
            <button
              @click="emit('update:isCustomBaudRate', false)"
              :disabled="isConnected"
              class="px-3 py-2 border dark:border-slate-700 rounded bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs transition-colors disabled:opacity-50"
            >
              {{ t('serial.apply') }}
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('settings.dataBits') }}</label>
          <select v-model.number="localDataBits" :disabled="isConnected" class="border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-blue-500">
            <option :value="8">8</option>
            <option :value="7">7</option>
          </select>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('settings.parity') }}</label>
          <select v-model="localParity" :disabled="isConnected" class="border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-blue-500">
            <option value="none">{{ t('settings.none') }}</option>
            <option value="even">{{ t('settings.even') }}</option>
            <option value="odd">{{ t('settings.odd') }}</option>
          </select>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('settings.stopBits') }}</label>
          <select v-model.number="localStopBits" :disabled="isConnected" class="border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-blue-500">
            <option :value="1">1</option>
            <option :value="2">2</option>
          </select>
        </div>

        <button
          v-if="isConnected"
          @click="emit('disconnect')"
          :disabled="!isSupported"
          class="mt-4 py-3 rounded-md text-white font-medium transition-colors w-full bg-red-500 hover:bg-red-600"
        >
          {{ t('serial.disconnect') }}
        </button>
        <div v-else-if="canReconnect" class="mt-4 flex gap-2 w-full">
          <button
            @click="emit('reconnect')"
            :disabled="!isSupported"
            class="flex-1 py-3 rounded-md text-white font-medium transition-colors bg-green-500 hover:bg-green-600 disabled:opacity-50"
          >
            {{ t('serial.enablePort') }}
          </button>
          <button
            @click="emit('connect')"
            :disabled="!isSupported"
            class="flex-1 py-3 rounded-md text-white font-medium transition-colors bg-slate-900 hover:bg-slate-800 disabled:opacity-50"
          >
            {{ t('serial.changePort') }}
          </button>
        </div>
        <button
          v-else
          @click="emit('connect')"
          :disabled="!isSupported"
          class="mt-4 py-3 rounded-md text-white font-medium transition-colors w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50"
        >
          {{ t('serial.selectPort') }}
        </button>

        <div class="mt-6 pt-4 border-t dark:border-slate-700">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-sm flex items-center gap-2">
              <FileCode class="w-4 h-4" />
              {{ t('serial.dataParse') }}
            </h3>
            <label class="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" v-model="localParseEnabled" class="w-4 h-4 rounded border-slate-300" />
              <span class="text-xs text-slate-600 dark:text-slate-400">{{ t('serial.enable') }}</span>
            </label>
          </div>

          <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('serial.parseMode') }}</label>
              <select
                v-model="localParseMode"
                :disabled="!parseEnabled"
                class="border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm disabled:opacity-50"
              >
                <option value="none">{{ t('serial.noParse') }}</option>
                <optgroup :label="t('serial.modbusProtocol')">
                  <option value="modbus-rtu">{{ t('serial.modbusRtu') }}</option>
                  <option value="modbus-ascii">{{ t('serial.modbusAscii') }}</option>
                </optgroup>
                <optgroup :label="t('serial.displayModeGroup')">
                  <option value="hex-display">{{ t('serial.hexDisplay') }}</option>
                  <option value="ascii-display">{{ t('serial.asciiDisplay') }}</option>
                </optgroup>
                <optgroup :label="t('serial.customProtocol')">
                  <option value="custom-frame">{{ t('serial.customFrame') }}</option>
                </optgroup>
              </select>
            </div>

            <div v-if="parseMode === 'custom-frame'" class="space-y-2 p-2 bg-slate-50 dark:bg-slate-900 rounded border dark:border-slate-700">
              <div class="flex flex-col gap-1">
                <label class="text-xs text-slate-500">{{ t('serial.frameHeader') }}</label>
                <input v-model="customProtocolConfig.frameHeader" type="text" placeholder="如: AA 55" class="border dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800 font-mono w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs text-slate-500">{{ t('serial.frameTail') }}</label>
                <input v-model="customProtocolConfig.frameTail" type="text" placeholder="如: 0D 0A" class="border dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800 font-mono w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs text-slate-500">{{ t('serial.dataOffset') }}</label>
                <input v-model.number="customProtocolConfig.dataOffset" type="number" min="0" class="border dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800 w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs text-slate-500">{{ t('serial.checksumMethod') }}</label>
                <select v-model="customProtocolConfig.checksum.type" class="border dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800 w-full">
                  <option value="none">{{ t('serial.noChecksum') }}</option>
                  <option value="sum">{{ t('serial.sumChecksum') }}</option>
                  <option value="xor">{{ t('serial.xorChecksum') }}</option>
                  <option value="crc16">{{ t('serial.crc16Checksum') }}</option>
                  <option value="crc16-modbus">{{ t('serial.crc16ModbusChecksum') }}</option>
                </select>
              </div>
              <div class="flex items-center gap-2">
                <input type="checkbox" v-model="localLengthFieldEnabled" class="w-3 h-3" />
                <label class="text-xs text-slate-500">{{ t('serial.enableLengthField') }}</label>
              </div>
              <div v-show="lengthFieldEnabled" class="space-y-2">
                <div class="flex flex-col gap-1">
                  <label class="text-xs text-slate-500">{{ t('serial.lengthOffset') }}</label>
                  <input v-model.number="customProtocolConfig.lengthField.offset" type="number" min="0" class="border dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800 w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-xs text-slate-500">{{ t('serial.lengthBytes') }}</label>
                  <select v-model.number="customProtocolConfig.lengthField.size" class="border dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800 w-full">
                    <option :value="1">{{ t('serial.oneByte') }}</option>
                    <option :value="2">{{ t('serial.twoBytes') }}</option>
                  </select>
                </div>
              </div>
            </div>

            <button
              @click="emit('update:showParsePanel', !showParsePanel)"
              :disabled="!parseEnabled || parseMode === 'none'"
              class="w-full py-2 rounded border dark:border-slate-700 text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <FileCode class="w-4 h-4" />
              {{ showParsePanel ? t('serial.hideParseResults') : t('serial.showParseResults') }}
              <span v-if="parseResultCount > 0" class="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
                {{ parseResultCount }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
