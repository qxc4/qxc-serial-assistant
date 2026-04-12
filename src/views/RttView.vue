<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useRtt } from '../composables/useRtt'
import { useI18n } from '../composables/useI18n'
import VirtualList from '../components/VirtualList.vue'
import type { RttLogLevel, RttBackend } from '../types/rtt'
import {
  Usb, Unplug, Play, Pause, Send,
  RefreshCw, Download, Trash2, Search,
  AlertCircle, Radio, Terminal, X, HelpCircle,
  PanelRight, BookOpen
} from 'lucide-vue-next'

const { t } = useI18n()

const {
  filteredLogs,
  connectionState,
  isConnected,
  backend,
  selectedProbe,
  probes,
  channels,
  filter,
  isPaused,
  autoScroll,
  errorMessage,
  chipModel,
  protocol,
  openocdHost,
  openocdPort,
  jlinkHost,
  jlinkPort,
  logStats,
  connect,
  disconnect,
  send,
  clearLogs,
  setFilter,
  togglePause,
  refreshProbes,
  exportLogs,
  exportSession,
} = useRtt()

/** 发送输入框内容 */
const sendInput = ref('')

/** 发送目标通道 */
const sendChannel = ref(0)

/** 虚拟列表引用 */
const virtualListRef = ref<InstanceType<typeof VirtualList> | null>(null)

/** 是否显示右侧面板 */
const showRightPanel = ref(true)

/** 是否显示帮助面板 */
const showHelpPanel = ref(false)

/** 后端选项 */
const backendOptions: Array<{ value: RttBackend; label: string }> = [
  { value: 'probe-rs', label: 'probe-rs' },
  { value: 'openocd', label: 'OpenOCD' },
  { value: 'jlink', label: 'J-Link' },
]

/** 日志级别选项 */
const levelOptions: Array<{ value: RttLogLevel; label: string; color: string }> = [
  { value: 'trace', label: 'TRACE', color: 'text-slate-500' },
  { value: 'debug', label: 'DEBUG', color: 'text-blue-500' },
  { value: 'info', label: 'INFO', color: 'text-green-500' },
  { value: 'warn', label: 'WARN', color: 'text-yellow-500' },
  { value: 'error', label: 'ERROR', color: 'text-red-500' },
]

/** 连接状态颜色映射 */
const stateColorMap: Record<string, string> = {
  disconnected: 'bg-slate-400',
  connecting: 'bg-yellow-500 animate-pulse',
  connected: 'bg-green-500',
  error: 'bg-red-500',
}

/** 日志级别颜色映射 */
const levelColorMap: Record<string, string> = {
  trace: 'text-slate-500 dark:text-slate-400',
  debug: 'text-blue-600 dark:text-blue-400',
  info: 'text-green-600 dark:text-green-400',
  warn: 'text-yellow-600 dark:text-yellow-400',
  error: 'text-red-600 dark:text-red-400',
}

/** 日志级别背景色映射 */
const levelBgMap: Record<string, string> = {
  trace: 'bg-slate-100 dark:bg-slate-800/50',
  debug: 'bg-blue-50 dark:bg-blue-900/20',
  info: 'bg-green-50 dark:bg-green-900/20',
  warn: 'bg-yellow-50 dark:bg-yellow-900/20',
  error: 'bg-red-50 dark:bg-red-900/20',
}

/** 过滤后的日志条目（用于虚拟列表） */
const virtualListItems = computed(() => filteredLogs.value)

/** 当前连接状态指示灯颜色 */
const stateIndicator = computed(() => stateColorMap[connectionState.value] ?? 'bg-slate-400')

/** 连接按钮文本 */
const connectBtnText = computed(() => {
  switch (connectionState.value) {
    case 'connected': return t('rtt.disconnect')
    case 'connecting': return t('rtt.connecting')
    default: return t('rtt.connect')
  }
})

/** 是否可以连接 */
const canConnect = computed(() => {
  return connectionState.value === 'disconnected' || connectionState.value === 'error'
})

/**
 * 格式化时间戳
 * @param ts 时间戳
 * @returns 格式化后的时间字符串
 */
