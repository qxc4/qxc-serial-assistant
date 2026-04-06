<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue'
import { 
  LineChart, 
  BarChart3, 
  ScatterChart, 
  PieChart, 
  Grid3X3,
  Play, 
  Pause, 
  Square,
  Trash2, 
  Download,
  Activity,
  ChevronDown,
  ChevronUp
} from 'lucide-vue-next'
import { useChart } from '../composables/useChart'
import { useSettingsStore } from '../stores/settings'
import { useI18n } from '../composables/useI18n'
import { useSerial } from '../composables/useSerial'
import type { ChartType, ExportFormat } from '../types/chart'
import { samplingFrequencyOptions, playbackSpeedOptions } from '../types/chart'
import type { ChartChannelConfig } from '../stores/settings'

const settingsStore = useSettingsStore()
const { t } = useI18n()
const chart = useChart()
const { onDataReceive } = useSerial()

/** 图表容器引用 */
const chartContainer = ref<HTMLElement | null>(null)

/** 左侧面板显示 */
const showLeftPanel = ref(true)

/** 选中的采样频率 */
const selectedFrequency = ref(100)

/** 选中的回放速度 */
const selectedSpeed = ref(1)

/** 时间范围选择 */
const timeRangeStart = ref('')
const timeRangeEnd = ref('')

/** 展开的通道配置 */
const expandedChannel = ref<string | null>(null)

/** 手动输入数据 */
const manualInputValue = ref('')

/** 手动输入选中的通道 */
const manualInputChannel = ref('')

/** 数据类型选项 */
const dataTypeOptions = [
  { value: 'uint8', label: 'uint8 (1字节)' },
  { value: 'int8', label: 'int8 (1字节)' },
  { value: 'uint16', label: 'uint16 (2字节)' },
  { value: 'int16', label: 'int16 (2字节)' },
  { value: 'uint32', label: 'uint32 (4字节)' },
  { value: 'int32', label: 'int32 (4字节)' },
  { value: 'float', label: 'float (4字节)' }
]

/** 字节顺序选项 */
const byteOrderOptions = [
  { value: 'big', label: '大端 (Big Endian)' },
  { value: 'little', label: '小端 (Little Endian)' }
]

/** 图表通道配置 */
const chartChannels = computed({
  get: () => settingsStore.config.chartChannels,
  set: (val) => { settingsStore.config.chartChannels = val }
})

/** 同步通道配置到图表 */
watch(chartChannels, (channels) => {
  chart.channels.value = channels.filter(c => c.enabled).map(c => ({
    id: c.name,
    name: c.name,
    color: c.color,
    enabled: c.enabled,
    unit: ''
  }))
}, { immediate: true, deep: true })

/** 图表类型列表 */
const chartTypes: Array<{ type: ChartType; icon: any; label: string }> = [
  { type: 'line', icon: LineChart, label: t('chart.lineChart') },
  { type: 'bar', icon: BarChart3, label: t('chart.barChart') },
  { type: 'scatter', icon: ScatterChart, label: t('chart.scatterChart') },
  { type: 'pie', icon: PieChart, label: t('chart.pieChart') },
  { type: 'heatmap', icon: Grid3X3, label: t('chart.heatmap') }
]

/**
 * 切换图表类型
 */
function handleChartTypeChange(type: ChartType) {
  chart.setChartType(type)
}

/**
 * 开始/停止采集
 */
function toggleCollection() {
  if (chart.isCollecting.value) {
    chart.stopCollection()
    settingsStore.showToast(t('chart.collectionStopped'))
  } else {
    chart.setSamplingFrequency(selectedFrequency.value)
    chart.startCollection()
    settingsStore.showToast(t('chart.collectionStarted'))
  }
}

/**
 * 清除数据
 */
function handleClearData() {
  chart.clearData()
  settingsStore.showToast(t('chart.dataCleared'))
}

/**
 * 开始回放
 */
function handleStartPlayback() {
  chart.startPlayback(selectedSpeed.value)
}

/**
 * 暂停回放
 */
function handlePausePlayback() {
  chart.pausePlayback()
}

/**
 * 停止回放
 */
function handleStopPlayback() {
  chart.stopPlayback()
}

/**
 * 切换通道配置展开状态
 */
function toggleChannelExpand(channelName: string) {
  expandedChannel.value = expandedChannel.value === channelName ? null : channelName
}

/**
 * 处理手动输入数据
 */
