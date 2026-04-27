<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useRtt, BACKEND_REQUIREMENTS } from '../composables/useRtt'
import { useWebUsbRtt } from '../composables/useWebUsbRtt'
import { useBridgeStatus, getPlatformGuide } from '../composables/useBridgeStatus'
import { useI18n } from '../composables/useI18n'
import VirtualList from '../components/VirtualList.vue'
import type { RttLogLevel, RttBackend, BackendCapabilities } from '../types/rtt'
import {
  Usb, Unplug, Play, Pause, Send,
  RefreshCw, Download, Trash2, Search,
  AlertCircle, Radio, Terminal, X, HelpCircle,
  PanelRight, BookOpen, Cpu, Zap, Wifi, WifiOff, Copy, Check, Info
} from 'lucide-vue-next'

/** 连接状态颜色映射（静态常量，提取到模块级别避免每次实例重建） */
const STATE_COLOR_MAP: Record<string, string> = {
  disconnected: 'bg-slate-400',
  connecting: 'bg-yellow-500 animate-pulse',
  connected: 'bg-green-500',
  error: 'bg-red-500',
}

/** 日志级别颜色映射 */
const LEVEL_COLOR_MAP: Record<string, string> = {
  trace: 'text-slate-500 dark:text-slate-400',
  debug: 'text-blue-600 dark:text-blue-400',
  info: 'text-green-600 dark:text-green-400',
  warn: 'text-yellow-600 dark:text-yellow-400',
  error: 'text-red-600 dark:text-red-400',
}

/** 日志级别背景色映射 */
const LEVEL_BG_MAP: Record<string, string> = {
  trace: 'bg-slate-100 dark:bg-slate-800/50',
  debug: 'bg-blue-50 dark:bg-blue-900/20',
  info: 'bg-green-50 dark:bg-green-900/20',
  warn: 'bg-yellow-50 dark:bg-yellow-900/20',
  error: 'bg-red-50 dark:bg-red-900/20',
}

const { t } = useI18n()

// WebSocket RTT (传统方式)
const wsRtt = useRtt()

// WebUSB RTT (直接连接)
const webUsbRtt = useWebUsbRtt()

// Bridge 状态检测
const bridgeStatus = useBridgeStatus()

/** 当前使用的后端 */
const backend = ref<RttBackend>('probe-rs')

/** 是否使用 WebUSB 模式 */
const isWebUsbMode = computed(() => backend.value === 'webusb')

/** 是否需要 Bridge */
const needsBridge = computed(() => backend.value !== 'webusb')

/** Bridge 是否离线 */
const isBridgeOffline = computed(() => needsBridge.value && bridgeStatus.status.value === 'offline')

/** 平台启动指引 */
const platformGuide = getPlatformGuide()

/** 是否显示 Bridge 离线提示 */
const showBridgeWarning = ref(true)

/** 是否已复制命令 */
const copiedCommand = ref(false)

/** 当前后端的能力信息 */
const currentBackendCapabilities = computed(() => {
  if (isWebUsbMode.value) return undefined
  return wsRtt.backendCapabilities.value.find((c: BackendCapabilities) => c.name === backend.value)
})

/** 当前后端是否可用 */
const isCurrentBackendAvailable = computed(() => {
  if (isWebUsbMode.value) return webUsbRtt.isSupported.value
  return currentBackendCapabilities.value?.available ?? false
})

/** 当前后端的使用条件 */
const currentBackendRequirements = computed(() => {
  return BACKEND_REQUIREMENTS[backend.value]
})

/** 是否显示后端不可用提示 */
const showBackendUnavailable = computed(() => {
  return needsBridge.value && !isBridgeOffline.value && !isCurrentBackendAvailable.value
})

/** 当 Bridge 连接后检测能力 */
watch(() => bridgeStatus.status.value, (status) => {
  if (status === 'online' && needsBridge.value) {
    wsRtt.checkCapabilities()
  }
})

/** 组件挂载时，仅在 Bridge 已在线且当前未检测过能力时检测 */
onMounted(() => {
  if (bridgeStatus.status.value === 'online' && needsBridge.value && wsRtt.backendCapabilities.value.length === 0) {
    wsRtt.checkCapabilities()
  }
})

/**
 * 复制启动命令
 */
async function copyCommand(): Promise<void> {
  try {
    await navigator.clipboard.writeText(platformGuide.command)
    copiedCommand.value = true
    setTimeout(() => {
      copiedCommand.value = false
    }, 2000)
  } catch {
    // 忽略复制失败
  }
}

/**
 * 关闭 Bridge 离线提示
 */
function dismissBridgeWarning(): void {
  showBridgeWarning.value = false
}

/** 是否显示 Bridge 启动弹窗 */
const showBridgeModal = ref(false)

/** 是否显示下载脚本下拉菜单 */
const showDownloadDropdown = ref(false)

/** 下载下拉菜单容器引用 */
const downloadDropdownRef = ref<HTMLElement | null>(null)

/** 点击外部关闭下拉菜单 */
onClickOutside(downloadDropdownRef, () => {
  showDownloadDropdown.value = false
})

/**
 * 打开 Bridge 启动弹窗
 */
function openBridgeModal(): void {
  showBridgeModal.value = true
}

/**
 * 关闭 Bridge 启动弹窗
 */
function closeBridgeModal(): void {
  showBridgeModal.value = false
}

/**
 * 下载 start.bat 文件
 */
