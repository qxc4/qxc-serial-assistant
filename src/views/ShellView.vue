<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useShell, type TerminalLine } from '../composables/useShell'
import { useSerial } from '../composables/useSerial'
import { useI18n } from '../composables/useI18n'

const {
  lines,
  history,
  envVars,
  promptText,
  pendingConfirmation,
  searchMode,
  searchQuery,
  autoScroll,
  outputPaused,
  shellConfig,
  addLine,
  addSystemLine,
  addErrorLine,
  addPromptLine,
  executeCommand,
  confirmDangerousCommand,
  cancelDangerousCommand,
  historyUp,
  historyDown,
  searchHistory,
  clearTerminal,
  clearHistory,
  getCompletions,
} = useShell()

const { isConnected, connect, disconnect, baudRate, onDataReceive } = useSerial()
const { t } = useI18n()

/** 命令输入 */
const commandInput = ref('')

/** 终端容器引用 */
const terminalRef = ref<HTMLElement | null>(null)

/** 输入框引用 */
const inputRef = ref<HTMLInputElement | null>(null)

/** 自动补全列表 */
const completions = ref<string[]>([])

/** 补全列表可见 */
const showCompletions = ref(false)

/** 补全选中索引 */
const completionIndex = ref(0)

/** 搜索结果 */
const searchResults = ref<string[]>([])

/** 搜索选中索引 */
const searchResultIndex = ref(0)

/** 是否显示设置面板 */
const showSettings = ref(false)

/** 是否显示环境变量面板 */
const showEnvPanel = ref(false)

/** 是否显示历史面板 */
const showHistoryPanel = ref(false)

/** 新环境变量 key */
const newEnvKey = ref('')

/** 新环境变量 value */
const newEnvValue = ref('')

/** 终端字体大小 */
const fontSize = computed(() => shellConfig.value.fontSize || 14)

/** 连接状态文本 */
const connectionStatus = computed(() => {
  return isConnected.value ? t('shell.connected') : t('shell.disconnected')
})

/** 连接状态颜色 */
const connectionColor = computed(() => {
  return isConnected.value ? 'text-emerald-400' : 'text-red-400'
})

/**
 * 获取行的 CSS 类名
 * @param line 终端行
 * @returns CSS 类名字符串
 */
function getLineClass(line: TerminalLine): string {
  const base = 'font-mono whitespace-pre-wrap break-all leading-relaxed'
  switch (line.type) {
    case 'input': return `${base} text-cyan-300`
    case 'output': return `${base} text-slate-200`
    case 'error': return `${base} text-red-400`
    case 'system': return `${base} text-yellow-400`
    case 'prompt': return `${base} text-emerald-400`
    default: return `${base} text-slate-200`
  }
}

/**
 * 格式化行文本（含时间戳）
 * @param line 终端行
 * @returns 格式化后的文本
 */
function formatLineText(line: TerminalLine): string {
  if (shellConfig.value.showTimestamp) {
    const time = new Date(line.timestamp).toLocaleTimeString('zh-CN', { hour12: false })
    return `[${time}] ${line.text}`
  }
  return line.text
}

/**
 * 提交命令
 */
async function submitCommand(): Promise<void> {
  const cmd = commandInput.value
  if (!cmd.trim()) return

  commandInput.value = ''
  showCompletions.value = false
  completions.value = []

  await executeCommand(cmd)
  await nextTick()
  scrollToBottom()
}

/**
 * 处理键盘事件
 * @param event 键盘事件
 */
function handleKeyDown(event: KeyboardEvent): void {
  // Ctrl+R 搜索模式
  if (event.ctrlKey && event.key === 'r') {
    event.preventDefault()
    searchMode.value = !searchMode.value
    if (searchMode.value) {
      searchQuery.value = ''
      searchResults.value = []
    }
    return
  }

  // Ctrl+C 取消/中断
  if (event.ctrlKey && event.key === 'c') {
    event.preventDefault()
    if (pendingConfirmation.value) {
      cancelDangerousCommand()
    } else {
      commandInput.value = ''
      addLine('^C', 'system')
    }
    return
  }

  // Ctrl+L 清屏
  if (event.ctrlKey && event.key === 'l') {
    event.preventDefault()
    clearTerminal()
    return
  }

  // 搜索模式下的键盘处理
  if (searchMode.value) {
    handleSearchKeyDown(event)
    return
  }

  // Tab 自动补全
  if (event.key === 'Tab') {
    event.preventDefault()
    handleTabCompletion()
    return
  }

  // 上箭头 - 历史上翻
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    commandInput.value = historyUp(commandInput.value)
    return
  }

  // 下箭头 - 历史下翻
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    commandInput.value = historyDown()
    return
  }

  // Enter 提交
  if (event.key === 'Enter') {
    event.preventDefault()
    submitCommand()
    return
  }

  // Escape 关闭补全
  if (event.key === 'Escape') {
    showCompletions.value = false
    return
  }
}

