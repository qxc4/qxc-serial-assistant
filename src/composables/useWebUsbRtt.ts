/**
 * WebUSB-RTT Composable (基于 jstlink 库)
 *
 * 通过 WebUSB API 直接与 ST-Link/DAPLink 探针通信，实现 RTT 调试功能。
 * 无需任何本地服务，像 Web Serial 一样丝滑。
 *
 * 支持设备：
 * - ST-Link V2 / V2-1 / V3
 * - DAPLink / CMSIS-DAP 兼容探针
 * - PicoProbe
 *
 * @module useWebUsbRtt
 * @author 乔鑫超
 * @see https://github.com/Dirbaio/jstlink
 */

/// <reference path="../types/webusb.d.ts" />

import { ref, shallowRef, computed, onUnmounted } from 'vue'
import type {
  WebUsbProbeInfo,
  WebUsbState,
  WebUsbError,
  WebUsbErrorType,
  RttLogEntry,
  RttLogLevel,
  RttChannel,
  WebUsbProbeType,
} from '../types/rtt'

// ==================== jstlink 类型定义 ====================

/**
 * jstlink 库接口定义
 * @see https://github.com/Dirbaio/jstlink
 */
interface JSTLinkInterface {
  /** 连接到设备 */
  connect(device?: USBDevice): Promise<void>
  /** 断开连接 */
  disconnect(): Promise<void>
  /** 获取芯片信息 */
  getChipInfo(): Promise<{ name: string; core: string }>
  /** 启动 RTT */
  rttStart(searchStart?: number, searchEnd?: number): Promise<RttChannel[]>
  /** 停止 RTT */
  rttStop(): Promise<void>
  /** 读取 RTT 数据 */
  rttRead(channel: number): Promise<string>
  /** 写入 RTT 数据 */
  rttWrite(channel: number, data: string): Promise<void>
  /** 设置 SWD 频率 */
  setSpeed(frequency: number): Promise<void>
  /** 注册事件监听 */
  on(event: 'data' | 'error', callback: Function): void
  /** 移除事件监听 */
  off(event: string, callback: Function): void
  /** 是否已连接 */
  readonly isConnected: boolean
  /** 当前 USB 设备 */
  readonly device: USBDevice | null
}

/** jstlink 构造函数类型 */
interface JSTLinkConstructor {
  new (): JSTLinkInterface
}

// ==================== 常量定义 ====================

/** 默认 SWD 频率 (Hz) */
const DEFAULT_FREQUENCY = 4000000

/** RTT 控制块搜索起始地址 */
const RTT_SEARCH_START = 0x20000000

/** RTT 控制块搜索结束地址 */
const RTT_SEARCH_END = 0x20040000

/** RTT 轮询间隔 (ms) */
const POLL_INTERVAL = 10

/** 日志最大条数 */
const MAX_LOG_ENTRIES = 50000

/** 日志淘汰阈值 */
const LOG_TRIM_THRESHOLD = 40000

/** 批量更新缓冲区大小 */
const BATCH_SIZE = 50

/** 批量更新间隔（ms） */
const BATCH_INTERVAL = 16

/** 频率选项 */
export const FREQUENCY_OPTIONS = [
  { value: 1000000, label: '1 MHz' },
  { value: 2000000, label: '2 MHz' },
  { value: 4000000, label: '4 MHz' },
  { value: 8000000, label: '8 MHz' },
  { value: 16000000, label: '16 MHz' },
] as const

