<script setup lang="ts">
import type { FlashDryRunReport, FlashVerifyReport } from '../../debug-core'

type FlashStatus = 'idle' | 'planning' | 'ready' | 'programming' | 'success' | 'error'
type FlashStage = 'idle' | 'erase' | 'program' | 'verify' | 'done'
type FlashChipFamily = 'stm32f1' | 'stm32f4'

interface FlashPrecheckItem {
  label: string
  state: 'ok' | 'warn' | 'error' | 'idle'
  detail: string
}

interface FlashPlanSummary {
  erasePages: number
  programSections: number
  verifyBytes: number
}

interface FlashDiagnosis {
  title: string
  actions: string[]
}

defineProps<{
  firmwareName: string
  hasFirmwareImage: boolean
  firmwareBaseAddressInput: string
  flashPageSizeInput: number
  flashChipFamily: FlashChipFamily
  flashStartAddressInput: string
  flashEndAddressInput: string
  flashPrecheckItems: FlashPrecheckItem[]
  flashStatus: FlashStatus
  isConnected: boolean
  detectedChipLabel: string
  flashPlanSummary: FlashPlanSummary | null
  flashDryRunReport: FlashDryRunReport | null
  flashStage: FlashStage
  flashProgress: number
  flashOperationSummary: string
  flashVerifyReport: FlashVerifyReport | null
  flashError: string
  flashDiagnosis: FlashDiagnosis | null
  flashHint: string
  formatHexAddress: (value: number) => string
}>()

const emit = defineEmits<{
  'update:firmwareBaseAddressInput': [value: string]
  'update:flashPageSizeInput': [value: number]
  'update:flashChipFamily': [value: FlashChipFamily]
  'update:flashStartAddressInput': [value: string]
  'update:flashEndAddressInput': [value: string]
  openFirmwarePicker: []
  planFirmwareProgramming: []
  programFirmware: []
  detectFlashChipFamily: []
}>()
</script>

