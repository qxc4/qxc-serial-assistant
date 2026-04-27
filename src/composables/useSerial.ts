import { ref, watch, computed, shallowRef } from 'vue'
import { useSettingsStore } from '../stores/settings'

/** 校验位类型 */
type ParityType = 'none' | 'even' | 'odd'

/** 最大保留数据条数（环形缓冲区容量） */
const MAX_DATA_ENTRIES = 10000

// 状态提升为全局单例，保证跨页面切换（Router）时串口连接状态不丢失
const isSupported = ref('serial' in navigator)
const isConnected = ref(false)
const port = ref<SerialPort | null>(null)
const reader = ref<ReadableStreamDefaultReader | null>(null)
const writer = ref<WritableStreamDefaultWriter | null>(null)

/** 获取重连配置 */
const getReconnectSettings = () => {
  const settingsStore = useSettingsStore()
  return settingsStore.config.reconnectSettings
}

/** 字符编码类型 */
type CharEncoding = 'utf8' | 'ascii' | 'hex' | 'gbk'

/** 接收数据编码模式 */
const receiveEncoding = ref<CharEncoding>('utf8')
/** 发送数据编码模式 */
const sendEncoding = ref<CharEncoding>('utf8')

/** 缓存的 TextDecoder 实例 */
const decoderCache = new Map<string, TextDecoder>()

/** 获取或创建 TextDecoder */
function getDecoder(encoding: string): TextDecoder {
  let decoder = decoderCache.get(encoding)
  if (!decoder) {
    decoder = new TextDecoder(encoding)
    decoderCache.set(encoding, decoder)
  }
  return decoder
}

/** 缓存的 TextEncoder 实例 */
let textEncoder: TextEncoder | null = null

/** 获取 TextEncoder */
function getEncoder(): TextEncoder {
  if (!textEncoder) {
    textEncoder = new TextEncoder()
  }
  return textEncoder
}

/** HEX 字符映射表 */
const HEX_CHARS = '0123456789ABCDEF'

/** 字节到 HEX 字符串的快速转换 */
function byteToHex(byte: number): string {
  return HEX_CHARS[byte >> 4] + HEX_CHARS[byte & 0x0F]
}

// Data & Stats
interface TimestampedData {
  /** 唯一标识符（用于 Vue 列表渲染 key） */
  id: number
  timestamp: number
  data: string
  direction: 'rx' | 'tx'
  /** 原始字节数据（用于编码切换时重新解码） */
  rawBytes?: Uint8Array
}

/** 数据条目 ID 计数器 */
let dataIdCounter = 0

/** 环形缓冲区实现 */
class RingBuffer<T> {
  #buffer: T[]
  #head = 0
  #tail = 0
  #count = 0
  #capacity: number

  constructor(capacity: number) {
    this.#capacity = capacity
    this.#buffer = new Array(capacity)
  }

  push(item: T): void {
    this.#buffer[this.#tail] = item
    this.#tail = (this.#tail + 1) % this.#capacity
    if (this.#count < this.#capacity) {
      this.#count++
    } else {
      this.#head = (this.#head + 1) % this.#capacity
    }
  }