function downloadStartBat(): void {
  const batContent = `@echo off
chcp 65001 >nul
title QXC Serial RTT Bridge

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║           QXC Serial RTT Bridge 启动器                     ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

:: 设置 RTT Bridge 目录路径（请根据实际情况修改）
:: 如果自动检测失败，请手动修改下面的路径
set "BRIDGE_DIR="

:: 尝试自动检测路径
if not exist "%BRIDGE_DIR%" (
    if exist "%~dp0rtt-bridge" (
        set "BRIDGE_DIR=%~dp0rtt-bridge"
    ) else if exist "%~dp0..\\rtt-bridge" (
        set "BRIDGE_DIR=%~dp0..\\rtt-bridge"
    ) else if exist "%USERPROFILE%\\Desktop\\串口助手\\qxc\\serial-assistant\\rtt-bridge" (
        set "BRIDGE_DIR=%USERPROFILE%\\Desktop\\串口助手\\qxc\\serial-assistant\\rtt-bridge"
    ) else if exist "%USERPROFILE%\\Desktop\\串口助手\\rtt-bridge" (
        set "BRIDGE_DIR=%USERPROFILE%\\Desktop\\串口助手\\rtt-bridge"
    )
)

:: 检查目录是否存在
if not exist "%BRIDGE_DIR%" (
    echo [错误] 无法找到 rtt-bridge 目录
    echo.
    echo 请执行以下步骤：
    echo 1. 右键编辑此脚本
    echo 2. 找到 "set BRIDGE_DIR=" 行
    echo 3. 修改为您的 rtt-bridge 实际路径
    echo    例如: set "BRIDGE_DIR=D:\\Projects\\serial-assistant\\rtt-bridge"
    echo.
    pause
    exit /b 1
)

echo [信息] RTT Bridge 目录: %BRIDGE_DIR%
echo.

:: 切换到 Bridge 目录
cd /d "%BRIDGE_DIR%"

:: 检查 Node.js 是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

:: 检查 node_modules 是否存在
if not exist "node_modules" (
    echo [提示] 首次运行，正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

:: 检查是否已编译
if not exist "dist\\index.js" (
    echo [提示] 正在编译...
    call npm run build
    if %errorlevel% neq 0 (
        echo [错误] 编译失败
        pause
        exit /b 1
    )
)

echo [启动] RTT Bridge 服务启动中...
echo.
node dist/index.js

pause
`

  const blob = new Blob([batContent], { type: 'application/bat' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'start-rtt-bridge.bat'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 下载 start.sh 文件
 */
function downloadStartSh(): void {
  const shContent = `#!/bin/bash

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║           QXC Serial RTT Bridge 启动器                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 设置 RTT Bridge 目录路径（请根据实际情况修改）
BRIDGE_DIR=""

# 尝试自动检测路径
if [ -z "$BRIDGE_DIR" ] || [ ! -d "$BRIDGE_DIR" ]; then
    SCRIPT_DIR="\$(cd "\$(dirname "\$0")" 2>/dev/null && pwd)"

    if [ -d "\$SCRIPT_DIR/rtt-bridge" ]; then
        BRIDGE_DIR="\$SCRIPT_DIR/rtt-bridge"
    elif [ -d "\$SCRIPT_DIR/../rtt-bridge" ]; then
        BRIDGE_DIR="\$SCRIPT_DIR/../rtt-bridge"
    elif [ -d "\$HOME/Desktop/串口助手/qxc/serial-assistant/rtt-bridge" ]; then
        BRIDGE_DIR="\$HOME/Desktop/串口助手/qxc/serial-assistant/rtt-bridge"
    elif [ -d "\$HOME/Desktop/串口助手/rtt-bridge" ]; then
        BRIDGE_DIR="\$HOME/Desktop/串口助手/rtt-bridge"
    fi
fi

# 检查目录是否存在
if [ ! -d "\$BRIDGE_DIR" ]; then
    echo "[错误] 无法找到 rtt-bridge 目录"
    echo ""
    echo "请执行以下步骤："
    echo "1. 编辑此脚本"
    echo "2. 找到 BRIDGE_DIR= 行"
    echo "3. 修改为您的 rtt-bridge 实际路径"
    echo "   例如: BRIDGE_DIR=\"/home/user/projects/serial-assistant/rtt-bridge\""
    echo ""
    exit 1
fi

echo "[信息] RTT Bridge 目录: \$BRIDGE_DIR"
echo ""

# 切换到 Bridge 目录
cd "\$BRIDGE_DIR" || exit 1

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未检测到 Node.js，请先安装 Node.js"
    echo "下载地址: https://nodejs.org/"
    exit 1
fi

# 检查 node_modules
if [ ! -d "node_modules" ]; then
    echo "[提示] 首次运行，正在安装依赖..."
    npm install
    if [ \$? -ne 0 ]; then
        echo "[错误] 依赖安装失败"
        exit 1
    fi
fi

# 检查编译
if [ ! -f "dist/index.js" ]; then
    echo "[提示] 正在编译..."
    npm run build
    if [ \$? -ne 0 ]; then
        echo "[错误] 编译失败"
        exit 1
    fi
fi

echo "[启动] RTT Bridge 服务启动中..."
echo ""
node dist/index.js
`

  const blob = new Blob([shContent], { type: 'application/x-sh' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'start-rtt-bridge.sh'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ==================== 统一的状态接口 ====================

/** 统一的连接状态 */
const connectionState = computed(() => {
  if (isWebUsbMode.value) {
    // WebUSB 状态映射
    const stateMap: Record<string, string> = {
      disconnected: 'disconnected',
      requesting: 'connecting',
      connecting: 'connecting',
      connected: 'connected',
      scanning: 'connecting',
      running: 'connected',
      error: 'error',
    }
    return stateMap[webUsbRtt.state.value] || 'disconnected'
  }
  return wsRtt.connectionState.value
})

/** 是否已连接 */
const isConnected = computed(() => {
  if (isWebUsbMode.value) {
    return webUsbRtt.isConnected.value
  }
  return wsRtt.isConnected.value
})

/** 通道列表 */
const channels = computed(() => {
  if (isWebUsbMode.value) {
    return webUsbRtt.channels.value
  }
  return wsRtt.channels.value
})

/** 过滤器 */
const filter = computed(() => wsRtt.filter.value)

/** 是否暂停 */
const isPaused = computed(() => {
  if (isWebUsbMode.value) {
    return webUsbRtt.isPaused.value
  }
  return wsRtt.isPaused.value
})

/** 自动滚动 */
const autoScroll = ref(true)

/** 错误消息 */
const errorMessage = computed(() => {
  if (isWebUsbMode.value) {
    return webUsbRtt.error.value?.message || ''
  }
  return wsRtt.errorMessage.value
})

/** 日志统计 */
const logStats = computed(() => wsRtt.logStats.value)

/** 过滤后的日志 */
const filteredLogs = computed(() => {
  if (isWebUsbMode.value) {
    // WebUSB 模式：本地过滤
    let logs = webUsbRtt.logs.value
    const f = filter.value

    // 级别过滤
    if (f.levels.length < 5) {
      logs = logs.filter(log => f.levels.includes(log.level))
    }

    // 通道过滤
    if (f.channels.length > 0) {
      logs = logs.filter(log => f.channels.includes(log.channel))
    }

    // 文本搜索
    if (f.searchText.trim()) {
      const query = f.searchText.toLowerCase()
      logs = logs.filter(log => log.text.toLowerCase().includes(query))
    }

    return logs
  }
  return wsRtt.filteredLogs.value
})

// ==================== probe-rs 配置 ====================

const elfPath = wsRtt.elfPath
const chipModel = wsRtt.chipModel
const protocol = wsRtt.protocol
const selectedProbe = wsRtt.selectedProbe
const probes = wsRtt.probes

// ==================== OpenOCD 配置 ====================

const openocdHost = wsRtt.openocdHost
const openocdPort = wsRtt.openocdPort

// ==================== J-Link 配置 ====================

const jlinkHost = wsRtt.jlinkHost
const jlinkPort = wsRtt.jlinkPort

// ==================== WebUSB 配置 ====================

/** WebUSB SWD 频率选项 */
const frequencyOptions = [
  { value: 1000000, label: '1 MHz' },
  { value: 2000000, label: '2 MHz' },
  { value: 4000000, label: '4 MHz' },
  { value: 8000000, label: '8 MHz' },
  { value: 16000000, label: '16 MHz' },
]

/** WebUSB 配置 */
const webUsbFrequency = ref(4000000)
const webUsbProtocol = ref<'swd' | 'jtag'>('swd')

/** WebUSB 探针信息显示 */
const webUsbProbeName = computed(() => {
  return webUsbRtt.probe.value?.displayName || '未选择设备'
})

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
const backendOptions: Array<{ value: RttBackend; label: string; icon?: any }> = [
  { value: 'webusb', label: 'WebUSB (直连)', icon: Zap },
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


/** 当前连接状态指示灯颜色 */
const stateIndicator = computed(() => STATE_COLOR_MAP[connectionState.value] ?? 'bg-slate-400')

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
  wsRtt.setFilter({ levels })
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
  wsRtt.setFilter({ channels: chs })
}

/**
 * 处理连接/断开按钮点击
 */
async function handleConnectToggle(): Promise<void> {
  if (isConnected.value) {
    await handleDisconnect()
  } else if (canConnect.value) {
    await handleConnect()
  }
}

/**
 * 处理连接
 */
async function handleConnect(): Promise<void> {
  if (isWebUsbMode.value) {
    // WebUSB 模式
    const success = await webUsbRtt.connect(webUsbFrequency.value)
    if (!success) {
      console.log('[RTT] WebUSB 连接失败')
    }
  } else {
    // WebSocket 模式
    wsRtt.connect()
  }
}

/**
 * 处理断开
 */
async function handleDisconnect(): Promise<void> {
  if (isWebUsbMode.value) {
    await webUsbRtt.disconnect()
  } else {
    wsRtt.disconnect()
  }
}

/**
 * 处理发送按钮点击
 */
function handleSend(): void {
  if (!sendInput.value.trim() || !isConnected.value) return

  if (isWebUsbMode.value) {
    webUsbRtt.send(sendInput.value, sendChannel.value)
  } else {
    wsRtt.send(sendInput.value, sendChannel.value)
  }
  sendInput.value = ''
}

/**
 * 处理清空日志
 */
function handleClearLogs(): void {
  if (isWebUsbMode.value) {
    webUsbRtt.clearLogs()
  } else {
    wsRtt.clearLogs()
  }
}

/**
 * 处理暂停/恢复
 */
function handleTogglePause(): void {
  if (isWebUsbMode.value) {
    webUsbRtt.togglePause()
  } else {
    wsRtt.togglePause()
  }
}

/**
 * 处理导出日志
 */
function handleExport(): void {
  const logs = isWebUsbMode.value ? webUsbRtt.logs.value : filteredLogs.value
  const content = logs.map(log => {
    const d = new Date(log.timestamp)
    const ts = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`
    return `[${ts}] [${log.level.toUpperCase()}] Ch${log.channel}: ${log.text}`
  }).join('\n')

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
  const content = wsRtt.exportSession()
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

/**
 * 选择 WebUSB 设备
 */
async function handleSelectWebUsbDevice(): Promise<void> {
  await webUsbRtt.requestDevice()
}

/**
 * 选择 ELF 文件
 */
function selectElfFile(): void {
  wsRtt.selectElfFile()
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
            <!-- ELF 文件路径 -->
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">ELF</label>
              <input
                v-model="elfPath"
                :disabled="isConnected"
                type="text"
                placeholder="固件 ELF 文件路径"
                class="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 min-w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                readonly
                @click="selectElfFile"
              />
              <button
                @click="selectElfFile"
                :disabled="isConnected"
                class="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-50 transition-colors"
                title="选择 ELF 文件"
              >
                <Search class="w-3.5 h-3.5" />
              </button>
            </div>
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
                @click="wsRtt.refreshProbes()"
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

          <!-- WebUSB 配置 -->
          <template v-if="backend === 'webusb'">
            <!-- 选择设备按钮 -->
            <button
              @click="handleSelectWebUsbDevice"
              :disabled="isConnected"
              class="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-all"
              :class="webUsbRtt.probe.value
                ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'"
            >
              <Cpu class="w-3.5 h-3.5" />
              {{ webUsbRtt.probe.value ? webUsbProbeName : '选择设备' }}
            </button>

            <!-- 协议选择 -->
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">协议</label>
              <select
                v-model="webUsbProtocol"
                :disabled="isConnected"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="swd">SWD</option>
                <option value="jtag">JTAG</option>
              </select>
            </div>

            <!-- 频率选择 -->
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500 dark:text-slate-400">频率</label>
              <select
                v-model.number="webUsbFrequency"
                :disabled="isConnected"
                class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option v-for="opt in frequencyOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <!-- WebUSB 支持提示 -->
            <div v-if="!webUsbRtt.isSupported.value" class="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
              <AlertCircle class="w-3.5 h-3.5" />
              <span>需要 Chrome/Edge 89+</span>
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
            @click="handleTogglePause()"
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
            @click="handleClearLogs()"
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

          <!-- 下载启动脚本按钮 -->
          <div ref="downloadDropdownRef" class="relative">
            <button
              @click="showDownloadDropdown = !showDownloadDropdown"
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-all"
              :class="showDownloadDropdown ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'"
              title="下载 RTT Bridge 启动脚本"
            >
              <Terminal class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">启动脚本</span>
            </button>
            <!-- 下拉菜单 -->
            <div
              v-if="showDownloadDropdown"
              class="absolute right-0 top-full mt-1 z-50 flex flex-col gap-1 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 min-w-[180px]"
            >
              <div class="px-2 py-1 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">启动脚本</div>
              <button
                @click="downloadStartBat(); showDownloadDropdown = false"
                class="flex items-center gap-2 px-3 py-2 rounded text-xs text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                <svg class="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
                </svg>
                Windows (.bat)
              </button>
              <button
                @click="downloadStartSh(); showDownloadDropdown = false"
                class="flex items-center gap-2 px-3 py-2 rounded text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
              >
                <svg class="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8zm-1-6v-2h2v2h-2zm0-4V6h2v4h-2z"/>
                </svg>
                Linux/Mac (.sh)
              </button>
              <div class="my-1 border-t border-slate-200 dark:border-slate-700"></div>
              <div class="px-2 py-1 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">源码下载</div>
              <a
                href="https://github.com/qxc4/qxc-serial-assistant/tree/main/rtt-bridge"
                target="_blank"
                rel="noopener noreferrer"
                @click="showDownloadDropdown = false"
                class="flex items-center gap-2 px-3 py-2 rounded text-xs text-slate-700 dark:text-slate-300 hover:bg-green-50 dark:hover:bg-green-900/30 hover:text-green-600 dark:hover:text-green-400 transition-colors"
              >
                <Download class="w-4 h-4 text-green-500" />
                RTT Bridge 源码
              </a>
              <div class="px-2 py-1 text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
                需要自行安装 Node.js 环境
              </div>
            </div>
          </div>

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
            <!-- Bridge 状态指示器 -->
            <span
              v-if="needsBridge"
              class="flex items-center gap-1"
              :title="bridgeStatus.status.value === 'online' ? 'RTT Bridge 已连接' : 'RTT Bridge 未运行'"
            >
              <Wifi v-if="bridgeStatus.status.value === 'online'" class="w-3.5 h-3.5 text-green-500" />
              <WifiOff v-else class="w-3.5 h-3.5 text-yellow-500 animate-pulse" />
            </span>
            <span>{{ logStats.total }} {{ t('rtt.entries') }}</span>
            <span v-if="logStats.errors > 0" class="text-red-500 dark:text-red-400">
              {{ logStats.errors }} {{ t('rtt.errors') }}
            </span>
            <span v-if="logStats.warnings > 0" class="text-yellow-500 dark:text-yellow-400">
              {{ logStats.warnings }} {{ t('rtt.warnings') }}
            </span>
          </div>
        </div>

        <!-- Bridge 离线提示 -->
        <div
          v-if="isBridgeOffline && showBridgeWarning"
          class="mt-2 flex items-start gap-3 text-xs bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded px-4 py-3"
        >
          <WifiOff class="w-4 h-4 shrink-0 text-yellow-600 dark:text-yellow-400 mt-0.5" />
          <div class="flex-1">
            <div class="font-medium text-yellow-700 dark:text-yellow-300 mb-1">RTT Bridge 未运行</div>
            <div class="text-yellow-600 dark:text-yellow-400 mb-2">
              使用此后端需要先启动 RTT Bridge 服务
            </div>
            <div class="flex flex-wrap items-center gap-2 mb-2">
              <button
                @click="openBridgeModal"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded bg-yellow-200 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-300 dark:hover:bg-yellow-700 transition-colors font-medium"
              >
                <Download class="w-3.5 h-3.5" />
                下载启动脚本
              </button>
              <span class="text-yellow-500 dark:text-yellow-500">或</span>
              <code class="bg-yellow-100 dark:bg-yellow-900/40 px-2 py-1 rounded font-mono text-yellow-700 dark:text-yellow-300">
                {{ platformGuide.command }}
              </code>
              <button
                @click="copyCommand"
                class="p-1 rounded hover:bg-yellow-200 dark:hover:bg-yellow-900/40 transition-colors"
                :title="copiedCommand ? '已复制' : '复制命令'"
              >
                <Check v-if="copiedCommand" class="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                <Copy v-else class="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
              </button>
            </div>
            <div class="text-yellow-500 dark:text-yellow-500">
              💡 提示：选择 <strong>WebUSB (直连)</strong> 后端可无需 Bridge 直接连接 ST-Link
            </div>
          </div>
          <button
            @click="dismissBridgeWarning"
            class="text-yellow-500 hover:text-yellow-600 dark:text-yellow-400 dark:hover:text-yellow-300"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- 后端不可用提示 -->
        <div
          v-if="showBackendUnavailable"
          class="mt-2 flex items-start gap-3 text-xs bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded px-4 py-3"
        >
          <AlertCircle class="w-4 h-4 shrink-0 text-orange-600 dark:text-orange-400 mt-0.5" />
          <div class="flex-1">
            <div class="font-medium text-orange-700 dark:text-orange-300 mb-1">
              {{ currentBackendCapabilities?.name }} 后端不可用
            </div>
            <div class="text-orange-600 dark:text-orange-400 mb-2">
              {{ currentBackendCapabilities?.reason }}
            </div>
            <div v-if="currentBackendCapabilities?.installGuide" class="text-orange-500 dark:text-orange-500 whitespace-pre-line">
              {{ currentBackendCapabilities.installGuide }}
            </div>
          </div>
        </div>

        <!-- 后端使用条件提示 -->
        <div
          v-if="needsBridge && !isBridgeOffline && isCurrentBackendAvailable && currentBackendRequirements"
          class="mt-2 flex items-start gap-3 text-xs bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded px-4 py-3"
        >
          <Info class="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div class="flex-1">
            <div class="font-medium text-blue-700 dark:text-blue-300 mb-2">
              {{ currentBackendRequirements.title }} 使用条件
            </div>
            <div class="space-y-1 text-blue-600 dark:text-blue-400">
              <div v-for="(req, idx) in currentBackendRequirements.requirements" :key="idx" class="flex items-start gap-1.5">
                <span class="text-blue-400 dark:text-blue-500">•</span>
                <span>{{ req }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 错误消息 -->
        <div
          v-if="errorMessage"
          class="mt-2 flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-3 py-1.5"
        >
          <AlertCircle class="w-3.5 h-3.5 shrink-0" />
          <span class="flex-1">{{ errorMessage }}</span>
          <button @click="isWebUsbMode ? webUsbRtt.clearError() : ''" class="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300">
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
              :items="filteredLogs"
              :item-height="22"
              :buffer="20"
              key-field="id"
            >
              <template #default="{ item }">
                <div
                  class="flex items-center px-3 text-xs hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                  :class="LEVEL_BG_MAP[(item as any).level]"
                >
                  <!-- 时间戳 -->
                  <span class="text-slate-400 dark:text-slate-500 w-20 shrink-0 select-none">
                    {{ formatTimestamp((item as any).timestamp) }}
                  </span>

                  <!-- 级别标签 -->
                  <span
                    class="w-12 shrink-0 font-semibold select-none"
                    :class="LEVEL_COLOR_MAP[(item as any).level]"
                  >
                    {{ (item as any).level.toUpperCase() }}
                  </span>

                  <!-- 通道标签 -->
                  <span class="text-slate-400 dark:text-slate-500 w-10 shrink-0 select-none">
                    Ch{{ (item as any).channel }}
                  </span>

                  <!-- 日志内容 -->
                  <span class="flex-1 min-w-0 truncate" :class="LEVEL_COLOR_MAP[(item as any).level]">
                    {{ (item as any).text }}
                  </span>
                </div>
              </template>
            </VirtualList>

            <!-- 空状态 -->
            <div
              v-if="filteredLogs.length === 0"
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
          class="w-96 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto"
        >
          <!-- v-once: 静态内容不需要重复渲染 -->
          <div class="p-4" v-once>
            <h3 class="text-base font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
              <BookOpen class="w-5 h-5" />
              RTT 调试完整指南
            </h3>

            <div class="space-y-5 text-xs text-slate-600 dark:text-slate-400">
              <!-- 快速开始：选择连接方式 -->
              <div class="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <h4 class="font-bold text-blue-800 dark:text-blue-200 mb-3 flex items-center gap-2 text-sm">
                  <Zap class="w-4 h-4" />
                  🚀 快速开始：选择连接方式
                </h4>

                <!-- 连接方式选择按钮组 -->
                <div class="grid grid-cols-2 gap-2 mb-4">
                  <button
                    @click="backend = 'webusb'"
                    class="p-3 rounded-lg border-2 transition-all text-left"
                    :class="backend === 'webusb'
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/30 shadow-md'
                      : 'border-slate-200 dark:border-slate-700 hover:border-green-300 dark:hover:border-green-700'"
                  >
                    <div class="flex items-center gap-2 mb-1">
                      <Zap class="w-4 h-4 text-green-600 dark:text-green-400" />
                      <span class="font-bold text-green-700 dark:text-green-300">WebUSB</span>
                    </div>
                    <p class="text-[10px] text-slate-500 dark:text-slate-400">纯浏览器运行，无需服务</p>
                  </button>

                  <button
                    @click="backend = 'probe-rs'"
                    class="p-3 rounded-lg border-2 transition-all text-left"
                    :class="backend === 'probe-rs'
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 shadow-md'
                      : 'border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-700'"
                  >
                    <div class="flex items-center gap-2 mb-1">
                      <Wifi class="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span class="font-bold text-purple-700 dark:text-purple-300">probe-rs</span>
                    </div>
                    <p class="text-[10px] text-slate-500 dark:text-slate-400">跨平台，支持多探针</p>
                  </button>

                  <button
                    @click="backend = 'openocd'"
                    class="p-3 rounded-lg border-2 transition-all text-left"
                    :class="backend === 'openocd'
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30 shadow-md'
                      : 'border-slate-200 dark:border-slate-700 hover:border-orange-300 dark:hover:border-orange-700'"
                  >
                    <div class="flex items-center gap-2 mb-1">
                      <Terminal class="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      <span class="font-bold text-orange-700 dark:text-orange-300">OpenOCD</span>
                    </div>
                    <p class="text-[10px] text-slate-500 dark:text-slate-400">成熟稳定，配置灵活</p>
                  </button>

                  <button
                    @click="backend = 'jlink'"
                    class="p-3 rounded-lg border-2 transition-all text-left"
                    :class="backend === 'jlink'
                      ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/30 shadow-md'
                      : 'border-slate-200 dark:border-slate-700 hover:border-cyan-300 dark:hover:border-cyan-700'"
                  >
                    <div class="flex items-center gap-2 mb-1">
                      <Cpu class="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                      <span class="font-bold text-cyan-700 dark:text-cyan-300">J-Link</span>
                    </div>
                    <p class="text-[10px] text-slate-500 dark:text-slate-400">SEGGER 官方工具</p>
                  </button>
                </div>

                <!-- 当前后端要求提示 -->
                <div v-if="currentBackendRequirements" class="p-3 bg-white/50 dark:bg-slate-800/50 rounded-lg">
                  <div class="flex items-center gap-2 mb-2">
                    <Info class="w-4 h-4 text-blue-500" />
                    <span class="font-medium text-slate-700 dark:text-slate-300">{{ currentBackendRequirements.title }} 使用条件</span>
                  </div>
                  <ul class="space-y-1 text-slate-600 dark:text-slate-400">
                    <li v-for="(req, idx) in currentBackendRequirements.requirements" :key="idx" class="flex items-start gap-1.5">
                      <span class="text-green-500 mt-0.5">✓</span>
                      <span>{{ req }}</span>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- WebUSB 直连教程 -->
              <div class="p-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <h4 class="font-bold text-green-700 dark:text-green-300 mb-3 flex items-center gap-2 text-sm">
                  <Zap class="w-4 h-4" />
                  📱 WebUSB 直连教程（推荐）
                </h4>
                <p class="mb-3 text-slate-600 dark:text-slate-400">无需任何本地服务，像 Web Serial 一样丝滑！</p>

                <!-- 步骤卡片 -->
                <div class="space-y-2">
                  <div class="flex items-start gap-3 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <span class="w-6 h-6 shrink-0 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">1</span>
                    <div>
                      <div class="font-medium text-slate-700 dark:text-slate-300">选择 WebUSB 后端</div>
                      <div class="text-[10px] text-slate-500">点击上方「WebUSB」按钮切换</div>
                    </div>
                  </div>
                  <div class="flex items-start gap-3 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <span class="w-6 h-6 shrink-0 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">2</span>
                    <div>
                      <div class="font-medium text-slate-700 dark:text-slate-300">点击「选择设备」按钮</div>
                      <div class="text-[10px] text-slate-500">浏览器会弹出设备选择对话框</div>
                    </div>
                  </div>
                  <div class="flex items-start gap-3 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <span class="w-6 h-6 shrink-0 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">3</span>
                    <div>
                      <div class="font-medium text-slate-700 dark:text-slate-300">选择您的 ST-Link 探针</div>
                      <div class="text-[10px] text-slate-500">在列表中找到并选择调试器</div>
                    </div>
                  </div>
                  <div class="flex items-start gap-3 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <span class="w-6 h-6 shrink-0 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">4</span>
                    <div>
                      <div class="font-medium text-slate-700 dark:text-slate-300">点击「连接」开始调试</div>
                      <div class="text-[10px] text-slate-500">RTT 日志会自动显示</div>
                    </div>
                  </div>
                </div>

                <!-- 支持设备 -->
                <div class="mt-3 p-2 bg-green-100/50 dark:bg-green-900/30 rounded-lg">
                  <div class="font-medium text-green-700 dark:text-green-300 mb-1">✅ 支持设备：</div>
                  <div class="flex flex-wrap gap-1">
                    <span class="px-2 py-0.5 bg-green-200 dark:bg-green-800 rounded text-green-700 dark:text-green-300 text-[10px] font-medium">ST-Link V2</span>
                    <span class="px-2 py-0.5 bg-green-200 dark:bg-green-800 rounded text-green-700 dark:text-green-300 text-[10px] font-medium">ST-Link V2-1</span>
                    <span class="px-2 py-0.5 bg-green-200 dark:bg-green-800 rounded text-green-700 dark:text-green-300 text-[10px] font-medium">ST-Link V3</span>
                  </div>
                </div>

                <!-- 重要提示 -->
                <div class="mt-3 p-2 bg-yellow-100/50 dark:bg-yellow-900/30 rounded-lg text-yellow-700 dark:text-yellow-300">
                  <strong>⚠️ 注意：</strong>目标程序必须已集成 RTT 库（SEGGER_RTT.c/h）
                </div>
              </div>

              <!-- RTT Bridge 启动说明 -->
              <div class="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <h4 class="font-bold text-blue-700 dark:text-blue-300 mb-3 flex items-center gap-2 text-sm">
                  <Terminal class="w-4 h-4" />
                  🔧 RTT Bridge 启动方式
                </h4>
                <p class="mb-3 text-slate-600 dark:text-slate-400">使用 probe-rs / OpenOCD / J-Link 后端需要先启动 Bridge 服务</p>

                <!-- 一键启动按钮 -->
                <div class="grid grid-cols-2 gap-2 mb-3">
                  <button
                    @click="downloadStartBat"
                    class="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all"
                  >
                    <Download class="w-4 h-4" />
                    下载 Windows 启动脚本
                  </button>
                  <button
                    @click="downloadStartSh"
                    class="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all"
                  >
                    <Download class="w-4 h-4" />
                    下载 Linux/Mac 启动脚本
                  </button>
                </div>

                <!-- 命令行方式 -->
                <div class="p-3 bg-slate-800 text-green-400 rounded-lg font-mono text-[10px] overflow-x-auto">
                  <div class="text-slate-400 mb-1"># 进入 Bridge 目录</div>
                  <div class="text-yellow-400">cd rtt-bridge</div>
                  <div class="text-slate-400 mt-2 mb-1"># 安装依赖（首次运行）</div>
                  <div>npm install</div>
                  <div class="text-slate-400 mt-2 mb-1"># 启动服务</div>
                  <div class="text-cyan-400">npm run dev</div>
                </div>

                <div class="mt-3 flex items-center gap-4 text-xs">
                  <div class="flex items-center gap-1.5">
                    <span class="text-slate-500">默认端口：</span>
                    <code class="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded text-blue-700 dark:text-blue-300 font-mono">19022</code>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-slate-500">连接地址：</span>
                    <code class="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded text-blue-700 dark:text-blue-300 font-mono">ws://127.0.0.1:19022</code>
                  </div>
                </div>
              </div>

              <!-- probe-rs 详细教程 -->
              <div class="p-4 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <h4 class="font-bold text-purple-700 dark:text-purple-300 mb-3 flex items-center gap-2 text-sm">
                  <Wifi class="w-4 h-4" />
                  📦 probe-rs 详细教程
                </h4>

                <!-- 功能亮点 -->
                <div class="mb-3 p-3 bg-purple-100/50 dark:bg-purple-900/30 rounded-lg">
                  <div class="font-medium text-purple-700 dark:text-purple-300 mb-2">✨ 功能亮点</div>
                  <ul class="space-y-1 text-slate-600 dark:text-slate-400">
                    <li class="flex items-center gap-1.5"><span>🎯</span> 支持多种探针：ST-Link、J-Link、DAPLink、FTDI</li>
                    <li class="flex items-center gap-1.5"><span>⚡</span> 跨平台支持：Windows、macOS、Linux</li>
                    <li class="flex items-center gap-1.5"><span>🔍</span> 自动检测 RTT 控制块</li>
                    <li class="flex items-center gap-1.5"><span>📊</span> 多通道支持</li>
                  </ul>
                </div>

                <!-- ⚠️ 重要提示 -->
                <div class="mb-3 p-3 bg-yellow-100/50 dark:bg-yellow-900/30 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div class="font-medium text-yellow-700 dark:text-yellow-300 mb-1">⚠️ 重要提示（v0.31+）</div>
                  <p class="text-yellow-600 dark:text-yellow-400">probe-rs v0.31+ 需要 ELF 文件路径才能连接 RTT。请先编译固件并填写 ELF 路径。</p>
                </div>

                <!-- 支持的探针 -->
                <div class="mb-3 p-3 bg-white/50 dark:bg-slate-800/50 rounded-lg">
                  <div class="font-medium text-slate-700 dark:text-slate-300 mb-2">🔌 支持的探针</div>
                  <div class="flex flex-wrap gap-1.5">
                    <span class="px-2 py-1 bg-purple-200 dark:bg-purple-800 rounded text-purple-700 dark:text-purple-300 text-[10px] font-medium">ST-Link</span>
                    <span class="px-2 py-1 bg-purple-200 dark:bg-purple-800 rounded text-purple-700 dark:text-purple-300 text-[10px] font-medium">J-Link</span>
                    <span class="px-2 py-1 bg-purple-200 dark:bg-purple-800 rounded text-purple-700 dark:text-purple-300 text-[10px] font-medium">DAPLink</span>
                    <span class="px-2 py-1 bg-purple-200 dark:bg-purple-800 rounded text-purple-700 dark:text-purple-300 text-[10px] font-medium">FTDI</span>
                    <span class="px-2 py-1 bg-purple-200 dark:bg-purple-800 rounded text-purple-700 dark:text-purple-300 text-[10px] font-medium">ESP32</span>
                    <span class="px-2 py-1 bg-purple-200 dark:bg-purple-800 rounded text-purple-700 dark:text-purple-300 text-[10px] font-medium">WLink</span>
                  </div>
                </div>

                <!-- 安装步骤 -->
                <div class="space-y-2">
                  <div class="font-medium text-slate-700 dark:text-slate-300 mb-2">📥 安装步骤</div>

                  <div class="flex items-start gap-3 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <span class="w-6 h-6 shrink-0 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">1</span>
                    <div>
                      <div class="font-medium text-slate-700 dark:text-slate-300">下载预编译版本</div>
                      <a href="https://probe.rs/docs/getting-started/installation" target="_blank" class="text-purple-600 dark:text-purple-400 underline hover:no-underline text-[10px]">
                        🔗 probe.rs/docs/getting-started/installation
                      </a>
                    </div>
                  </div>

                  <div class="flex items-start gap-3 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <span class="w-6 h-6 shrink-0 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">2</span>
                    <div>
                      <div class="font-medium text-slate-700 dark:text-slate-300">Windows 下载</div>
                      <code class="text-[10px] bg-purple-100 dark:bg-purple-900/40 px-1 rounded">probe-rs-tools-*.zip</code>
                    </div>
                  </div>

                  <div class="flex items-start gap-3 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <span class="w-6 h-6 shrink-0 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">3</span>
                    <div>
                      <div class="font-medium text-slate-700 dark:text-slate-300">解压到任意目录</div>
                      <code class="text-[10px] bg-purple-100 dark:bg-purple-900/40 px-1 rounded">如 D:\probe-rs\</code>
                    </div>
                  </div>

                  <div class="flex items-start gap-3 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <span class="w-6 h-6 shrink-0 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">4</span>
                    <div>
                      <div class="font-medium text-slate-700 dark:text-slate-300">添加到 PATH 环境变量</div>
                      <div class="text-[10px] text-slate-500">将解压目录添加到系统 PATH</div>
                    </div>
                  </div>
                </div>

                <div class="mt-3 p-2 bg-slate-800 rounded-lg">
                  <div class="text-slate-400 text-[10px] mb-1"># 或使用 Cargo 安装：</div>
                  <code class="text-green-400 text-[10px]">cargo install probe-rs --features cli</code>
                </div>
              </div>

              <!-- OpenOCD 教程 -->
              <div class="p-4 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                <h4 class="font-bold text-orange-700 dark:text-orange-300 mb-3 flex items-center gap-2 text-sm">
                  <Terminal class="w-4 h-4" />
                  🔧 OpenOCD 教程
                </h4>

                <div class="space-y-3">
                  <div class="p-3 bg-orange-100/50 dark:bg-orange-900/30 rounded-lg">
                    <div class="font-medium text-orange-700 dark:text-orange-300 mb-2">📋 使用条件</div>
                    <ul class="space-y-1 text-slate-600 dark:text-slate-400 text-[10px]">
                      <li>✓ OpenOCD 已安装并添加到 PATH</li>
                      <li>✓ OpenOCD 已启动并连接目标</li>
                      <li>✓ OpenOCD 配置了 RTT 支持</li>
                      <li>✓ RTT TCP 服务已启动（默认端口 9090）</li>
                    </ul>
                  </div>

                  <div class="p-3 bg-slate-800 rounded-lg">
                    <div class="text-slate-400 text-[10px] mb-1"># OpenOCD 配置示例</div>
                    <pre class="text-green-400 text-[10px] overflow-x-auto">source [find interface/stlink.cfg]
source [find target/stm32f4x.cfg]

# 启用 RTT
rtt setup 0x20000000 0x10000 "SEGGER RTT"
rtt start

# 启动 TCP 服务
rtt server start 9090 0</pre>
                  </div>
                </div>
              </div>

              <!-- J-Link 教程 -->
              <div class="p-4 bg-gradient-to-br from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
                <h4 class="font-bold text-cyan-700 dark:text-cyan-300 mb-3 flex items-center gap-2 text-sm">
                  <Cpu class="w-4 h-4" />
                  🔌 J-Link 教程
                </h4>

                <div class="space-y-3">
                  <div class="p-3 bg-cyan-100/50 dark:bg-cyan-900/30 rounded-lg">
                    <div class="font-medium text-cyan-700 dark:text-cyan-300 mb-2">📋 使用条件</div>
                    <ul class="space-y-1 text-slate-600 dark:text-slate-400 text-[10px]">
                      <li>✓ J-Link 调试器已连接</li>
                      <li>✓ J-Link GDB Server 已启动</li>
                      <li>✓ RTT 已在 GDB Server 中启用</li>
                      <li>✓ RTT Telnet 服务已启动（默认端口 19021）</li>
                    </ul>
                  </div>

                  <div class="p-3 bg-slate-800 rounded-lg">
                    <div class="text-slate-400 text-[10px] mb-1"># J-Link GDB Server 启动</div>
                    <pre class="text-green-400 text-[10px]">JLinkGDBServer -device STM32F407VG -if SWD -speed 4000 -rtt</pre>
                  </div>
                </div>
              </div>

              <!-- 什么是 RTT -->
              <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <h4 class="font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2 text-sm">
                  <Info class="w-4 h-4" />
                  ❓ 什么是 RTT？
                </h4>
                <p class="text-slate-600 dark:text-slate-400">RTT (Real-Time Transfer) 是 SEGGER 开发的高速调试通信技术，可在不影响实时性的情况下传输调试信息。</p>

                <div class="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div class="p-2 bg-blue-100/50 dark:bg-blue-900/30 rounded-lg">
                    <div class="text-lg font-bold text-blue-600 dark:text-blue-400">2MB/s</div>
                    <div class="text-[10px] text-slate-500">传输速度</div>
                  </div>
                  <div class="p-2 bg-green-100/50 dark:bg-green-900/30 rounded-lg">
                    <div class="text-lg font-bold text-green-600 dark:text-green-400">0μs</div>
                    <div class="text-[10px] text-slate-500">额外延迟</div>
                  </div>
                  <div class="p-2 bg-purple-100/50 dark:bg-purple-900/30 rounded-lg">
                    <div class="text-lg font-bold text-purple-600 dark:text-purple-400">512B</div>
                    <div class="text-[10px] text-slate-500">最小内存</div>
                  </div>
                </div>
              </div>

              <!-- 使用技巧 -->
              <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <h4 class="font-bold text-slate-700 dark:text-slate-300 mb-2 text-sm">💡 使用技巧</h4>
                <ul class="space-y-2">
                  <li class="flex items-start gap-2">
                    <span class="text-green-500 mt-0.5">✓</span>
                    <span>确保目标程序已启用 RTT（SEGGER_RTT.c/h）</span>
                  </li>
                  <li class="flex items-start gap-2">
                    <span class="text-green-500 mt-0.5">✓</span>
                    <span>WebUSB 需要 Chrome/Edge 89+ 浏览器</span>
                  </li>
                  <li class="flex items-start gap-2">
                    <span class="text-green-500 mt-0.5">✓</span>
                    <span>日志过多时可使用过滤器筛选</span>
                  </li>
                  <li class="flex items-start gap-2">
                    <span class="text-green-500 mt-0.5">✓</span>
                    <span>支持导出日志和会话数据</span>
                  </li>
                  <li class="flex items-start gap-2">
                    <span class="text-green-500 mt-0.5">✓</span>
                    <span>按 <kbd class="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[10px]">Ctrl+F</kbd> 快速搜索日志</span>
                  </li>
                </ul>
              </div>

              <!-- 常见错误及解决方案 -->
              <div class="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <h4 class="font-bold text-red-700 dark:text-red-300 mb-3 flex items-center gap-2 text-sm">
                  <AlertCircle class="w-4 h-4" />
                  ⚠️ 常见错误及解决方案
                </h4>

                <div class="space-y-3">
                  <!-- 错误1 -->
                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <div class="font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                      <span class="text-red-500">❌</span> spawn probe-rs ENOENT
                    </div>
                    <div class="text-slate-500 dark:text-slate-400 text-[10px] mb-2">系统未安装 probe-rs 工具</div>
                    <div class="p-2 bg-green-50 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300 text-[10px]">
                      <strong>✅ 解决：</strong>参考上方 probe-rs 安装说明，安装后重启终端
                    </div>
                  </div>

                  <!-- 错误2 -->
                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <div class="font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                      <span class="text-red-500">❌</span> 未找到 RTT 控制块
                    </div>
                    <div class="text-slate-500 dark:text-slate-400 text-[10px] mb-2">无法在目标内存中定位 RTT 控制块</div>
                    <div class="p-2 bg-green-50 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300 text-[10px]">
                      <strong>✅ 解决：</strong>确保目标程序已正确初始化 RTT，且正在运行
                    </div>
                  </div>

                  <!-- 错误3 -->
                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <div class="font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                      <span class="text-red-500">❌</span> WebUSB 授权失败
                    </div>
                    <div class="text-slate-500 dark:text-slate-400 text-[10px] mb-2">浏览器无法访问 USB 设备</div>
                    <div class="p-2 bg-green-50 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300 text-[10px]">
                      <strong>✅ 解决：</strong>使用 HTTPS 或 localhost，并允许浏览器访问 USB 设备
                    </div>
                  </div>

                  <!-- 错误4 -->
                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <div class="font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                      <span class="text-red-500">❌</span> Bridge 连接失败
                    </div>
                    <div class="text-slate-500 dark:text-slate-400 text-[10px] mb-2">无法连接到 RTT Bridge 服务</div>
                    <div class="p-2 bg-green-50 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300 text-[10px]">
                      <strong>✅ 解决：</strong>检查 Bridge 是否已启动，端口是否正确（默认 19022）
                    </div>
                  </div>

                  <!-- 错误5 -->
                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <div class="font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                      <span class="text-red-500">❌</span> 探针连接失败
                    </div>
                    <div class="text-slate-500 dark:text-slate-400 text-[10px] mb-2">无法连接到调试探针</div>
                    <div class="p-2 bg-green-50 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300 text-[10px]">
                      <strong>✅ 解决：</strong>检查 USB 连接、驱动程序安装，确认探针型号支持
                    </div>
                  </div>

                  <!-- 错误6 -->
                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <div class="font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                      <span class="text-red-500">❌</span> ELF 文件路径无效
                    </div>
                    <div class="text-slate-500 dark:text-slate-400 text-[10px] mb-2">指定的 ELF 文件不存在或无法访问</div>
                    <div class="p-2 bg-green-50 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300 text-[10px]">
                      <strong>✅ 解决：</strong>确认文件路径正确，使用「选择文件」按钮浏览选择
                    </div>
                  </div>

                  <!-- 错误7 -->
                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <div class="font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                      <span class="text-red-500">❌</span> 芯片型号不支持
                    </div>
                    <div class="text-slate-500 dark:text-slate-400 text-[10px] mb-2">指定的芯片型号不被支持</div>
                    <div class="p-2 bg-green-50 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300 text-[10px]">
                      <strong>✅ 解决：</strong>检查芯片型号拼写，使用 probe-rs chip list 查看支持的芯片
                    </div>
                  </div>
                </div>
              </div>

              <!-- 相关链接 -->
              <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <h4 class="font-bold text-slate-700 dark:text-slate-300 mb-2 text-sm">🔗 相关链接</h4>
                <div class="space-y-1.5">
                  <a href="https://probe.rs/docs/getting-started/installation" target="_blank" class="flex items-center gap-2 text-purple-600 dark:text-purple-400 hover:underline">
                    <span>📦</span> probe-rs 安装文档
                  </a>
                  <a href="https://www.segger.com/products/debug-probes/j-link/technology/about-real-time-transfer/" target="_blank" class="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 hover:underline">
                    <span>📚</span> SEGGER RTT 官方文档
                  </a>
                  <a href="https://openocd.org/documentation/" target="_blank" class="flex items-center gap-2 text-orange-600 dark:text-orange-400 hover:underline">
                    <span>🔧</span> OpenOCD 文档
                  </a>
                  <a href="https://www.segger.com/downloads/jlink/" target="_blank" class="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline">
                    <span>🔌</span> J-Link 下载
                  </a>
                </div>
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
            @input="wsRtt.setFilter({ searchText: ($event.target as HTMLInputElement).value })"
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
              ? `${opt.color} ${LEVEL_BG_MAP[opt.value]} border-current/30`
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

  <!-- Bridge 启动脚本下载弹窗 -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="showBridgeModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="closeBridgeModal"
      >
        <div class="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
          <!-- 标题栏 -->
          <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <h3 class="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Download class="w-4 h-4" />
              下载 RTT Bridge 启动脚本
            </h3>
            <button
              @click="closeBridgeModal"
              class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X class="w-4 h-4" />
            </button>
          </div>

          <!-- 内容区 -->
          <div class="p-4 space-y-4">
            <!-- 重要提示：没有源码的用户 -->
            <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div class="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-2">
                <Info class="w-4 h-4" />
                如果您没有 rtt-bridge 源码
              </div>
              <p class="text-xs text-blue-600 dark:text-blue-400 mb-2">
                RTT Bridge 是一个独立的后端服务，需要单独下载：
              </p>
              <div class="space-y-2">
                <a
                  href="https://github.com/qiaoxinchao/qxc-serial-assistant/tree/main/rtt-bridge"
                  target="_blank"
                  class="flex items-center gap-2 px-3 py-2 bg-blue-100 dark:bg-blue-800 rounded text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors"
                >
                  <Download class="w-4 h-4" />
                  从 GitHub 下载 rtt-bridge 源码
                </a>
                <div class="text-xs text-blue-500 dark:text-blue-400 px-1">
                  或使用命令：<code class="bg-blue-100 dark:bg-blue-800 px-1.5 py-0.5 rounded">git clone https://github.com/qiaoxinchao/qxc-serial-assistant.git</code>
                </div>
              </div>
            </div>

            <p class="text-sm text-slate-600 dark:text-slate-400">
              如果您已有 rtt-bridge 源码，选择适合您操作系统的启动脚本：
            </p>

            <!-- 下载按钮 -->
            <div class="grid grid-cols-2 gap-3">
              <button
                @click="downloadStartBat"
                class="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
              >
                <div class="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
                  <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
                  </svg>
                </div>
                <span class="text-sm font-medium text-blue-700 dark:text-blue-300">Windows</span>
                <span class="text-xs text-blue-600 dark:text-blue-400">start-rtt-bridge.bat</span>
              </button>

              <button
                @click="downloadStartSh"
                class="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div class="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                  <svg class="w-5 h-5 text-slate-600 dark:text-slate-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8zm-1-6v-2h2v2h-2zm0-4V6h2v4h-2z"/>
                  </svg>
                </div>
                <span class="text-sm font-medium text-slate-700 dark:text-slate-300">macOS / Linux</span>
                <span class="text-xs text-slate-500 dark:text-slate-400">start-rtt-bridge.sh</span>
              </button>
            </div>

            <!-- 使用说明 -->
            <div class="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs text-slate-600 dark:text-slate-400">
              <div class="font-medium text-slate-700 dark:text-slate-300 mb-2">完整使用步骤：</div>
              <ol class="list-decimal list-inside space-y-1">
                <li>下载 rtt-bridge 源码（见上方链接）</li>
                <li>解压后进入 <code class="bg-slate-200 dark:bg-slate-700 px-1 rounded">rtt-bridge/</code> 目录</li>
                <li>下载启动脚本到该目录（或任意位置）</li>
                <li>运行脚本（Windows 双击，macOS/Linux 终端运行）</li>
                <li>等待服务启动后，返回此页面连接</li>
              </ol>
            </div>

            <!-- 前置要求 -->
            <div class="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-xs text-yellow-700 dark:text-yellow-300">
              <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>前置要求：</strong>需要先安装 Node.js（v18+）
                <a href="https://nodejs.org/" target="_blank" class="underline ml-1">下载 Node.js</a>
              </div>
            </div>

            <!-- 推荐方式 -->
            <div class="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-xs text-green-700 dark:text-green-300">
              <div class="font-medium flex items-center gap-1 mb-1">
                <Zap class="w-3.5 h-3.5" />
                更简单的方式：使用 WebUSB 直连
              </div>
              <p class="text-green-600 dark:text-green-400">
                如果您有 ST-Link 调试器，可以切换到「WebUSB (直连)」模式，无需安装任何后端服务，直接在浏览器中调试 RTT！
              </p>
            </div>
          </div>

          <!-- 底部按钮 -->
          <div class="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <button
              @click="closeBridgeModal"
              class="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