/**
 * 处理搜索模式下的键盘事件
 * @param event 键盘事件
 */
function handleSearchKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    searchMode.value = false
    searchQuery.value = ''
    searchResults.value = []
    return
  }

  if (event.key === 'Enter') {
    if (searchResults.value.length > 0) {
      commandInput.value = searchResults.value[searchResultIndex.value]
    }
    searchMode.value = false
    searchQuery.value = ''
    searchResults.value = []
    return
  }

  if (event.key === 'ArrowUp' && searchResults.value.length > 0) {
    event.preventDefault()
    searchResultIndex.value = Math.max(0, searchResultIndex.value - 1)
    return
  }

  if (event.key === 'ArrowDown' && searchResults.value.length > 0) {
    event.preventDefault()
    searchResultIndex.value = Math.min(searchResults.value.length - 1, searchResultIndex.value + 1)
    return
  }
}

/**
 * 处理 Tab 自动补全
 */
function handleTabCompletion(): void {
  const input = commandInput.value
  if (!input) return

  if (showCompletions.value && completions.value.length > 0) {
    completionIndex.value = (completionIndex.value + 1) % completions.value.length
    commandInput.value = completions.value[completionIndex.value]
    return
  }

  const results = getCompletions(input)
  if (results.length === 1) {
    commandInput.value = results[0]
    showCompletions.value = false
  } else if (results.length > 1) {
    completions.value = results
    completionIndex.value = 0
    showCompletions.value = true
    commandInput.value = results[0]
  }
}

/**
 * 滚动到底部
 */
function scrollToBottom(): void {
  if (!terminalRef.value || !autoScroll.value) return
  nextTick(() => {
    if (terminalRef.value) {
      terminalRef.value.scrollTop = terminalRef.value.scrollHeight
    }
  })
}

/**
 * 点击终端区域聚焦输入框
 */
function focusInput(): void {
  inputRef.value?.focus()
}

/**
 * 处理连接/断开
 */
async function toggleConnection(): Promise<void> {
  if (isConnected.value) {
    await disconnect()
    addSystemLine(t('shell.disconnectedMsg'))
  } else {
    try {
      await connect()
      addSystemLine(t('shell.connectedMsg'))
    } catch {
      addErrorLine(t('shell.connectFailed'))
    }
  }
}

/**
 * 添加环境变量
 */
function addEnvVar(): void {
  const key = newEnvKey.value.trim()
  const value = newEnvValue.value.trim()
  if (!key) return
  const existing = envVars.value.find(v => v.key === key)
  if (existing) {
    existing.value = value
  } else {
    envVars.value.push({ key, value })
  }
  newEnvKey.value = ''
  newEnvValue.value = ''
}

/**
 * 删除环境变量
 * @param key 变量名
 */
function removeEnvVar(key: string): void {
  const idx = envVars.value.findIndex(v => v.key === key)
  if (idx !== -1) {
    envVars.value.splice(idx, 1)
  }
}

/**
 * 从历史记录中选择命令
 * @param cmd 命令
 */
function selectFromHistory(cmd: string): void {
  commandInput.value = cmd
  showHistoryPanel.value = false
  inputRef.value?.focus()
}

/**
 * 从补全列表选择
 * @param cmd 命令
 */
function selectCompletion(cmd: string): void {
  commandInput.value = cmd
  showCompletions.value = false
}

/** 监听搜索输入 */
watch(searchQuery, (query) => {
  if (searchMode.value && query) {
    searchResults.value = searchHistory(query)
    searchResultIndex.value = 0
  } else {
    searchResults.value = []
  }
})

/** 监听终端行变化自动滚动 */
watch(lines, () => {
  if (autoScroll.value) {
    scrollToBottom()
  }
})

/** 监听接收数据 */
let unregisterCallback: (() => void) | null = null