  toArray(): T[] {
    const result: T[] = []
    for (let i = 0; i < this.#count; i++) {
      result.push(this.#buffer[(this.#head + i) % this.#capacity])
    }
    return result
  }

  get length(): number {
    return this.#count
  }

  clear(): void {
    this.#head = 0
    this.#tail = 0
    this.#count = 0
  }
}

/** 使用环形缓冲区存储接收数据 */
const dataBuffer = new RingBuffer<TimestampedData>(MAX_DATA_ENTRIES)
const receivedData = shallowRef<TimestampedData[]>([])
const txBytes = ref(0)
const rxBytes = ref(0)
const showTimestamp = ref(true)

/** 重连状态 */
const isReconnecting = ref(false)
const reconnectAttempts = ref(0)

/** 发送队列（避免并发写入冲突） */
const sendQueue: Array<{ data: string; isHex: boolean; resolve: () => void; reject: (err: Error) => void }> = []
let isSending = false

/** 接收数据缓冲区（用于合并短数据包） */
let rxBuffer: Uint8Array[] = []
let rxBufferTimer: ReturnType<typeof setTimeout> | null = null
const RX_BUFFER_TIMEOUT = 50 // 50ms 合并窗口

/** 数据接收回调列表 */
const dataReceiveCallbacks: Array<(data: Uint8Array, direction: 'rx' | 'tx') => void> = []

/** 上次成功连接的配置（用于重连） */
let lastConnectConfig: { baudRate: number; dataBits: number; stopBits: number; parity: string } | null = null

/** 之前选择的串口（用于重新启用） */
const lastSelectedPort = ref<SerialPort | null>(null)
/** 是否有可重新启用的串口 */
const canReconnect = ref(false)

export function useSerial() {
  const store = useSettingsStore()

  const baudRate = ref(store.config.serialDefaults.baudRate)
  const dataBits = ref(store.config.serialDefaults.dataBits)
  const stopBits = ref(store.config.serialDefaults.stopBits)
  const parity = ref(store.config.serialDefaults.parity)

  watch(() => store.config.serialDefaults, (newDefaults) => {
    baudRate.value = newDefaults.baudRate
    dataBits.value = newDefaults.dataBits
    stopBits.value = newDefaults.stopBits
    parity.value = newDefaults.parity
  }, { deep: true })

  /**
   * 根据编码模式解码字节数据（优化版）
   */
  function decodeBytes(bytes: Uint8Array, encoding: CharEncoding): string {
    const len = bytes.length
    if (len === 0) return ''
    
    switch (encoding) {
      case 'hex': {
        let result = ''
        for (let i = 0; i < len; i++) {
          result += byteToHex(bytes[i]) + ' '
        }
        return result
      }
      case 'ascii': {
        let result = ''
        for (let i = 0; i < len; i++) {
          const b = bytes[i]
          result += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.'
        }
        return result
      }
      case 'gbk':
        try {
          return getDecoder('gbk').decode(bytes)
        } catch {
          return getDecoder('utf-8').decode(bytes)
        }
      case 'utf8':
      default:
        return getDecoder('utf-8').decode(bytes)
    }
  }

  /**
   * 根据编码模式将字符串编码为字节数组（优化版）
   */
  function encodeString(str: string, encoding: CharEncoding): Uint8Array {
    switch (encoding) {
      case 'hex': {
        const hexStr = str.replace(/\s/g, '')
        const len = Math.ceil(hexStr.length / 2)
        const buffer = new Uint8Array(len)
        for (let i = 0; i < len; i++) {
          const byteStr = hexStr.substring(i * 2, i * 2 + 2)
          const byteValue = parseInt(byteStr, 16)
          if (!isNaN(byteValue)) {
            buffer[i] = byteValue
          }
        }
        return buffer
      }
      case 'ascii': {
        const len = str.length
        const buffer = new Uint8Array(len)
        for (let i = 0; i < len; i++) {
          buffer[i] = str.charCodeAt(i) & 0x7F
        }
        return buffer
      }
      case 'gbk':
      case 'utf8':
      default:
        return getEncoder().encode(str)
    }
  }

  /**
   * 更新接收数据的响应式引用
   */
  function updateReceivedData(): void {
    receivedData.value = dataBuffer.toArray()
  }

  /**
   * 刷新接收缓冲区，将缓冲数据合并后显示
   */
  function flushRxBuffer(): void {
    if (rxBuffer.length === 0) return
    
    // 合并所有缓冲数据
    const totalLength = rxBuffer.reduce((sum, arr) => sum + arr.length, 0)
    const merged = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of rxBuffer) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    
    // 清空缓冲区
    rxBuffer = []
    rxBufferTimer = null
    
    // 创建显示条目
    const entry: TimestampedData = {
      id: ++dataIdCounter,
      timestamp: Date.now(),
      data: decodeBytes(merged, receiveEncoding.value),
      direction: 'rx',
      rawBytes: merged
    }
    
    dataBuffer.push(entry)
    updateReceivedData()
    
    // 触发数据接收回调
    for (const callback of dataReceiveCallbacks) {
      try {
        callback(merged, 'rx')
      } catch (e) {
        console.error('数据接收回调执行错误:', e)
      }
    }
  }

  /**
   * 将接收数据添加到缓冲区，并设置超时刷新
   */
  function bufferRxData(data: Uint8Array): void {
    rxBuffer.push(data)
    
    // 清除之前的定时器，重新开始计时
    if (rxBufferTimer) {
      clearTimeout(rxBufferTimer)
    }
    rxBufferTimer = setTimeout(flushRxBuffer, RX_BUFFER_TIMEOUT)
  }

