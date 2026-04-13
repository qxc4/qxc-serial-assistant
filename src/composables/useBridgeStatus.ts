/**
 * RTT Bridge 状态检测 Composable
 *
 * 检测 RTT Bridge 服务是否运行，并提供启动指引
 */

import { ref, onMounted, onUnmounted } from 'vue'

/** Bridge 状态 */
export type BridgeStatus = 'checking' | 'online' | 'offline'

/** 检测配置 */
interface BridgeCheckConfig {
  /** WebSocket 地址 */
  wsUrl: string
  /** 检测间隔 (ms) */
  checkInterval: number
  /** 超时时间 (ms) */
  timeout: number
}

const DEFAULT_CONFIG: BridgeCheckConfig = {
  wsUrl: 'ws://127.0.0.1:19022',
  checkInterval: 5000,
  timeout: 3000,
}

/**
 * RTT Bridge 状态检测
 */
export function useBridgeStatus(config: Partial<BridgeCheckConfig> = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  /** 当前状态 */
  const status = ref<BridgeStatus>('checking')

  /** 是否正在检测 */
  const isChecking = ref(false)

  /** 检测定时器 */
  let checkTimer: ReturnType<typeof setInterval> | null = null

  /**
   * 执行一次状态检测
   */
  async function check(): Promise<boolean> {
    return new Promise((resolve) => {
      const ws = new WebSocket(cfg.wsUrl)
      const timeoutId = setTimeout(() => {
        ws.close()
        resolve(false)
      }, cfg.timeout)

      ws.onopen = () => {
        clearTimeout(timeoutId)
        ws.close()
        resolve(true)
      }

      ws.onerror = () => {
        clearTimeout(timeoutId)
        resolve(false)
      }
    })
  }

  /**
   * 执行状态检测并更新状态
   */
  async function performCheck(): Promise<void> {
    if (isChecking.value) return

    isChecking.value = true
    const isOnline = await check()
    status.value = isOnline ? 'online' : 'offline'
    isChecking.value = false
  }

  /**
   * 开始定期检测
   */
  function startPolling(): void {
    performCheck()
    checkTimer = setInterval(performCheck, cfg.checkInterval)
  }

  /**
   * 停止定期检测
   */
  function stopPolling(): void {
    if (checkTimer) {
      clearInterval(checkTimer)
      checkTimer = null
    }
  }

  // 生命周期
  onMounted(() => {
    startPolling()
  })

  onUnmounted(() => {
    stopPolling()
  })

  return {
    status,
    isChecking,
    check: performCheck,
    startPolling,
    stopPolling,
  }
}

/**
 * 启动指引信息
 */
export const BRIDGE_START_GUIDE = {
  windows: {
    title: 'Windows 启动方式',
    steps: [
      '双击 rtt-bridge/start.bat 文件',
      '或在终端运行: cd rtt-bridge && npm run dev',
    ],
    command: 'start.bat',
  },
  macos: {
    title: 'macOS/Linux 启动方式',
    steps: [
      '终端运行: ./rtt-bridge/start.sh',
      '或: cd rtt-bridge && npm run dev',
    ],
    command: './start.sh',
  },
}

/**
 * 获取当前平台的启动指引
 */
export function getPlatformGuide() {
  const isWindows = navigator.platform.toLowerCase().includes('win')
  return isWindows ? BRIDGE_START_GUIDE.windows : BRIDGE_START_GUIDE.macos
}