function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`
}

/**
 * 切换日志级别过滤
 * @param level 日志级别
 */
function toggleLevelFilter(level: RttLogLevel): void {
  const levels = [...filter.value.levels]
  const idx = levels.indexOf(level)
  if (idx > -1) {
    if (levels.length > 1) {
      levels.splice(idx, 1)
    }
  } else {
    levels.push(level)
  }
  setFilter({ levels })
}

/**
 * 切换通道过滤
 * @param ch 通道号
 */
function toggleChannelFilter(ch: number): void {
  const chs = [...filter.value.channels]
  const idx = chs.indexOf(ch)
  if (idx > -1) {
    if (chs.length > 1) {
      chs.splice(idx, 1)
    }
  } else {
    chs.push(ch)
  }
  setFilter({ channels: chs })
}

/**
 * 处理连接/断开按钮点击
 */
function handleConnectToggle(): void {
  if (isConnected.value) {
    disconnect()
  } else if (canConnect.value) {
    connect()
  }
}

/**
 * 处理发送按钮点击
 */
function handleSend(): void {
  if (!sendInput.value.trim() || !isConnected.value) return
  send(sendInput.value, sendChannel.value)
  sendInput.value = ''
}

/**
 * 处理导出日志
 */
function handleExport(): void {
  const content = exportLogs()
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `rtt_log_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 处理导出会话
 */