function handleManualInput() {
  const value = parseFloat(manualInputValue.value)
  if (isNaN(value)) {
    settingsStore.showToast('请输入有效的数值')
    return
  }
  
  const channelId = manualInputChannel.value || chartChannels.value.find(c => c.enabled && c.dataSource === 'manual')?.name
  if (!channelId) {
    settingsStore.showToast('请先启用手动输入通道')
    return
  }
  
  chart.addDataPoint(value, channelId)
  manualInputValue.value = ''
}

/**
 * 更新通道配置
 */
function updateChannelConfig(index: number, field: keyof ChartChannelConfig | string, value: any) {
  const channels = [...chartChannels.value]
  if (field.includes('.')) {
    const [parent, child] = field.split('.')
    ;(channels[index] as any)[parent][child] = value
  } else {
    ;(channels[index] as any)[field] = value
  }
  chartChannels.value = channels
  
  if (field === 'enabled' && !value) {
    if (expandedChannel.value === channels[index].name) {
      expandedChannel.value = null
    }
  }
}

/** 数据接收回调取消注册函数 */
let unregisterDataCallback: (() => void) | null = null

onMounted(async () => {
  await nextTick()
  if (chartContainer.value) {
    chart.initChart(chartContainer.value)
  }
  
  // 注册串口数据接收回调
  unregisterDataCallback = onDataReceive((data, direction) => {
    if (direction === 'rx' && chart.isCollecting.value && chart.samplingConfig.value.dataSource === 'serial') {
      const enabledChannels = chartChannels.value.filter(c => c.enabled && c.dataSource === 'serial')
      if (enabledChannels.length > 0) {
        chart.parseAndAddDataPoints(
          data,
          enabledChannels.map(c => ({
            id: c.name,
            ...c.parseRule
          }))
        )
      }
    }
  })
})

onUnmounted(() => {
  chart.destroyChart()
  
  // 取消注册数据接收回调
  if (unregisterDataCallback) {
    unregisterDataCallback()
    unregisterDataCallback = null
  }
})

/**
 * 导出数据
 */
function handleExport(format: ExportFormat) {
  chart.downloadExport(format)
  settingsStore.showToast(t('chart.exportSuccess'))
}

/**
 * 查询历史数据
 */
function handleQueryHistory() {
  if (!timeRangeStart.value || !timeRangeEnd.value) {
    settingsStore.showToast(t('chart.selectTimeRange'))
    return
  }
  
  const start = new Date(timeRangeStart.value).getTime()
  const end = new Date(timeRangeEnd.value).getTime()
  
  const history = chart.queryHistory(start, end)
  settingsStore.showToast(t('chart.queryResult', { count: history.length }))
}
</script>