<template>
  <div class="p-3 border-b border-slate-200 dark:border-slate-800">
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400">固件烧录(实验)</h3>
      <button
        @click="emit('openFirmwarePicker')"
        class="px-2 py-1 rounded text-[10px] border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        选择固件
      </button>
    </div>

    <p class="text-[10px] text-slate-500 dark:text-slate-400 truncate mb-2" :title="firmwareName || '未导入固件'">
      {{ firmwareName || '未导入固件' }}
    </p>

    <div class="grid grid-cols-3 gap-1.5 mb-2">
      <input
        :value="firmwareBaseAddressInput"
        @input="emit('update:firmwareBaseAddressInput', ($event.target as HTMLInputElement).value)"
        type="text"
        placeholder="BIN基址(0x...)"
        class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-[10px] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <input
        :value="flashPageSizeInput"
        @input="emit('update:flashPageSizeInput', Number(($event.target as HTMLInputElement).value))"
        type="number"
        min="256"
        step="256"
        placeholder="页大小"
        class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-[10px] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <select
        :value="flashChipFamily"
        @change="emit('update:flashChipFamily', ($event.target as HTMLSelectElement).value as FlashChipFamily)"
        class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-[10px] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="stm32f1">STM32F1</option>
        <option value="stm32f4">STM32F4</option>
      </select>
    </div>

    <div class="grid grid-cols-2 gap-1.5 mb-2">
      <input
        :value="flashStartAddressInput"
        @input="emit('update:flashStartAddressInput', ($event.target as HTMLInputElement).value)"
        type="text"
        placeholder="Flash起始(0x...)"
        class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-[10px] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <input
        :value="flashEndAddressInput"
        @input="emit('update:flashEndAddressInput', ($event.target as HTMLInputElement).value)"
        type="text"
        placeholder="Flash结束(0x...)"
        class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-[10px] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>

    <div class="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-2 py-1.5 mb-2">
      <div class="text-[10px] text-slate-400 dark:text-slate-500 mb-1">烧录前检查</div>
      <div class="space-y-1">
        <div
          v-for="item in flashPrecheckItems"
          :key="item.label"
          class="flex items-center justify-between gap-2 text-[10px]"
        >
          <span
            :class="item.state === 'ok'
              ? 'text-green-600 dark:text-green-400'
              : item.state === 'warn'
                ? 'text-yellow-600 dark:text-yellow-400'
                : item.state === 'error'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-500 dark:text-slate-400'"
          >
            {{ item.label }}
          </span>
          <span class="truncate text-right text-slate-500 dark:text-slate-400" :title="item.detail">
            {{ item.detail }}
          </span>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-1.5 mb-2">
      <button
        @click="emit('planFirmwareProgramming')"
        :disabled="!hasFirmwareImage || flashStatus === 'programming'"
        class="px-2 py-1 rounded text-[10px] border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
      >
        Dry-run
      </button>
      <button
        @click="emit('programFirmware')"
        :disabled="flashStatus !== 'ready' || !isConnected"
        class="px-2 py-1 rounded text-[10px] border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-40 transition-colors"
      >
        执行写入
      </button>
      <button
        @click="emit('detectFlashChipFamily')"
        :disabled="!isConnected || flashStatus === 'programming'"
        class="px-2 py-1 rounded text-[10px] border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
      >
        识别芯片
      </button>
    </div>

    <div class="text-[10px] text-slate-500 dark:text-slate-400 mb-1">
      识别结果: {{ detectedChipLabel || '未识别' }}
    </div>

    <div v-if="flashPlanSummary" class="text-[10px] text-slate-500 dark:text-slate-400 space-y-0.5 mb-2">
      <div>擦除页: {{ flashPlanSummary.erasePages }}</div>
      <div>写入段: {{ flashPlanSummary.programSections }}</div>
      <div>校验字节: {{ flashPlanSummary.verifyBytes }}</div>
    </div>

    <div
      v-if="flashDryRunReport"
      class="mb-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 px-2 py-1.5 text-[10px]"
    >
      <div class="flex items-center justify-between gap-2 mb-1 text-slate-500 dark:text-slate-400">
        <span>Dry-run 明细</span>
        <span>{{ flashDryRunReport.totalProgramBytes }}B / {{ flashDryRunReport.sections.length }} 段</span>
      </div>
      <div
        v-if="flashDryRunReport.plan.erasePages.length > 0"
        class="mb-1 text-slate-500 dark:text-slate-400 truncate"
      >
        页范围:
        {{ formatHexAddress(flashDryRunReport.plan.erasePages[0] ?? 0) }}
        -
        {{ formatHexAddress(flashDryRunReport.plan.erasePages[flashDryRunReport.plan.erasePages.length - 1] ?? 0) }}
      </div>
      <div class="space-y-1">
        <div
          v-for="section in flashDryRunReport.sections.slice(0, 3)"
          :key="`${section.name}-${section.address}`"
          class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-slate-500 dark:text-slate-400"
        >
          <span class="truncate" :title="`${section.name} ${formatHexAddress(section.address)}-${formatHexAddress(section.endAddress)}`">
            {{ section.name }} {{ formatHexAddress(section.address) }}
          </span>
          <span>{{ section.bytes }}B / {{ section.erasePages }}页</span>
        </div>
      </div>
      <div
        v-if="flashDryRunReport.sections.length > 3"
        class="mt-1 text-slate-400 dark:text-slate-500"
      >
        另有 {{ flashDryRunReport.sections.length - 3 }} 个 section 已纳入计划
      </div>
      <div
        v-for="warning in flashDryRunReport.warnings"
        :key="warning"
        class="mt-1 text-yellow-600 dark:text-yellow-400"
      >
        {{ warning }}
      </div>
    </div>

    <div class="text-[10px] mb-1" :class="flashStatus === 'error' ? 'text-red-600 dark:text-red-400' : flashStatus === 'success' ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'">
      状态: {{ flashStatus }}
    </div>
    <div class="text-[10px] text-slate-500 dark:text-slate-400 mb-1">
      阶段: {{ flashStage }}
    </div>
    <div v-if="flashOperationSummary" class="text-[10px] text-slate-500 dark:text-slate-400 mb-1 truncate" :title="flashOperationSummary">
      进度: {{ flashOperationSummary }}
    </div>
    <div class="h-1.5 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden mb-1">
      <div class="h-full bg-blue-500 transition-all duration-200" :style="{ width: `${flashProgress}%` }" />
    </div>
    <div class="text-[10px] text-slate-500 dark:text-slate-400 mb-1">{{ flashProgress }}%</div>
    <div
      v-if="flashVerifyReport"
      class="mb-1 rounded border px-2 py-1.5 text-[10px]"
      :class="flashVerifyReport.ok
        ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
        : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'"
    >
      <div
        class="mb-1"
        :class="flashVerifyReport.ok
          ? 'text-green-700 dark:text-green-300'
          : 'text-red-700 dark:text-red-300'"
      >
        校验: {{ flashVerifyReport.ok ? '通过' : '失败' }} / {{ flashVerifyReport.checkedBytes }}B
      </div>
      <div
        v-if="flashVerifyReport.mismatch"
        class="grid grid-cols-2 gap-x-2 gap-y-0.5 text-red-600 dark:text-red-400"
      >
        <span>段: {{ flashVerifyReport.mismatch.sectionName }}</span>
        <span>偏移: {{ flashVerifyReport.mismatch.offset }}</span>
        <span>地址: {{ formatHexAddress(flashVerifyReport.mismatch.address) }}</span>
        <span>
          {{ `0x${flashVerifyReport.mismatch.expected.toString(16).padStart(2, '0')}` }}
          /
          {{ `0x${flashVerifyReport.mismatch.actual.toString(16).padStart(2, '0')}` }}
        </span>
      </div>
    </div>
    <div v-if="flashError" class="text-[10px] text-red-600 dark:text-red-400 mb-1">
      {{ flashError }}
    </div>
    <div
      v-if="flashDiagnosis"
      class="mb-1 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-2 py-1.5 text-[10px]"
    >
      <div class="text-amber-700 dark:text-amber-300 mb-1">诊断: {{ flashDiagnosis.title }}</div>
      <div
        v-for="(advice, idx) in flashDiagnosis.actions"
        :key="`flash-advice-${idx}`"
        class="text-amber-600 dark:text-amber-400"
      >
        {{ idx + 1 }}. {{ advice }}
      </div>
    </div>
    <div v-if="flashHint" class="text-[10px] text-slate-500 dark:text-slate-400 mb-1">
      {{ flashHint }}
    </div>
    <div class="text-[10px] text-yellow-600 dark:text-yellow-400">
      当前为实验擦页：已支持 STM32F1 页擦除与 STM32F4 扇区擦除(0-7)。
    </div>
  </div>
</template>