/** 已知的 USB 调试探针列表 */
const KNOWN_USB_PROBES = [
  // ST-Link V2
  { vendorId: 0x0483, productId: 0x3748, type: 'stlink-v2' as WebUsbProbeType, name: 'ST-Link V2' },
  // ST-Link V2-1 (Nucleo boards)
  { vendorId: 0x0483, productId: 0x374b, type: 'stlink-v2' as WebUsbProbeType, name: 'ST-Link V2-1' },
  // ST-Link V3
  { vendorId: 0x0483, productId: 0x374f, type: 'stlink-v3' as WebUsbProbeType, name: 'ST-Link V3' },
  { vendorId: 0x0483, productId: 0x3753, type: 'stlink-v3' as WebUsbProbeType, name: 'ST-Link V3E' },
  // DAPLink (NXP, ARM mbed)
  { vendorId: 0x0d28, productId: 0x0204, type: 'daplink' as WebUsbProbeType, name: 'DAPLink' },
  // Raspberry Pi Pico (Picoprobe)
  { vendorId: 0x2e8a, productId: 0x0004, type: 'picoprobe' as WebUsbProbeType, name: 'PicoProbe' },
  // J-Link (部分支持)
  { vendorId: 0x1366, productId: 0x0101, type: 'jlink' as WebUsbProbeType, name: 'J-Link' },
  { vendorId: 0x1366, productId: 0x0105, type: 'jlink' as WebUsbProbeType, name: 'J-Link OB' },
] as const

// ==================== 错误处理工具 ====================

/**
 * 创建 WebUSB 错误对象
 * @param type 错误类型
 * @param message 错误消息
 * @param cause 原始错误
 */
function createError(type: WebUsbErrorType, message: string, cause?: Error): WebUsbError {
  return { type, message, cause }
}

/**
 * 检查浏览器是否支持 WebUSB
 * @returns 不支持时返回错误对象，支持时返回 null
 */
function checkWebUsbSupport(): WebUsbError | null {
  if (!navigator.usb) {
    return createError(
      'not_supported',
      '当前浏览器不支持 WebUSB API。请使用 Chrome/Edge 89+ 版本访问。'
    )
  }
  return null
}

// ==================== Composable 实现 ====================

/**
 * WebUSB-RTT Composable
 *
 * 提供纯浏览器端的 RTT 调试功能，无需任何本地服务。
 * 体验与 Web Serial 完全一致：插探针 → 点击连接 → 授权 → 自动发现 RTT → 实时日志。
 *
 * @example
 * ```typescript
 * const rtt = useWebUsbRtt()
 *
 * // 检查浏览器支持
 * if (!rtt.isSupported.value) {
 *   alert('请使用 Chrome/Edge 89+ 版本')
 * }
 *
 * // 连接设备
 * await rtt.connect()
 *
 * // 发送数据
 * rtt.send(0, 'Hello RTT!')
 *
 * // 断开连接
 * await rtt.disconnect()
 * ```
 */