function handleExportSession(): void {
  const content = exportSession()
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `rtt_session_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** 监听日志变化自动滚动 */
watch(
  () => filteredLogs.value.length,
  async () => {
    if (autoScroll.value && virtualListRef.value) {
      await nextTick()
      virtualListRef.value.scrollToBottom()
    }
  },
)
</script>

<template>
  <div class="flex h-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
    <!-- 主内容区 -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- 顶部控制栏 -->
      <div class="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
        <div class="flex items-center gap-3 flex-wrap">
          <!-- 状态灯 -->
          <div class="flex items-center gap-2">
            <div
              class="w-2.5 h-2.5 rounded-full shrink-0"
              :class="stateIndicator"
            />
            <span class="text-xs text-slate-500 dark:text-slate-400">
              {{ connectionState === 'connected' ? t('rtt.connected') : connectionState === 'connecting' ? t('rtt.connecting') : t('rtt.disconnected') }}
            </span>
          </div>

          <!-- 分隔线 -->
          <div class="w-px h-5 bg-slate-200 dark:bg-slate-700" />

          <!-- 后端选择 -->
          <div class="flex items-center gap-1.5">
            <label class="text-xs text-slate-500 dark:text-slate-400">{{ t('rtt.backend') }}</label>
            <select
              v-model="backend"
              :disabled="isConnected"
              class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option v-for="opt in backendOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <!-- probe-rs 配置 -->
          <template v-if="backend === 'probe-rs'">
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">{{ t('rtt.chip') }}</label>
              <input
                v-model="chipModel"
                :disabled="isConnected"
                type="text"
                placeholder="STM32F407VGTx"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 w-36 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">{{ t('rtt.protocol') }}</label>
              <select
                v-model="protocol"
                :disabled="isConnected"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="Swd">SWD</option>
                <option value="Jtag">JTAG</option>
              </select>
            </div>
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">{{ t('rtt.probe') }}</label>
              <select
                v-model="selectedProbe"
                :disabled="isConnected"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 max-w-[160px] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="">{{ t('rtt.autoDetect') }}</option>
                <option v-for="probe in probes" :key="probe.identifier" :value="probe.identifier">
                  {{ probe.displayName }}
                </option>
              </select>
              <button
                @click="refreshProbes()"
                :disabled="isConnected"
                class="p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50 transition-colors"
                :title="t('rtt.refreshProbes')"
              >
                <RefreshCw class="w-3.5 h-3.5" />
              </button>
            </div>
          </template>

          <!-- OpenOCD 配置 -->
          <template v-if="backend === 'openocd'">
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">Host</label>
              <input
                v-model="openocdHost"
                :disabled="isConnected"
                type="text"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 w-24 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">Port</label>
              <input
                v-model.number="openocdPort"
                :disabled="isConnected"
                type="number"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 w-16 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
          </template>

          <!-- J-Link 配置 -->
          <template v-if="backend === 'jlink'">
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">Host</label>
              <input
                v-model="jlinkHost"
                :disabled="isConnected"
                type="text"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 w-24 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">Port</label>
              <input
                v-model.number="jlinkPort"
                :disabled="isConnected"
                type="number"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 w-16 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
          </template>

          <!-- 分隔线 -->
          <div class="w-px h-5 bg-slate-200 dark:bg-slate-700" />

          <!-- 连接/断开按钮 -->
          <button
            @click="handleConnectToggle"
            :disabled="connectionState === 'connecting'"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all"
            :class="isConnected
              ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-800'
              : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 border border-green-200 dark:border-green-800 disabled:opacity-50'"
          >
            <Unplug v-if="isConnected" class="w-3.5 h-3.5" />
            <Usb v-else class="w-3.5 h-3.5" />
            {{ connectBtnText }}
          </button>

          <!-- 暂停按钮 -->
          <button
            @click="togglePause()"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-all"
            :class="isPaused
              ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'"
            :title="isPaused ? t('rtt.resume') : t('rtt.pause')"
          >
            <Play v-if="isPaused" class="w-3.5 h-3.5" />
            <Pause v-else class="w-3.5 h-3.5" />
          </button>

          <!-- 清空按钮 -->
          <button
            @click="clearLogs()"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            :title="t('rtt.clearLogs')"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>

          <!-- 导出按钮 -->
          <button
            @click="handleExport"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            :title="t('rtt.exportLogs')"
          >
            <Download class="w-3.5 h-3.5" />
          </button>

          <!-- 自动滚动开关 -->
          <button
            @click="autoScroll = !autoScroll"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-all"
            :class="autoScroll ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
            :title="t('rtt.autoScroll')"
          >
            <Radio class="w-3.5 h-3.5" />
          </button>

          <!-- 右侧面板切换 -->
          <button
            @click="showRightPanel = !showRightPanel"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            :title="t('rtt.togglePanel')"
          >
            <PanelRight class="w-3.5 h-3.5" />
          </button>

          <!-- 帮助按钮 -->
          <button
            @click="showHelpPanel = !showHelpPanel"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-all"
            :class="showHelpPanel ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'"
            :title="t('rtt.help')"
          >
            <HelpCircle class="w-3.5 h-3.5" />
          </button>

          <!-- 统计信息 -->
          <div class="ml-auto flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
            <span>{{ logStats.total }} {{ t('rtt.entries') }}</span>
            <span v-if="logStats.errors > 0" class="text-red-500 dark:text-red-400">
              {{ logStats.errors }} {{ t('rtt.errors') }}
            </span>
            <span v-if="logStats.warnings > 0" class="text-yellow-500 dark:text-yellow-400">
              {{ logStats.warnings }} {{ t('rtt.warnings') }}
            </span>
          </div>
        </div>

        <!-- 错误消息 -->
        <div
          v-if="errorMessage"
          class="mt-2 flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-3 py-1.5"
        >
          <AlertCircle class="w-3.5 h-3.5 shrink-0" />
          <span class="flex-1">{{ errorMessage }}</span>
          <button @click="errorMessage = ''" class="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- 主内容区域 -->
      <div class="flex-1 flex min-h-0">
        <!-- 日志区域 -->
        <div class="flex-1 flex flex-col min-w-0">
          <div class="flex-1 min-h-0 bg-white dark:bg-slate-900">
            <VirtualList
              ref="virtualListRef"
              :items="virtualListItems"
              :item-height="22"
              :buffer="20"
            >
              <template #default="{ item }">
                <div
                  class="flex items-center px-3 text-xs hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                  :class="levelBgMap[(item as any).level]"
                >
                  <!-- 时间戳 -->
                  <span class="text-slate-400 dark:text-slate-500 w-20 shrink-0 select-none">
                    {{ formatTimestamp((item as any).timestamp) }}
                  </span>

                  <!-- 级别标签 -->
                  <span
                    class="w-12 shrink-0 font-semibold select-none"
                    :class="levelColorMap[(item as any).level]"
                  >
                    {{ (item as any).level.toUpperCase() }}
                  </span>

                  <!-- 通道标签 -->
                  <span class="text-slate-400 dark:text-slate-500 w-10 shrink-0 select-none">
                    Ch{{ (item as any).channel }}
                  </span>

                  <!-- 日志内容 -->
                  <span class="flex-1 min-w-0 truncate" :class="levelColorMap[(item as any).level]">
                    {{ (item as any).text }}
                  </span>
                </div>
              </template>
            </VirtualList>

            <!-- 空状态 -->
            <div
              v-if="virtualListItems.length === 0"
              class="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500"
            >
              <Terminal class="w-12 h-12 mb-3 opacity-30" />
              <p class="text-sm">{{ t('rtt.noData') }}</p>
              <p class="text-xs mt-1 text-slate-400 dark:text-slate-600">{{ t('rtt.clickConnect') }}</p>
            </div>
          </div>

          <!-- 底部输入区 -->
          <div class="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2">
            <div class="flex items-center gap-2">
              <!-- 通道选择 -->
              <select
                v-model.number="sendChannel"
                :disabled="!isConnected"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 w-16 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option v-for="ch in channels" :key="ch.number" :value="ch.number">
                  Ch{{ ch.number }}
                </option>
                <option v-if="channels.length === 0" :value="0">Ch0</option>
              </select>

              <!-- 输入框 -->
              <input
                v-model="sendInput"
                type="text"
                :placeholder="t('rtt.sendPlaceholder')"
                :disabled="!isConnected"
                class="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                @keydown.enter="handleSend"
              />

              <!-- 发送按钮 -->
              <button
                @click="handleSend"
                :disabled="!isConnected || !sendInput.trim()"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 disabled:opacity-50 transition-all"
              >
                <Send class="w-3.5 h-3.5" />
                {{ t('rtt.send') }}
              </button>
            </div>
          </div>
        </div>

        <!-- 帮助面板 -->
        <div
          v-if="showHelpPanel"
          class="w-80 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto"
        >
          <div class="p-4">
            <h3 class="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
              <BookOpen class="w-4 h-4" />
              {{ t('rtt.helpTitle') }}
            </h3>

            <div class="space-y-4 text-xs text-slate-600 dark:text-slate-400">
              <!-- Bridge 启动说明 -->
              <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                <h4 class="font-medium text-blue-700 dark:text-blue-300 mb-2">{{ t('rtt.bridgeTitle') }}</h4>
                <p class="mb-2">{{ t('rtt.bridgeDesc') }}</p>
                <div class="bg-slate-800 text-green-400 p-2 rounded font-mono text-[10px] overflow-x-auto">
                  <div># 下载并安装</div>
                  <div>git clone &lt;repo-url&gt;</div>
                  <div>cd rtt-bridge && npm install</div>
                  <div class="mt-1"># 启动服务</div>
                  <div>npm run dev</div>
                </div>
                <p class="mt-2 text-slate-500 dark:text-slate-400">{{ t('rtt.bridgePort') }}</p>
              </div>

              <div>
                <h4 class="font-medium text-slate-700 dark:text-slate-300 mb-1">{{ t('rtt.whatIsRtt') }}</h4>
                <p>{{ t('rtt.rttDesc') }}</p>
              </div>

              <div>
                <h4 class="font-medium text-slate-700 dark:text-slate-300 mb-1">{{ t('rtt.backendTitle') }}</h4>
                <ul class="list-disc list-inside space-y-1">
                  <li><strong>probe-rs:</strong> {{ t('rtt.probeRsDesc') }}</li>
                  <li><strong>OpenOCD:</strong> {{ t('rtt.openocdDesc') }}</li>
                  <li><strong>J-Link:</strong> {{ t('rtt.jlinkDesc') }}</li>
                </ul>
              </div>

              <div>
                <h4 class="font-medium text-slate-700 dark:text-slate-300 mb-1">{{ t('rtt.quickStart') }}</h4>
                <ol class="list-decimal list-inside space-y-1">
                  <li>{{ t('rtt.step1') }}</li>
                  <li>{{ t('rtt.step2') }}</li>
                  <li>{{ t('rtt.step3') }}</li>
                  <li>{{ t('rtt.step4') }}</li>
                </ol>
              </div>

              <div>
                <h4 class="font-medium text-slate-700 dark:text-slate-300 mb-1">{{ t('rtt.tips') }}</h4>
                <ul class="list-disc list-inside space-y-1">
                  <li>{{ t('rtt.tip1') }}</li>
                  <li>{{ t('rtt.tip2') }}</li>
                  <li>{{ t('rtt.tip3') }}</li>
                </ul>
              </div>

              <div class="pt-2 border-t border-slate-200 dark:border-slate-700">
                <h4 class="font-medium text-slate-700 dark:text-slate-300 mb-1">{{ t('rtt.requirements') }}</h4>
                <ul class="list-disc list-inside space-y-1">
                  <li>{{ t('rtt.req1') }}</li>
                  <li>{{ t('rtt.req2') }}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧工具栏 -->
    <div
      v-if="showRightPanel"
      class="w-56 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col"
    >
      <!-- 搜索 -->
      <div class="p-3 border-b border-slate-200 dark:border-slate-800">
        <div class="relative">
          <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            :value="filter.searchText"
            @input="setFilter({ searchText: ($event.target as HTMLInputElement).value })"
            type="text"
            :placeholder="t('rtt.searchPlaceholder')"
            class="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded pl-8 pr-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <!-- 级别过滤 -->
      <div class="p-3 border-b border-slate-200 dark:border-slate-800">
        <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{{ t('rtt.levelFilter') }}</h3>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="opt in levelOptions"
            :key="opt.value"
            @click="toggleLevelFilter(opt.value)"
            class="px-2 py-1 rounded text-[10px] font-semibold border transition-all"
            :class="filter.levels.includes(opt.value)
              ? `${opt.color} ${levelBgMap[opt.value]} border-current/30`
              : 'text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:text-slate-600 dark:hover:text-slate-300'"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- 通道过滤 -->
      <div class="p-3 border-b border-slate-200 dark:border-slate-800">
        <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{{ t('rtt.channelFilter') }}</h3>
        <div v-if="channels.length > 0" class="flex flex-wrap gap-1.5">
          <button
            v-for="ch in channels"
            :key="ch.number"
            @click="toggleChannelFilter(ch.number)"
            class="px-2 py-1 rounded text-[10px] font-semibold border transition-all"
            :class="filter.channels.includes(ch.number)
              ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800'
              : 'text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:text-slate-600 dark:hover:text-slate-300'"
          >
            Ch{{ ch.number }}
          </button>
        </div>
        <p v-else class="text-[10px] text-slate-400 dark:text-slate-500">{{ t('rtt.noChannels') }}</p>
      </div>

      <!-- 导出选项 -->
      <div class="p-3 border-b border-slate-200 dark:border-slate-800">
        <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{{ t('rtt.exportOptions') }}</h3>
        <div class="flex flex-col gap-1.5">
          <button
            @click="handleExport"
            class="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            <Download class="w-3.5 h-3.5" />
            {{ t('rtt.exportTxt') }}
          </button>
          <button
            @click="handleExportSession"
            class="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            <Download class="w-3.5 h-3.5" />
            {{ t('rtt.exportSession') }}
          </button>
        </div>
      </div>

      <!-- 连接信息 -->
      <div class="p-3 mt-auto">
        <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{{ t('rtt.connectionInfo') }}</h3>
        <div class="space-y-1 text-[10px] text-slate-500 dark:text-slate-400">
          <div class="flex justify-between">
            <span>{{ t('rtt.backend') }}</span>
            <span class="text-slate-700 dark:text-slate-300">{{ backend }}</span>
          </div>
          <div class="flex justify-between">
            <span>{{ t('rtt.status') }}</span>
            <span :class="isConnected ? 'text-green-500 dark:text-green-400' : 'text-slate-400 dark:text-slate-500'">
              {{ connectionState }}
            </span>
          </div>
          <div v-if="backend === 'probe-rs'" class="flex justify-between">
            <span>{{ t('rtt.chip') }}</span>
            <span class="text-slate-700 dark:text-slate-300">{{ chipModel }}</span>
          </div>
          <div class="flex justify-between">
            <span>{{ t('rtt.channels') }}</span>
            <span class="text-slate-700 dark:text-slate-300">{{ channels.length }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
