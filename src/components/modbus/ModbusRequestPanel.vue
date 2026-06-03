<script setup lang="ts">
import { Copy, Send } from 'lucide-vue-next'
import type { ByteOrder, DataType, ModbusPollingResult, ModbusPollingResultFilter, ModbusPollingTask } from '../../features/modbus'

interface BuildSettings {
  address: number
  functionCode: number
  startAddress: number
  quantity: number
  writeValue: string
}

interface PollingSettings {
  intervalMs: number
  maxCycles: number
}

interface DataTypeSettings {
  type: DataType
  byteOrder: ByteOrder
}

const buildSettings = defineModel<BuildSettings>('buildSettings', { required: true })
const pollingSettings = defineModel<PollingSettings>('pollingSettings', { required: true })
const dataTypeSettings = defineModel<DataTypeSettings>('dataTypeSettings', { required: true })
const pollingTaskImportMode = defineModel<'replace' | 'append'>('pollingTaskImportMode', { required: true })
const pollingResultFilter = defineModel<ModbusPollingResultFilter>('pollingResultFilter', { required: true })

function updatePollingResultFilter(patch: Partial<ModbusPollingResultFilter>): void {
  pollingResultFilter.value = {
    ...pollingResultFilter.value,
    ...patch,
  }
}

defineProps<{
  functionCodeOptions: Array<{ value: number; label: string }>
  selectedFunctionCode?: { needsValue?: boolean } | null
  buildResult: string
  isSerialConnected: boolean
  isSendingModbusRequest: boolean
  isPollingModbus: boolean
  pollingProgressLabel: string
  lastPollingSentAt: number | null
  lastPollingError: string
  pollingTasks: ModbusPollingTask[]
  pollingResults: ModbusPollingResult[]
  isTaskPolling: boolean
  activePollingTaskId: string
  pollingTaskCycle: number
  taskPollingSummary: {
    sent: number
    success: number
    failed: number
  }
  dataTypeOptions: Array<{ value: DataType; label: string; bytes: number }>
  byteOrderOptions: Array<{ value: ByteOrder; label: string }>
  t: (key: string) => string
  formatTimestamp: (timestamp: number) => string
}>()

defineEmits<{
  build: []
  copy: [text: string]
  sendBuiltFrame: []
  useBuildResultAsResponseInput: []
  startModbusPolling: []
  stopModbusPolling: []
  addCurrentRequestAsPollingTask: []
  startTaskPolling: []
  stopTaskPolling: []
  importPollingTasks: []
  exportPollingTasks: []
  togglePollingTask: [taskId: string]
  duplicatePollingTask: [taskId: string]
  clearPollingTaskStats: [taskId: string]
  removePollingTask: [taskId: string]
}>()
</script>