export function useWebUsbRtt() {
  // ==================== 响应式状态 ====================

  /** 浏览器是否支持 WebUSB */
  const isSupported = ref(!checkWebUsbSupport())

  /** 当前连接状态 */
  const state = ref<WebUsbState>('disconnected')

  /** 当前连接的探针信息 */
  const probe = shallowRef<WebUsbProbeInfo | null>(null)

  /** 错误信息 */
  const error = shallowRef<WebUsbError | null>(null)

  /** SWD/JTAG 时钟频率 */
  const frequency = ref(DEFAULT_FREQUENCY)

  /** RTT 通道列表 */
  const channels = ref<RttChannel[]>([])

  /** 日志条目列表 */
  const logs = ref<RttLogEntry[]>([])

  /** 是否暂停接收日志 */
  const isPaused = ref(false)

  /** 日志 ID 自增计数器 */
  let logIdCounter = 0

  /** jstlink 实例 */
  let jstlink: JSTLinkInterface | null = null

  /** RTT 轮询定时器 ID */
  let pollTimerId: ReturnType<typeof setInterval> | null = null

  /** 批量更新缓冲区 */
  const batchBuffer: RttLogEntry[] = []

  /** 批量更新定时器 */
  let batchTimer: ReturnType<typeof setTimeout> | null = null

  /** USB 断开事件处理器引用（用于清理） */
  let usbDisconnectHandler: ((event: USBConnectionEvent) => void) | null = null

  // ==================== 计算属性 ====================

  /** 是否已连接并运行 RTT */
  const isConnected = computed(() => state.value === 'running')

  /** 是否正在连接中 */
  const isConnecting = computed(() =>
    ['requesting', 'connecting', 'scanning'].includes(state.value)
  )

  // ==================== 内部方法 ====================

  /**
   * 根据 USB 设备信息检测探针类型
   */
  function detectProbeType(device: USBDevice): WebUsbProbeType {
    for (const known of KNOWN_USB_PROBES) {
      if (known.vendorId === device.vendorId) {
        if (known.productId === undefined || known.productId === device.productId) {
          return known.type
        }
      }
    }
    return 'unknown'
  }

  /**
   * 获取探针显示名称
   */
  function getProbeDisplayName(device: USBDevice): string {
    for (const known of KNOWN_USB_PROBES) {
      if (known.vendorId === device.vendorId) {
        if (known.productId === undefined || known.productId === device.productId) {
          return known.name
        }
      }
    }
    return device.productName || 'Unknown Probe'
  }

  /**
   * 从 USBDevice 创建探针信息对象
   */
  function createProbeInfo(device: USBDevice): WebUsbProbeInfo {
    return {
      device,
      identifier: `${device.vendorId.toString(16).padStart(4, '0')}:${device.productId.toString(16).padStart(4, '0')}`,
      type: getProbeDisplayName(device),
      probeType: detectProbeType(device),
      displayName: device.productName || getProbeDisplayName(device),
      serialNumber: device.serialNumber,
      vendorId: device.vendorId,
      productId: device.productId,
      protocols: ['swd', 'jtag'],
      authorized: true,
    }
  }

  /**
   * 添加一条日志到批量缓冲区
   * 使用批量更新减少 Vue 响应式触发次数，提升高负载性能
   */
  function addLog(channel: number, text: string, level: RttLogLevel = 'info'): void {
    if (isPaused.value) return

    batchBuffer.push({
      id: ++logIdCounter,
      timestamp: Date.now(),
      level,
      channel,
      text,
    })

    if (batchBuffer.length >= BATCH_SIZE) {
      flushBatch()
    } else if (!batchTimer) {
      batchTimer = setTimeout(flushBatch, BATCH_INTERVAL)
    }
  }

  /**
   * 刷新批量缓冲区，将日志写入主数组
   */
  function flushBatch(): void {
    if (batchTimer) {
      clearTimeout(batchTimer)
      batchTimer = null
    }

    if (batchBuffer.length === 0) return

    const newEntries = batchBuffer.splice(0, batchBuffer.length)
    logs.value.splice(logs.value.length, 0, ...newEntries)

    // 超过上限时淘汰旧日志
    if (logs.value.length > MAX_LOG_ENTRIES) {
      logs.value.splice(0, logs.value.length - LOG_TRIM_THRESHOLD)
    }
  }

  /**
   * 设置错误状态
   */
  function setError(err: WebUsbError): void {
    error.value = err
    state.value = 'error'
  }

  /**
   * 清除错误状态
   */
  function clearError(): void {
    error.value = null
  }

  /**
   * 重置连接状态（断开后调用）
   */
  function resetState(): void {
    state.value = 'disconnected'
    probe.value = null
    channels.value = []
    stopPolling()
    flushBatch()
    batchBuffer.length = 0
    jstlink = null
  }

  /**
   * 启动 RTT 数据轮询
   * 仅在 jstlink 未提供 data 事件时使用轮询模式
   */
  function startPolling(): void {
    if (pollTimerId !== null) return

    pollTimerId = setInterval(async () => {
      if (!jstlink?.isConnected || isPaused.value) return

      try {
        for (const ch of channels.value) {
          const data = await jstlink.rttRead(ch.number)
          if (data) {
            addLog(ch.number, data)
          }
        }
      } catch (err) {
        console.error('[WebUSB-RTT] Poll error:', err)
      }
    }, POLL_INTERVAL)
  }

  /**
   * 停止 RTT 数据轮询
   */
  function stopPolling(): void {
    if (pollTimerId !== null) {
      clearInterval(pollTimerId)
      pollTimerId = null
    }
  }

  /**
   * 动态加载 jstlink 库
   */
  async function loadJSTLink(): Promise<JSTLinkConstructor> {
    // 从本地加载
    const module = await import('../lib/jstlink/index')
    return module.JSTLink || module
  }

  // ==================== 公共方法 ====================

  /**
   * 请求用户选择并授权 USB 设备
   *
   * 会弹出浏览器的设备选择对话框，用户选择后返回探针信息。
   *
   * @returns 探针信息，失败返回 null
   */
  async function requestDevice(): Promise<WebUsbProbeInfo | null> {
    clearError()

    const supportError = checkWebUsbSupport()
    if (supportError) {
      setError(supportError)
      return null
    }

    state.value = 'requesting'

    try {
      // 构建 USB 设备过滤器
      const filters: USBDeviceFilter[] = KNOWN_USB_PROBES.map(p => ({
        vendorId: p.vendorId,
        ...(p.productId !== undefined && { productId: p.productId }),
      }))

      // 请求用户选择设备
      const device = await navigator.usb.requestDevice({ filters })
      const info = createProbeInfo(device)

      probe.value = info
      state.value = 'disconnected' // 等待用户点击连接

      return info
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'NotFoundError') {
          setError(createError('device_not_found', '未选择任何设备'))
        } else if (err.name === 'SecurityError') {
          setError(createError('permission_denied', '用户拒绝了设备访问权限'))
        } else {
          setError(createError('unknown', `请求设备失败: ${err.message}`))
        }
      } else {
        setError(createError('unknown', `请求设备失败: ${String(err)}`))
      }
      state.value = 'disconnected'
      return null
    }
  }

  /**
   * 连接到目标设备并初始化 RTT
   *
   * 流程：
   * 1. 如果未选择设备，先请求用户选择
   * 2. 连接 USB 设备
   * 3. 设置 SWD 时钟频率
   * 4. 扫描 RTT 控制块
   * 5. 启动 RTT 数据轮询
   *
   * @param customFrequency 可选的自定义 SWD 频率
   * @returns 连接是否成功
   */
  async function connect(customFrequency?: number): Promise<boolean> {
    clearError()

    // 如果没有选择设备，先请求
    if (!probe.value?.device) {
      const newProbe = await requestDevice()
      if (!newProbe) return false
    }

    state.value = 'connecting'

    // 添加超时处理
    const timeout = 30000 // 30秒超时
    const timeoutPromise = new Promise<false>((_, reject) => {
      setTimeout(() => {
        reject(new Error('连接超时'))
      }, timeout)
    })

    try {
      const result = await Promise.race([
        doConnect(customFrequency),
        timeoutPromise
      ])
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(createError('connection_failed', `连接失败: ${message}`))
      await disconnect()
      return false
    }
  }

  /**
   * 执行实际的连接操作
   */
  async function doConnect(customFrequency?: number): Promise<boolean> {
    try {
      // 动态加载 jstlink 库
      const JSTLink = await loadJSTLink()
      jstlink = new JSTLink()

      console.log('[WebUSB-RTT] 开始连接设备...')

      // 连接设备 - 传递已选择的设备，避免再次请求
      await jstlink.connect(probe.value?.device)
      console.log('[WebUSB-RTT] 设备已连接')

      // 设置 SWD 时钟频率
      const freq = customFrequency ?? frequency.value
      await jstlink.setSpeed(freq)
      frequency.value = freq
      console.log('[WebUSB-RTT] 频率已设置:', freq)

      // 扫描 RTT 控制块
      state.value = 'scanning'
      console.log('[WebUSB-RTT] 开始扫描 RTT 控制块...')

      const rttChannels = await jstlink.rttStart(RTT_SEARCH_START, RTT_SEARCH_END)

      if (!rttChannels || rttChannels.length === 0) {
        setError(
          createError(
            'rtt_not_found',
            '未找到 RTT 控制块。请确保：\n1. 目标程序已启用 RTT\n2. 目标芯片已正确连接\n3. 目标程序正在运行'
          )
        )
        await disconnect()
        return false
      }

      console.log('[WebUSB-RTT] RTT 通道:', rttChannels.length)
      channels.value = rttChannels

      // 注册事件回调 - jstlink 的 data 事件提供实时数据
      let useEventMode = false
      jstlink.on('data', (channel: number, data: string) => {
        useEventMode = true
        addLog(channel, data)
      })

      jstlink.on('error', (err: Error) => {
        console.error('[WebUSB-RTT] Error:', err)
        if (err.message.toLowerCase().includes('disconnect')) {
          resetState()
          setError(createError('device_disconnected', '设备已断开连接'))
        }
      })

      // 仅在事件模式不可用时启动轮询，避免双重数据接收
      // 延迟检测：如果 data 事件在 100ms 内未触发，则启用轮询
      setTimeout(() => {
        if (!useEventMode) {
          console.log('[WebUSB-RTT] 事件模式不可用，启用轮询模式')
          startPolling()
        }
      }, 100)

      state.value = 'running'
      addLog(0, `✅ WebUSB-RTT 连接成功 (${probe.value?.displayName}, ${(freq / 1000000).toFixed(0)} MHz)`, 'info')

      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[WebUSB-RTT] 连接错误:', message)

      // 根据错误类型设置友好的错误消息
      if (message.includes('not found') || message.includes('No device')) {
        setError(createError('device_not_found', '未找到调试探针，请检查 USB 连接'))
      } else if (message.includes('permission') || message.includes('denied')) {
        setError(createError('permission_denied', '设备访问权限被拒绝'))
      } else if (message.includes('RTT')) {
        setError(createError('rtt_not_found', message))
      } else {
        setError(createError('connection_failed', `连接失败: ${message}`))
      }

      await disconnect()
      return false
    }
  }

  /**
   * 断开与设备的连接
   */
  async function disconnect(): Promise<void> {
    stopPolling()

    if (jstlink) {
      try {
        if (jstlink.isConnected) {
          await jstlink.rttStop()
          await jstlink.disconnect()
        }
      } catch {
        // 忽略断开时的错误
      }
      jstlink = null
    }

    resetState()
  }

  /**
   * 向目标发送数据
   * @param data 要发送的文本数据
   * @param channel 目标通道号，默认为 0
   */
  async function send(data: string, channel: number = 0): Promise<void> {
    if (!jstlink?.isConnected) {
      console.warn('[WebUSB-RTT] 未连接，无法发送数据')
      return
    }

    try {
      await jstlink.rttWrite(channel, data)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(createError('write_error', `发送失败: ${message}`))
    }
  }

  /**
   * 清空所有日志
   */
  function clearLogs(): void {
    flushBatch()
    logs.value = []
    logIdCounter = 0
  }

  /**
   * 切换暂停状态
   */
  function togglePause(): void {
    isPaused.value = !isPaused.value
  }

  // ==================== 生命周期钩子 ====================

  // 监听 USB 设备断开事件（保存引用以便清理）
  if (navigator.usb) {
    usbDisconnectHandler = (event: USBConnectionEvent) => {
      if (event.device === probe.value?.device) {
        resetState()
        setError(createError('device_disconnected', '设备已断开连接'))
      }
    }
    navigator.usb.addEventListener('disconnect', usbDisconnectHandler)
  }

  // 组件卸载时自动断开并清理所有资源
  onUnmounted(() => {
    // 移除 USB 断开事件监听器，防止内存泄漏
    if (usbDisconnectHandler && navigator.usb) {
      navigator.usb.removeEventListener('disconnect', usbDisconnectHandler)
      usbDisconnectHandler = null
    }
    // 清理批量缓冲区
    flushBatch()
    batchBuffer.length = 0
    if (batchTimer) {
      clearTimeout(batchTimer)
      batchTimer = null
    }
    disconnect()
  })

  // ==================== 导出 ====================

  return {
    // 状态
    isSupported,
    state,
    probe,
    error,
    frequency,
    channels,
    logs,
    isPaused,

    // 计算属性
    isConnected,
    isConnecting,

    // 方法
    requestDevice,
    connect,
    disconnect,
    send,
    clearLogs,
    togglePause,
    clearError,
  }
}