  /**
   * 连接串口
   */
  const connect = async () => {
    if (!isSupported.value) {
      alert('您的浏览器不支持 Web Serial API。请使用较新版本的 Chrome 或 Edge。')
      return
    }

    try {
      port.value = await navigator.serial.requestPort()
      await port.value.open({ 
        baudRate: baudRate.value,
        dataBits: dataBits.value,
        stopBits: stopBits.value,
        parity: parity.value,
      })

      // 保存选择的串口用于重新启用
      lastSelectedPort.value = port.value
      
      isConnected.value = true
      canReconnect.value = false
      txBytes.value = 0
      rxBytes.value = 0
      reconnectAttempts.value = 0
      isReconnecting.value = false
      
      lastConnectConfig = {
        baudRate: baudRate.value,
        dataBits: dataBits.value,
        stopBits: stopBits.value,
        parity: parity.value
      }

      readLoop()
    } catch (error) {
      console.error('连接串口失败:', error)
      alert('连接失败，请检查串口是否被占用或未授权')
    }
  }

  /**
   * 断开串口连接
   */
  const disconnect = async () => {
    isConnected.value = false
    isReconnecting.value = false
    
    // 刷新接收缓冲区，确保最后的数据不丢失
    if (rxBufferTimer) {
      clearTimeout(rxBufferTimer)
      rxBufferTimer = null
    }
    flushRxBuffer()
    
    try {
      if (reader.value) {
        try {
          await reader.value.cancel()
        } catch {}
        try {
          reader.value.releaseLock()
        } catch {}
        reader.value = null
      }
      if (writer.value) {
        try {
          writer.value.releaseLock()
        } catch {}
        writer.value = null
      }
      if (port.value) {
        await port.value.close()
        // 不清空 port.value，保留引用用于重新启用
        // port.value = null
      }
      // 设置可重新启用状态
      canReconnect.value = !!lastSelectedPort.value
    } catch (error) {
      console.error('断开连接失败:', error)
    }
  }

  /**
   * 重新启用之前选择的串口
   */
  const reconnect = async () => {
    if (!lastSelectedPort.value) {
      alert('没有可重新启用的串口')
      return
    }

    try {
      // 检查串口是否仍然可用
      const ports = await navigator.serial.getPorts()
      if (!ports.includes(lastSelectedPort.value)) {
        alert('之前的串口设备已断开，请重新选择')
        lastSelectedPort.value = null
        canReconnect.value = false
        return
      }

      port.value = lastSelectedPort.value
      
      // 如果串口已打开，先关闭
      if (port.value.readable || port.value.writable) {
        await port.value.close()
      }

      await port.value.open({ 
        baudRate: baudRate.value,
        dataBits: dataBits.value,
        stopBits: stopBits.value,
        parity: parity.value,
      })

      isConnected.value = true
      canReconnect.value = false
      txBytes.value = 0
      rxBytes.value = 0
      reconnectAttempts.value = 0
      isReconnecting.value = false
      
      lastConnectConfig = {
        baudRate: baudRate.value,
        dataBits: dataBits.value,
        stopBits: stopBits.value,
        parity: parity.value
      }

      readLoop()
    } catch (error) {
      console.error('重新启用串口失败:', error)
      alert('重新启用失败，请重新选择串口')
      canReconnect.value = false
    }
  }

  /**
   * 尝试重新连接（迭代方式，避免递归栈溢出）
   */
  async function attemptReconnect(): Promise<boolean> {
    const reconnectSettings = getReconnectSettings()
    if (!lastConnectConfig || !reconnectSettings.enabled) return false

    isReconnecting.value = true

    while (reconnectAttempts.value < reconnectSettings.maxAttempts) {
      reconnectAttempts.value++

      try {
        const ports = await navigator.serial.getPorts()
        if (ports.length > 0) {
          port.value = ports[0]
          await port.value.open({
            baudRate: lastConnectConfig.baudRate,
            dataBits: lastConnectConfig.dataBits as 7 | 8,
            stopBits: lastConnectConfig.stopBits as 1 | 2,
            parity: lastConnectConfig.parity as ParityType
          })

          isConnected.value = true
          isReconnecting.value = false
          reconnectAttempts.value = 0
          readLoop()
          return true
        }
      } catch (err) {
        console.warn(`重连尝试 ${reconnectAttempts.value}/${reconnectSettings.maxAttempts} 失败:`, err)
      }

      // 等待重连间隔
      await new Promise(r => setTimeout(r, reconnectSettings.interval))
    }

    isReconnecting.value = false
    return false
  }