onMounted(() => {
  addSystemLine(t('shell.welcome'))
  addSystemLine(t('shell.typeHelp'))
  addPromptLine(promptText.value)

  unregisterCallback = onDataReceive((data: Uint8Array, _direction: 'rx' | 'tx') => {
    if (outputPaused.value) return
    const decoder = new TextDecoder()
    const text = decoder.decode(data)
    const textLines = text.split('\n')
    textLines.forEach(line => {
      if (line || textLines.length === 1) {
        addLine(line, 'output')
      }
    })
  })
})

onUnmounted(() => {
  if (unregisterCallback) {
    unregisterCallback()
    unregisterCallback = null
  }
})
</script>

<template>
  <div class="flex flex-col h-full bg-slate-950 text-slate-200">
    <!-- 顶部工具栏 -->
    <div class="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
      <div class="flex items-center gap-3">
        <!-- 连接状态 -->
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full" :class="isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'" />
          <span class="text-xs font-medium" :class="connectionColor">{{ connectionStatus }}</span>
        </div>

        <!-- 波特率 -->
        <select
          v-model="baudRate"
          :disabled="isConnected"
          class="text-xs border border-slate-700 rounded px-2 py-1 bg-slate-800 text-slate-300 outline-none disabled:opacity-50"
        >
          <option :value="9600">9600</option>
          <option :value="19200">19200</option>
          <option :value="38400">38400</option>
          <option :value="57600">57600</option>
          <option :value="115200">115200</option>
          <option :value="230400">230400</option>
          <option :value="460800">460800</option>
          <option :value="921600">921600</option>
        </select>

        <!-- 连接/断开按钮 -->
        <button
          @click="toggleConnection"
          class="text-xs px-3 py-1 rounded font-medium transition-colors"
          :class="isConnected 
            ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30' 
            : 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-600/30'"
        >
          {{ isConnected ? t('shell.disconnect') : t('shell.connect') }}
        </button>
      </div>

      <div class="flex items-center gap-2">
        <!-- 输出暂停状态 -->
        <span v-if="outputPaused" class="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded">
          {{ t('shell.paused') }}
        </span>

        <!-- 自动滚动 -->
        <label class="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
          <input type="checkbox" v-model="autoScroll" class="rounded">
          {{ t('shell.autoScroll') }}
        </label>

        <!-- 环境变量 -->
        <button
          @click="showEnvPanel = !showEnvPanel"
          class="text-xs px-2 py-1 rounded transition-colors"
          :class="showEnvPanel ? 'bg-blue-600/20 text-blue-400' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'"
          :title="t('shell.envVars')"
        >
          {{ t('shell.envVars') }}
        </button>

        <!-- 历史记录 -->
        <button
          @click="showHistoryPanel = !showHistoryPanel"
          class="text-xs px-2 py-1 rounded transition-colors"
          :class="showHistoryPanel ? 'bg-blue-600/20 text-blue-400' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'"
          :title="t('shell.commandHistory')"
        >
          {{ t('shell.commandHistory') }}
        </button>

        <!-- 设置 -->
        <button
          @click="showSettings = !showSettings"
          class="text-xs px-2 py-1 rounded transition-colors"
          :class="showSettings ? 'bg-blue-600/20 text-blue-400' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'"
          :title="t('shell.settings')"
        >
          ⚙
        </button>

        <!-- 清屏 -->
        <button
          @click="clearTerminal"
          class="text-xs px-2 py-1 rounded bg-slate-800 text-slate-400 hover:bg-slate-700 transition-colors"
          :title="t('shell.clear')"
        >
          {{ t('shell.clear') }}
        </button>
      </div>
    </div>

    <!-- 主内容区域 -->
    <div class="flex-1 flex overflow-hidden">
      <!-- 终端区域 -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- 终端输出 -->
        <div
          ref="terminalRef"
          class="flex-1 overflow-y-auto p-4"
          :style="{ fontSize: `${fontSize}px` }"
          @click="focusInput"
        >
          <div
            v-for="line in lines"
            :key="line.id"
            :class="getLineClass(line)"
            class="min-h-[1.6em]"
          >
            {{ formatLineText(line) }}
          </div>
        </div>

        <!-- 搜索栏 -->
        <div v-if="searchMode" class="flex items-center gap-2 px-4 py-2 bg-slate-900 border-t border-slate-800">
          <span class="text-xs text-yellow-400 font-mono">bck-i-search:</span>
          <input
            v-model="searchQuery"
            type="text"
            class="flex-1 text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 outline-none focus:border-blue-500 font-mono"
            :placeholder="t('shell.searchPlaceholder')"
          />
          <div v-if="searchResults.length > 0" class="text-xs text-slate-400">
            {{ searchResultIndex + 1 }}/{{ searchResults.length }}
          </div>
          <button @click="searchMode = false; searchQuery = ''" class="text-xs text-slate-400 hover:text-slate-200">✕</button>
        </div>

        <!-- 自动补全列表 -->
        <div
          v-if="showCompletions && completions.length > 0"
          class="absolute bottom-20 left-4 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto z-50"
        >
          <div
            v-for="(cmd, i) in completions"
            :key="cmd"
            @click="selectCompletion(cmd)"
            class="px-3 py-1.5 text-xs font-mono cursor-pointer transition-colors"
            :class="i === completionIndex ? 'bg-blue-600/30 text-blue-300' : 'text-slate-300 hover:bg-slate-700'"
          >
            {{ cmd }}
          </div>
        </div>

        <!-- 危险命令确认 -->
        <div
          v-if="pendingConfirmation"
          class="flex items-center gap-3 px-4 py-2 bg-red-900/30 border-t border-red-600/30"
        >
          <span class="text-xs text-red-400 font-medium">
            ⚠ {{ t('shell.dangerousCommand') }}: <span class="font-mono">{{ pendingConfirmation.command }}</span>
          </span>
          <button
            @click="confirmDangerousCommand"
            class="text-xs px-3 py-1 rounded bg-red-600 text-white hover:bg-red-500 transition-colors"
          >
            {{ t('shell.confirm') }}
          </button>
          <button
            @click="cancelDangerousCommand"
            class="text-xs px-3 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
          >
            {{ t('shell.cancel') }}
          </button>
        </div>

        <!-- 命令输入区域 -->
        <div class="flex items-center gap-2 px-4 py-3 bg-slate-900 border-t border-slate-800 shrink-0">
          <span class="text-emerald-400 font-mono shrink-0" :style="{ fontSize: `${fontSize}px` }">
            {{ promptText }}
          </span>
          <input
            ref="inputRef"
            v-model="commandInput"
            type="text"
            class="flex-1 bg-transparent text-slate-200 outline-none font-mono caret-emerald-400"
            :style="{ fontSize: `${fontSize}px` }"
            :placeholder="t('shell.inputPlaceholder')"
            :disabled="!!pendingConfirmation"
            @keydown="handleKeyDown"
            spellcheck="false"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
          />
          <button
            @click="submitCommand"
            :disabled="!commandInput.trim() || !!pendingConfirmation"
            class="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {{ t('shell.send') }}
          </button>
        </div>
      </div>

      <!-- 右侧面板 - 环境变量 -->
      <div
        v-if="showEnvPanel"
        class="w-64 shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden"
      >
        <div class="flex items-center justify-between px-3 py-2 border-b border-slate-800">
          <span class="text-xs font-medium text-slate-300">{{ t('shell.envVars') }}</span>
          <button @click="showEnvPanel = false" class="text-xs text-slate-500 hover:text-slate-300">✕</button>
        </div>

        <!-- 添加变量 -->
        <div class="px-3 py-2 border-b border-slate-800 space-y-1.5">
          <input
            v-model="newEnvKey"
            type="text"
            :placeholder="t('shell.envKey')"
            class="w-full text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 outline-none focus:border-blue-500 font-mono"
          />
          <input
            v-model="newEnvValue"
            type="text"
            :placeholder="t('shell.envValue')"
            class="w-full text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 outline-none focus:border-blue-500 font-mono"
          />
          <button
            @click="addEnvVar"
            :disabled="!newEnvKey.trim()"
            class="w-full text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {{ t('shell.addEnv') }}
          </button>
        </div>

        <!-- 变量列表 -->
        <div class="flex-1 overflow-y-auto">
          <div
            v-for="v in envVars"
            :key="v.key"
            class="flex items-center justify-between px-3 py-1.5 hover:bg-slate-800/50 transition-colors"
          >
            <div class="flex-1 min-w-0">
              <span class="text-xs font-mono text-cyan-400">{{ v.key }}</span>
              <span class="text-xs text-slate-500 mx-1">=</span>
              <span class="text-xs font-mono text-slate-300 truncate">{{ v.value }}</span>
            </div>
            <button
              @click="removeEnvVar(v.key)"
              class="text-xs text-slate-500 hover:text-red-400 ml-2 shrink-0"
            >
              ✕
            </button>
          </div>
          <div v-if="envVars.length === 0" class="px-3 py-4 text-xs text-slate-500 text-center">
            {{ t('shell.noEnvVars') }}
          </div>
        </div>

        <!-- 使用提示 -->
        <div class="px-3 py-2 border-t border-slate-800">
          <p class="text-[10px] text-slate-500">{{ t('shell.envUsage') }}</p>
        </div>
      </div>

      <!-- 右侧面板 - 历史记录 -->
      <div
        v-if="showHistoryPanel"
        class="w-72 shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden"
      >
        <div class="flex items-center justify-between px-3 py-2 border-b border-slate-800">
          <span class="text-xs font-medium text-slate-300">{{ t('shell.commandHistory') }}</span>
          <div class="flex items-center gap-2">
            <button
              @click="clearHistory"
              :disabled="history.length === 0"
              class="text-xs text-slate-500 hover:text-red-400 disabled:opacity-50"
            >
              {{ t('shell.clearHistory') }}
            </button>
            <button @click="showHistoryPanel = false" class="text-xs text-slate-500 hover:text-slate-300">✕</button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto">
          <div
            v-for="(entry, i) in [...history].reverse()"
            :key="i"
            @click="selectFromHistory(entry.command)"
            class="px-3 py-1.5 hover:bg-slate-800/50 cursor-pointer transition-colors group"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-mono text-slate-300 truncate flex-1">{{ entry.command }}</span>
              <span class="text-[10px] text-slate-600 ml-2 shrink-0">
                {{ new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false }) }}
              </span>
            </div>
          </div>
          <div v-if="history.length === 0" class="px-3 py-4 text-xs text-slate-500 text-center">
            {{ t('shell.noHistory') }}
          </div>
        </div>
      </div>

      <!-- 右侧面板 - 设置 -->
      <div
        v-if="showSettings"
        class="w-64 shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden"
      >
        <div class="flex items-center justify-between px-3 py-2 border-b border-slate-800">
          <span class="text-xs font-medium text-slate-300">{{ t('shell.settings') }}</span>
          <button @click="showSettings = false" class="text-xs text-slate-500 hover:text-slate-300">✕</button>
        </div>

        <div class="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          <!-- 回显命令 -->
          <label class="flex items-center justify-between">
            <span class="text-xs text-slate-400">{{ t('shell.echoCommands') }}</span>
            <input type="checkbox" v-model="shellConfig.echoCommands" class="rounded">
          </label>

          <!-- 显示时间戳 -->
          <label class="flex items-center justify-between">
            <span class="text-xs text-slate-400">{{ t('shell.showTimestamp') }}</span>
            <input type="checkbox" v-model="shellConfig.showTimestamp" class="rounded">
          </label>

          <!-- 危险命令确认 -->
          <label class="flex items-center justify-between">
            <span class="text-xs text-slate-400">{{ t('shell.confirmDangerous') }}</span>
            <input type="checkbox" v-model="shellConfig.confirmDangerous" class="rounded">
          </label>

          <!-- 提示符 -->
          <div>
            <span class="text-xs text-slate-400 block mb-1">{{ t('shell.promptLabel') }}</span>
            <input
              v-model="shellConfig.prompt"
              type="text"
              class="w-full text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <!-- 字体大小 -->
          <div>
            <span class="text-xs text-slate-400 block mb-1">{{ t('shell.fontSize') }}: {{ shellConfig.fontSize }}px</span>
            <input
              v-model.number="shellConfig.fontSize"
              type="range"
              min="10"
              max="24"
              step="1"
              class="w-full"
            />
          </div>

          <!-- 最大历史数 -->
          <div>
            <span class="text-xs text-slate-400 block mb-1">{{ t('shell.maxHistory') }}: {{ shellConfig.maxHistory }}</span>
            <input
              v-model.number="shellConfig.maxHistory"
              type="range"
              min="50"
              max="2000"
              step="50"
              class="w-full"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
input[type="checkbox"] {
  accent-color: #3b82f6;
}

input[type="range"] {
  accent-color: #3b82f6;
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #334155;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #475569;
}
</style>