<template>
  <div class="flex flex-col h-full w-full bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans text-sm transition-colors">
    <!-- 主内容区 -->
    <div class="flex flex-1 overflow-hidden">
      <!-- 左侧面板: 配置 -->
      <div v-show="showLeftPanel" class="w-64 shrink-0 bg-white dark:bg-slate-800 border-r dark:border-slate-700 flex flex-col">
        <!-- 图表类型选择 -->
        <div class="p-4 border-b dark:border-slate-700">
          <h2 class="font-bold text-base mb-3">{{ t('chart.chartType') }}</h2>
          <div class="grid grid-cols-5 gap-1">
            <button
              v-for="item in chartTypes"
              :key="item.type"
              @click="handleChartTypeChange(item.type)"
              class="p-2 rounded-lg transition-colors flex flex-col items-center gap-1"
              :class="chart.chartType.value === item.type 
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' 
                : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400'"
              :title="item.label"
            >
              <component :is="item.icon" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- 采样配置 -->
        <div class="p-4 border-b dark:border-slate-700">
          <h2 class="font-bold text-base mb-3">{{ t('chart.samplingConfig') }}</h2>
          
          <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('chart.frequency') }}</label>
              <select 
                v-model="selectedFrequency"
                :disabled="chart.isCollecting.value"
                class="border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm"
              >
                <option v-for="freq in samplingFrequencyOptions" :key="freq" :value="freq">
                  {{ freq }} Hz
                </option>
              </select>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('chart.cacheSize') }}</label>
              <input 
                v-model.number="chart.samplingConfig.value.maxCacheSize"
                type="number"
                min="1000"
                max="1000000"
                class="border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm"
              />
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('chart.dataSource') }}</label>
              <select 
                v-model="chart.samplingConfig.value.dataSource"
                class="border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm"
              >
                <option value="serial">{{ t('chart.serialData') }}</option>
                <option value="network">{{ t('chart.networkData') }}</option>
                <option value="manual">{{ t('chart.manualInput') }}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 数据通道 -->
        <div class="p-4 border-b dark:border-slate-700">
          <h2 class="font-bold text-base mb-3">{{ t('chart.channels') }}</h2>
          <div class="space-y-2">
            <div 
              v-for="(channel, index) in chartChannels" 
              :key="channel.name"
              class="bg-slate-50 dark:bg-slate-900 rounded-lg overflow-hidden"
              :class="{ 'opacity-50': !channel.enabled }"
            >
              <div 
                class="flex items-center gap-2 p-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                :class="{ 'cursor-default': !channel.enabled }"
                @click="channel.enabled && toggleChannelExpand(channel.name)"
              >
                <component 
                  v-if="channel.enabled"
                  :is="expandedChannel === channel.name ? ChevronDown : ChevronUp" 
                  class="w-4 h-4 text-slate-400"
                />
                <div v-else class="w-4 h-4" />
                <input 
                  type="checkbox"
                  :checked="channel.enabled"
                  @change="updateChannelConfig(index, 'enabled', ($event.target as HTMLInputElement).checked)"
                  @click.stop
                  class="w-4 h-4 rounded border-slate-300"
                />
                <input 
                  type="color"
                  :value="channel.color"
                  @input="updateChannelConfig(index, 'color', ($event.target as HTMLInputElement).value)"
                  @click.stop
                  class="w-6 h-6 rounded cursor-pointer border-0 p-0"
                />
                <span class="text-xs flex-1">{{ channel.name }}</span>
                <span class="text-xs text-slate-400">{{ channel.dataSource === 'serial' ? '串口' : channel.dataSource === 'network' ? '网络' : '手动' }}</span>
              </div>
              
              <div v-if="channel.enabled && expandedChannel === channel.name" class="p-2 border-t dark:border-slate-700 space-y-2">
                <div class="flex flex-col gap-1">
                  <label class="text-xs text-slate-500">数据源</label>
                  <select 
                    :value="channel.dataSource"
                    @change="updateChannelConfig(index, 'dataSource', ($event.target as HTMLSelectElement).value)"
                    class="border dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800"
                  >
                    <option value="serial">串口数据</option>
                    <option value="network">网络数据</option>
                    <option value="manual">手动输入</option>
                  </select>
                </div>
                
                <div class="flex gap-2">
                  <div class="flex-1 flex flex-col gap-1">
                    <label class="text-xs text-slate-500">起始字节</label>
                    <input 
                      type="number"
                      :value="channel.parseRule.startByte"
                      @input="updateChannelConfig(index, 'parseRule.startByte', parseInt(($event.target as HTMLInputElement).value) || 0)"
                      min="0"
                      class="border dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800 w-full"
                    />
                  </div>
                  <div class="flex-1 flex flex-col gap-1">
                    <label class="text-xs text-slate-500">数据类型</label>
                    <select 
                      :value="channel.parseRule.dataType"
                      @change="updateChannelConfig(index, 'parseRule.dataType', ($event.target as HTMLSelectElement).value)"
                      class="border dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800"
                    >
                      <option v-for="opt in dataTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </div>
                </div>
                
                <div class="flex flex-col gap-1">
                  <label class="text-xs text-slate-500">字节顺序</label>
                  <select 
                    :value="channel.parseRule.byteOrder"
                    @change="updateChannelConfig(index, 'parseRule.byteOrder', ($event.target as HTMLSelectElement).value)"
                    class="border dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800"
                  >
                    <option v-for="opt in byteOrderOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 手动输入数据 -->
        <div v-if="chart.samplingConfig.value.dataSource === 'manual'" class="p-4 border-b dark:border-slate-700 bg-blue-50 dark:bg-blue-900/20">
          <h2 class="font-bold text-sm mb-3 text-blue-700 dark:text-blue-300">{{ t('chart.manualInput') }}</h2>
          <div class="flex flex-col gap-2">
            <div class="flex gap-2">
              <select 
                v-model="manualInputChannel"
                class="border dark:border-slate-700 rounded px-2 py-1.5 text-xs bg-white dark:bg-slate-800 outline-none focus:border-blue-500 flex-1"
              >
                <option value="">选择通道</option>
                <option 
                  v-for="channel in chartChannels.filter(c => c.enabled && c.dataSource === 'manual')" 
                  :key="channel.name" 
                  :value="channel.name"
                >
                  {{ channel.name }}
                </option>
              </select>
            </div>
            <div class="flex gap-2">
              <input 
                v-model="manualInputValue"
                type="number"
                step="any"
                placeholder="输入数值..."
                class="flex-1 border dark:border-slate-700 rounded px-3 py-1.5 text-sm bg-white dark:bg-slate-800 outline-none focus:border-blue-500"
                @keyup.enter="handleManualInput"
              />
              <button 
                @click="handleManualInput"
                class="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm font-medium transition-colors"
              >
                添加
              </button>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="p-4 space-y-2">
          <button 
            @click="toggleCollection"
            class="w-full py-2.5 rounded-md text-white font-medium transition-colors flex items-center justify-center gap-2"
            :class="chart.isCollecting.value ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-500 hover:bg-green-600'"
          >
            <Square v-if="chart.isCollecting.value" class="w-4 h-4" />
            <Play v-else class="w-4 h-4" />
            {{ chart.isCollecting.value ? t('chart.stopCollection') : t('chart.startCollection') }}
          </button>
          
          <button 
            @click="handleClearData"
            class="w-full py-2.5 rounded-md border dark:border-slate-700 font-medium transition-colors flex items-center justify-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <Trash2 class="w-4 h-4" />
            {{ t('chart.clearData') }}
          </button>
        </div>

        <!-- 统计信息 -->
        <div class="mt-auto border-t dark:border-slate-700 p-4">
          <h3 class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">{{ t('chart.statistics') }}</h3>
          <div class="space-y-1 text-xs">
            <div class="flex justify-between">
              <span class="text-slate-600 dark:text-slate-400">{{ t('chart.dataPoints') }}</span>
              <span class="font-mono">{{ chart.dataPointCount.value.toLocaleString() }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-600 dark:text-slate-400">{{ t('chart.status') }}</span>
              <span :class="chart.isCollecting.value ? 'text-green-500' : 'text-slate-400'">
                {{ chart.isCollecting.value ? t('chart.collecting') : t('chart.idle') }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 中间面板: 图表显示 -->
      <div class="flex-1 flex flex-col bg-white dark:bg-slate-800 min-w-0">
        <!-- 图表区域 -->
        <div class="flex-1 relative min-h-0">
          <div 
            ref="chartContainer" 
            class="absolute inset-0"
            style="min-height: 300px;"
          ></div>
          
          <!-- 空状态 -->
          <div 
            v-if="chart.dataPointCount.value === 0" 
            class="absolute inset-0 flex items-center justify-center text-slate-400 pointer-events-none"
          >
            <div class="text-center">
              <Activity class="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{{ t('chart.noData') }}</p>
              <p class="text-xs mt-1">{{ t('chart.clickStartToCollect') }}</p>
            </div>
          </div>
        </div>

        <!-- 底部: 历史数据管理 -->
        <div class="border-t dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-900">
          <div class="flex items-center gap-4 flex-wrap">
            <!-- 时间范围选择 -->
            <div class="flex items-center gap-2">
              <span class="text-xs text-slate-600 dark:text-slate-400">{{ t('chart.timeRange') }}:</span>
              <input 
                v-model="timeRangeStart"
                type="datetime-local"
                class="border dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800"
              />
              <span class="text-xs">-</span>
              <input 
                v-model="timeRangeEnd"
                type="datetime-local"
                class="border dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800"
              />
              <button 
                @click="handleQueryHistory"
                class="px-3 py-1 text-xs bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                {{ t('chart.query') }}
              </button>
            </div>

            <!-- 导出按钮 -->
            <div class="flex items-center gap-2">
              <span class="text-xs text-slate-600 dark:text-slate-400">{{ t('chart.export') }}:</span>
              <button 
                @click="handleExport('csv')"
                class="px-3 py-1 text-xs border dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1"
              >
                <Download class="w-3 h-3" /> CSV
              </button>
              <button 
                @click="handleExport('txt')"
                class="px-3 py-1 text-xs border dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1"
              >
                <Download class="w-3 h-3" /> TXT
              </button>
              <button 
                @click="handleExport('excel')"
                class="px-3 py-1 text-xs border dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1"
              >
                <Download class="w-3 h-3" /> Excel
              </button>
            </div>

            <!-- 回放控制 -->
            <div class="flex items-center gap-2">
              <span class="text-xs text-slate-600 dark:text-slate-400">{{ t('chart.playback') }}:</span>
              <select 
                v-model="selectedSpeed"
                class="border dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800"
              >
                <option v-for="speed in playbackSpeedOptions" :key="speed" :value="speed">
                  {{ speed }}x
                </option>
              </select>
              <button 
                v-if="!chart.isPlaying.value"
                @click="handleStartPlayback"
                :disabled="chart.dataPointCount.value === 0"
                class="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                <Play class="w-4 h-4" />
              </button>
              <button 
                v-else
                @click="handlePausePlayback"
                class="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <Pause class="w-4 h-4" />
              </button>
              <button 
                @click="handleStopPlayback"
                class="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <Square class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