  /**
   * 读取数据循环
   */
  const readLoop = async () => {
    if (!port.value) return

    while (port.value.readable && isConnected.value) {
      const currentReader = port.value.readable.getReader()
      reader.value = currentReader
      try {
        while (true) {
          const { value, done } = await currentReader.read()
          if (done) break
          
          if (value) {
            rxBytes.value += value.length
            bufferRxData(value)
          }
        }
      } catch (error: any) {
        const reconnectSettings = getReconnectSettings()
        if (error.name === 'NetworkError' && reconnectSettings.enabled) {
          isConnected.value = false
          console.log('检测到连接断开，尝试自动重连...')
          const reconnected = await attemptReconnect()
          if (!reconnected) {
            console.error('自动重连失败')
          }
          return
        }
        console.error('读取数据出错:', error)
      } finally {
        try {
          currentReader.releaseLock()
        } catch {}
      }
    }
  }

  /**
   * 处理发送队列
   */
  async function processSendQueue(): Promise<void> {
    if (isSending || sendQueue.length === 0) return
    isSending = true

    while (sendQueue.length > 0) {
      const item = sendQueue.shift()!
      try {
        if (!port.value || !port.value.writable) {
          item.reject(new Error('串口未连接'))
          continue
        }

        const currentWriter = port.value.writable.getWriter()
        writer.value = currentWriter
        try {
          const buffer = item.isHex 
            ? encodeString(item.data, 'hex')
            : encodeString(item.data, sendEncoding.value)
          
          txBytes.value += buffer.length
          await currentWriter.write(buffer)
          
          const entry: TimestampedData = {
            id: ++dataIdCounter,
            timestamp: Date.now(),
            data: item.data,
            direction: 'tx',
            rawBytes: buffer
          }
          
          dataBuffer.push(entry)
          updateReceivedData()
          
          // 触发数据发送回调
          for (const callback of dataReceiveCallbacks) {
            try {
              callback(buffer, 'tx')
            } catch (e) {
              console.error('数据发送回调执行错误:', e)
            }
          }
          
          item.resolve()
        } finally {
          currentWriter.releaseLock()
        }
      } catch (err) {
        item.reject(err instanceof Error ? err : new Error(String(err)))
      }
    }

    isSending = false
  }

  /**
   * 发送数据（队列化）
   */
  const send = async (data: string, isHex = false): Promise<void> => {
    return new Promise((resolve, reject) => {
      sendQueue.push({ data, isHex, resolve, reject })
      processSendQueue()
    })
  }

  /**
   * 清空接收数据
   */
  const clearData = () => {
    dataBuffer.clear()
    updateReceivedData()
  }

  /**
   * 导出数据
   */
  const exportData = () => {
    const dataArray = dataBuffer.toArray()
    if (!dataArray.length) return
    
    const formatTimestamp = (timestamp: number) => {
      const date = new Date(timestamp)
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`
    }
    
    const logContent = dataArray.map(item => {
      const timestamp = formatTimestamp(item.timestamp)
      const direction = item.direction === 'rx' ? 'RX' : 'TX'
      return `[${timestamp}] ${direction}: ${item.data}`
    }).join('\n')
    
    const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `serial_log_${new Date().getTime()}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  /**
   * 重新解码所有数据（编码切换时调用）
   */
  function redecodeAllData(): void {
    const dataArray = dataBuffer.toArray()
    const newBuffer = new RingBuffer<TimestampedData>(MAX_DATA_ENTRIES)
    
    for (const item of dataArray) {
      if (item.direction === 'rx' && item.rawBytes) {
        newBuffer.push({
          ...item,
          data: decodeBytes(item.rawBytes, receiveEncoding.value)
        })
      } else {
        newBuffer.push(item)
      }
    }
    
    dataBuffer.clear()
    for (const item of newBuffer.toArray()) {
      dataBuffer.push(item)
    }
    updateReceivedData()
  }

  /** 数据条数统计 */
  const dataCount = computed(() => dataBuffer.length)

  /**
   * 注册数据接收回调
   */
  function onDataReceive(callback: (data: Uint8Array, direction: 'rx' | 'tx') => void): () => void {
    dataReceiveCallbacks.push(callback)
    return () => {
      const index = dataReceiveCallbacks.indexOf(callback)
      if (index > -1) {
        dataReceiveCallbacks.splice(index, 1)
      }
    }
  }

  return {
    isSupported,
    isConnected,
    baudRate,
    dataBits,
    stopBits,
    parity,
    receivedData,
    txBytes,
    rxBytes,
    showTimestamp,
    receiveEncoding,
    sendEncoding,
    isReconnecting,
    reconnectAttempts,
    dataCount,
    canReconnect,
    connect,
    disconnect,
    reconnect,
    send,
    clearData,
    exportData,
    redecodeAllData,
    onDataReceive
  }
}