<template>
  <section class="flex min-h-0 flex-col border-r border-slate-200 bg-white/95 dark:border-slate-800 dark:bg-slate-900/95">
    <div class="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold">{{ t('modbus.frameBuild') }}</h3>
        <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">Request</span>
      </div>
    </div>

    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      <div class="grid grid-cols-2 gap-2">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.slaveAddress') }}</label>
          <input v-model.number="buildSettings.address" type="number" min="1" max="247" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.functionCode') }}</label>
          <select v-model.number="buildSettings.functionCode" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800">
            <option v-for="fc in functionCodeOptions" :key="fc.value" :value="fc.value">{{ fc.label }}</option>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.startAddress') }}</label>
          <input v-model.number="buildSettings.startAddress" type="number" min="0" max="65535" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.quantityValue') }}</label>
          <input v-model.number="buildSettings.quantity" type="number" min="1" max="125" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
        </div>
      </div>

      <div v-if="selectedFunctionCode?.needsValue" class="flex flex-col gap-1">
        <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.writeValue') }}</label>
        <input v-model="buildSettings.writeValue" type="text" :placeholder="t('modbus.writeValuePlaceholder')" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
      </div>

      <button data-testid="modbus-build-frame" @click="$emit('build')" class="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 dark:bg-blue-600 dark:hover:bg-blue-500">
        <Send class="h-4 w-4" />
        {{ t('modbus.buildFrame') }}
      </button>

      <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
        <div class="mb-2 flex items-center justify-between gap-2">
          <span class="text-xs font-medium text-slate-500">{{ t('modbus.buildResult') }}</span>
          <div class="flex items-center gap-1 text-[10px]">
            <span
              class="rounded-full px-2 py-0.5"
              :class="isSerialConnected ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'"
            >
              {{ isSerialConnected ? '串口已连接' : '串口未连接' }}
            </span>
            <button @click="$emit('copy', buildResult)" :disabled="!buildResult" class="rounded p-1 hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-800">
              <Copy class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div class="min-h-16 break-all font-mono text-xs text-blue-600 dark:text-blue-400">
          {{ buildResult || '—' }}
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button
            @click="$emit('sendBuiltFrame')"
            :disabled="!buildResult || !isSerialConnected || isSendingModbusRequest"
            class="flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/60"
          >
            <Send class="h-3.5 w-3.5" />
            {{ isSendingModbusRequest ? '发送中' : '串口发送' }}
          </button>
          <button
            @click="$emit('useBuildResultAsResponseInput')"
            :disabled="!buildResult"
            class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-white disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            填入解析
          </button>
        </div>
      </div>

      <div class="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div class="mb-2 flex items-center justify-between gap-2">
          <div>
            <h4 class="text-xs font-medium text-slate-600 dark:text-slate-300">轮询发送</h4>
            <p class="text-[10px] text-slate-400">按当前构建帧周期发送，响应进入流水线</p>
          </div>
          <span
            class="rounded-full px-2 py-0.5 text-[10px]"
            :class="isPollingModbus ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'"
          >
            {{ isPollingModbus ? '运行中' : '已停止' }}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="flex flex-col gap-1">
            <label class="text-[10px] text-slate-500">间隔 ms</label>
            <input
              v-model.number="pollingSettings.intervalMs"
              type="number"
              min="100"
              max="60000"
              step="100"
              :disabled="isPollingModbus"
              class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] text-slate-500">次数 0=无限</label>
            <input
              v-model.number="pollingSettings.maxCycles"
              type="number"
              min="0"
              max="999999"
              :disabled="isPollingModbus"
              class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-2">
          <button
            v-if="!isPollingModbus"
            @click="$emit('startModbusPolling')"
            :disabled="!isSerialConnected"
            class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
          >
            开始轮询
          </button>
          <button
            v-else
            @click="$emit('stopModbusPolling')"
            class="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/60"
          >
            停止轮询
          </button>
          <div class="flex items-center justify-center rounded-lg bg-slate-50 px-2 py-1.5 text-[10px] text-slate-500 dark:bg-slate-950/60 dark:text-slate-400">
            {{ pollingProgressLabel }}
          </div>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
          <span v-if="lastPollingSentAt">最近发送 {{ formatTimestamp(lastPollingSentAt) }}</span>
          <span v-if="lastPollingError" class="text-red-500 dark:text-red-300">{{ lastPollingError }}</span>
        </div>
      </div>

      <div class="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div class="mb-2 flex items-center justify-between gap-2">
          <div>
            <h4 class="text-xs font-medium text-slate-600 dark:text-slate-300">多请求轮询</h4>
            <p class="text-[10px] text-slate-400">启用任务串行发送，按地址/功能码匹配响应</p>
          </div>
          <span
            class="rounded-full px-2 py-0.5 text-[10px]"
            :class="isTaskPolling ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'"
          >
            {{ isTaskPolling ? `第 ${pollingTaskCycle} 轮` : `${pollingTasks.length} 项` }}
          </span>
        </div>

        <div class="grid grid-cols-4 gap-1.5">
          <button
            @click="$emit('addCurrentRequestAsPollingTask')"
            :disabled="isTaskPolling"
            class="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            加入任务
          </button>
          <button
            v-if="!isTaskPolling"
            @click="$emit('startTaskPolling')"
            :disabled="!isSerialConnected || pollingTasks.filter(task => task.enabled).length === 0"
            class="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
          >
            启动队列
          </button>
          <button
            v-else
            @click="$emit('stopTaskPolling')"
            class="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] font-medium text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
          >
            停止队列
          </button>
          <button
            data-testid="modbus-import-polling-tasks"
            @click="$emit('importPollingTasks')"
            :disabled="isTaskPolling"
            class="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            导入
          </button>
          <button
            @click="$emit('exportPollingTasks')"
            :disabled="pollingTasks.length === 0"
            class="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            导出任务
          </button>
        </div>

        <div class="mt-2 grid grid-cols-2 gap-1.5">
          <select
            v-model="pollingTaskImportMode"
            data-testid="modbus-import-mode"
            :disabled="isTaskPolling"
            class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] text-slate-600 outline-none focus:border-blue-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <option value="replace">覆盖导入</option>
            <option value="append">追加导入</option>
          </select>
          <div class="rounded-lg bg-slate-50 px-2 py-1.5 text-[10px] text-slate-400 dark:bg-slate-950/60">
            默认覆盖，追加会保留现有任务
          </div>
        </div>

        <div class="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
          <div class="rounded bg-slate-50 py-1 dark:bg-slate-950/60">
            <div class="font-mono text-slate-700 dark:text-slate-200">{{ taskPollingSummary.sent }}</div>
            <div class="text-slate-400">发送</div>
          </div>
          <div class="rounded bg-emerald-50 py-1 dark:bg-emerald-950/30">
            <div class="font-mono text-emerald-600 dark:text-emerald-300">{{ taskPollingSummary.success }}</div>
            <div class="text-slate-400">成功</div>
          </div>
          <div class="rounded bg-red-50 py-1 dark:bg-red-950/30">
            <div class="font-mono text-red-600 dark:text-red-300">{{ taskPollingSummary.failed }}</div>
            <div class="text-slate-400">失败</div>
          </div>
        </div>

        <div class="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
          <div v-if="pollingTasks.length === 0" class="rounded bg-slate-50 px-2 py-3 text-center text-[10px] text-slate-400 dark:bg-slate-950/60">
            暂无任务，可先构建请求后加入任务
          </div>
          <div
            v-for="task in pollingTasks"
            :key="task.id"
            class="rounded-lg border px-2 py-1.5 text-[10px]"
            :class="activePollingTaskId === task.id
              ? 'border-blue-300 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/30'
              : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50'"
          >
            <div class="flex items-center justify-between gap-2">
              <button
                @click="$emit('togglePollingTask', task.id)"
                :disabled="isTaskPolling"
                class="min-w-0 truncate text-left font-medium"
                :class="task.enabled ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 line-through'"
              >
                {{ task.name }}
              </button>
              <div class="flex shrink-0 items-center gap-1">
                <button
                  :data-testid="`modbus-duplicate-task-${task.id}`"
                  @click="$emit('duplicatePollingTask', task.id)"
                  :disabled="isTaskPolling"
                  class="text-slate-500 hover:text-blue-600 disabled:opacity-40 dark:text-slate-400 dark:hover:text-blue-300"
                >
                  复制
                </button>
                <button
                  :data-testid="`modbus-clear-task-stats-${task.id}`"
                  @click="$emit('clearPollingTaskStats', task.id)"
                  :disabled="isTaskPolling || task.sent === 0"
                  class="text-slate-500 hover:text-amber-600 disabled:opacity-40 dark:text-slate-400 dark:hover:text-amber-300"
                >
                  清统计
                </button>
                <button
                  @click="$emit('removePollingTask', task.id)"
                  :disabled="isTaskPolling"
                  class="text-red-500 disabled:opacity-40"
                >
                  删除
                </button>
              </div>
            </div>
            <div class="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-slate-400">
              <span>FC {{ task.functionCode }}</span>
              <span>{{ task.intervalMs }}ms</span>
              <span>超时 {{ task.timeoutMs }}ms</span>
              <span>重试 {{ task.retries }}</span>
            </div>
            <div class="mt-1 flex flex-wrap gap-x-2 gap-y-1">
              <span class="text-emerald-600 dark:text-emerald-300">成功 {{ task.success }}</span>
              <span class="text-red-600 dark:text-red-300">失败 {{ task.failed }}</span>
              <span class="text-slate-400">状态 {{ task.status }}</span>
            </div>
            <div v-if="task.lastError" class="mt-1 truncate text-red-500 dark:text-red-300">{{ task.lastError }}</div>
          </div>
        </div>

        <div v-if="pollingResults.length > 0" class="mt-2 border-t border-slate-200 pt-2 text-[10px] dark:border-slate-800">
          <div class="mb-1 flex items-center justify-between text-slate-500">
            <span>轮询结果</span>
            <span>{{ pollingResults.length }}</span>
          </div>
          <div class="mb-2 grid grid-cols-2 gap-1">
            <select
              :value="pollingResultFilter.status ?? 'all'"
              data-testid="modbus-result-filter-status"
              class="rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
              @change="updatePollingResultFilter({ status: ($event.target as HTMLSelectElement).value as ModbusPollingResultFilter['status'] })"
            >
              <option value="all">全部状态</option>
              <option value="success">成功</option>
              <option value="timeout">超时</option>
              <option value="failed">失败</option>
            </select>
            <input
              :value="pollingResultFilter.taskName ?? ''"
              data-testid="modbus-result-filter-task"
              type="search"
              placeholder="任务名"
              class="rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
              @input="updatePollingResultFilter({ taskName: ($event.target as HTMLInputElement).value })"
            />
            <input
              :value="pollingResultFilter.query ?? ''"
              data-testid="modbus-result-filter-query"
              type="search"
              placeholder="筛选任务/HEX/错误"
              class="rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
              @input="updatePollingResultFilter({ query: ($event.target as HTMLInputElement).value })"
            />
          </div>
          <div class="max-h-20 space-y-1 overflow-y-auto pr-1">
            <div v-for="result in pollingResults.slice(0, 5)" :key="result.id" class="flex items-center justify-between gap-2 text-slate-400">
              <span class="min-w-0 truncate">{{ result.taskName }}</span>
              <span :class="result.status === 'success' ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'">
                {{ result.status }} / {{ result.durationMs }}ms
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <h4 class="mb-2 text-xs font-medium text-slate-500">{{ t('modbus.dataParseSettings') }}</h4>
        <div class="grid grid-cols-2 gap-2">
          <select v-model="dataTypeSettings.type" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800">
            <option v-for="dt in dataTypeOptions" :key="dt.value" :value="dt.value">{{ dt.label }}</option>
          </select>
          <select v-model="dataTypeSettings.byteOrder" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800">
            <option v-for="bo in byteOrderOptions" :key="bo.value" :value="bo.value">{{ bo.label }}</option>
          </select>
        </div>
      </div>
    </div>
  </section>
</template>
