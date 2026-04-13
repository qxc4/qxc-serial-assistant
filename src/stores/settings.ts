import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import { ref, watch } from 'vue'

export interface SerialDefaults {
  baudRate: number
  dataBits: 8 | 7
  stopBits: 1 | 2
  parity: 'none' | 'even' | 'odd'
}

export interface PortInfo {
  vendorId?: string
  productId?: string
  portName?: string
}

export type DisplayMode = 'rx' | 'tx' | 'mixed'
export type CharEncoding = 'utf8' | 'ascii' | 'gbk' | 'hex'

export interface UISettings {
  displayMode: DisplayMode
  receiveEncoding: CharEncoding
  sendEncoding: CharEncoding
  showTimestamp: boolean
  autoScroll: boolean
  showLeftPanel: boolean
  showRightPanel: boolean
  showBottomPanel: boolean
  toolbarExpanded: {
    display: boolean
    encoding: boolean
    options: boolean
  }
}

export interface ReconnectSettings {
  enabled: boolean
  interval: number
  maxAttempts: number
}

export interface ShortcutSettings {
  send: string
  toggleConnect: string
  clearData: string
  saveGroup: string
  toggleExecution: string
  stopExecution: string
  showHelp: string
  [key: string]: string
}

/** 数据解析模式 */
export type ParseMode =
  | 'none'
  | 'modbus-rtu'
  | 'modbus-ascii'
  | 'custom-frame'
  | 'hex-display'
  | 'ascii-display'

/** 自定义协议配置 */
export interface CustomProtocolConfig {
  frameHeader: string        // 帧头，十六进制字符串，如 "AA 55"
  frameTail: string          // 帧尾，十六进制字符串，如 "0D 0A"，可选
  lengthField: {
    enabled: boolean
    offset: number           // 长度字段偏移量
    size: 1 | 2              // 长度字段字节数
    includesHeader: boolean  // 长度是否包含帧头
  }
  checksum: {
    type: 'none' | 'sum' | 'xor' | 'crc16' | 'crc16-modbus'
    offset: number           // 校验码偏移量（相对于数据起始）
  }
  dataOffset: number         // 数据起始偏移量
}

/** 数据解析配置 */
export interface ParseSettings {
  enabled: boolean
  mode: ParseMode
  showParseResult: boolean
  autoParse: boolean
  customProtocol: CustomProtocolConfig
}

/** 图表数据通道配置 */
export interface ChartChannelConfig {
  enabled: boolean
  name: string
  color: string
  dataSource: 'serial' | 'network' | 'manual'
  parseRule: {
    startByte: number
    byteLength: number
    byteOrder: 'big' | 'little'
    dataType: 'uint8' | 'int8' | 'uint16' | 'int16' | 'uint32' | 'int32' | 'float'
  }
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  language: 'zh-CN' | 'en-US'
  notificationsEnabled: boolean
  autoConnect: boolean
  privacyAnalytics: boolean
  serialDefaults: SerialDefaults
  lastUsedPort?: PortInfo
  uiSettings: UISettings
  reconnectSettings: ReconnectSettings
  shortcutSettings: ShortcutSettings
  parseSettings: ParseSettings
  chartChannels: ChartChannelConfig[]
}

const DEFAULT_UI_SETTINGS: UISettings = {
  displayMode: 'mixed',
  receiveEncoding: 'utf8',
  sendEncoding: 'utf8',
  showTimestamp: false,
  autoScroll: true,
  showLeftPanel: true,
  showRightPanel: true,
  showBottomPanel: true,
  toolbarExpanded: {
    display: true,
    encoding: true,
    options: true,
  },
}

const DEFAULT_RECONNECT_SETTINGS: ReconnectSettings = {
  enabled: true,
  interval: 3000,
  maxAttempts: 5,
}

const DEFAULT_SHORTCUT_SETTINGS: ShortcutSettings = {
  send: 'Ctrl+Enter',
  toggleConnect: 'Ctrl+Shift+C',
  clearData: 'Ctrl+Shift+X',
  saveGroup: 'Ctrl+S',
  toggleExecution: 'Space',
  stopExecution: 'Escape',
  showHelp: '?',
}

const DEFAULT_PARSE_SETTINGS: ParseSettings = {
  enabled: false,
  mode: 'none',
  showParseResult: true,
  autoParse: true,
  customProtocol: {
    frameHeader: 'AA 55',
    frameTail: '',
    lengthField: {
      enabled: true,
      offset: 2,
      size: 1,
      includesHeader: false
    },
    checksum: {
      type: 'sum',
      offset: 0
    },
    dataOffset: 3
  }
}

const DEFAULT_CHART_CHANNELS: ChartChannelConfig[] = [
  { enabled: true, name: '通道1', color: '#3B82F6', dataSource: 'serial', parseRule: { startByte: 0, byteLength: 2, byteOrder: 'big', dataType: 'uint16' } },
  { enabled: true, name: '通道2', color: '#10B981', dataSource: 'serial', parseRule: { startByte: 2, byteLength: 2, byteOrder: 'big', dataType: 'uint16' } },
  { enabled: true, name: '通道3', color: '#F59E0B', dataSource: 'serial', parseRule: { startByte: 4, byteLength: 2, byteOrder: 'big', dataType: 'uint16' } },
]

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'zh-CN',
  notificationsEnabled: true,
  autoConnect: false,
  privacyAnalytics: false,
  serialDefaults: {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
  },
  lastUsedPort: undefined,
  uiSettings: { ...DEFAULT_UI_SETTINGS },
  reconnectSettings: { ...DEFAULT_RECONNECT_SETTINGS },
  shortcutSettings: { ...DEFAULT_SHORTCUT_SETTINGS },
  parseSettings: { ...DEFAULT_PARSE_SETTINGS },
  chartChannels: [...DEFAULT_CHART_CHANNELS],
}

/** 深度合并默认值，确保所有字段存在 */
function deepMergeDefaults<T extends Record<string, any>>(target: T, defaults: T): T {
  const result = { ...defaults }
  for (const key of Object.keys(target)) {
    if (target[key] !== undefined) {
      if (
        typeof target[key] === 'object' && target[key] !== null &&
        typeof defaults[key] === 'object' && defaults[key] !== null &&
        !Array.isArray(target[key]) && !Array.isArray(defaults[key])
      ) {
        (result as any)[key] = deepMergeDefaults(target[key], defaults[key])
      } else {
        (result as any)[key] = target[key]
      }
    }
  }
  return result
}

/** 允许导入的配置字段白名单 */
const ALLOWED_IMPORT_KEYS = new Set([
  'theme', 'language', 'notificationsEnabled', 'autoConnect', 'privacyAnalytics',
  'serialDefaults', 'lastUsedPort', 'uiSettings', 'reconnectSettings',
  'shortcutSettings', 'parseSettings', 'chartChannels',
])

export const useSettingsStore = defineStore('settings', () => {
  const config = useStorage<AppSettings>('qxc-serial-settings', { ...DEFAULT_SETTINGS })

  /** 确保配置中包含所有必需字段（处理旧版本配置升级） */
  function ensureConfigFields() {
    config.value = deepMergeDefaults(config.value, DEFAULT_SETTINGS)
  }

  ensureConfigFields()

  const toastMessage = ref('')
  const toastVisible = ref(false)
  let toastTimer: ReturnType<typeof setTimeout> | null = null
  let systemThemeMq: MediaQueryList | null = null
  let systemThemeHandler: ((e: MediaQueryListEvent) => void) | null = null

  const applyTheme = () => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    if (config.value.theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      root.classList.add(systemTheme)
    } else {
      root.classList.add(config.value.theme)
    }
  }

  // theme 是字符串，不需要 deep: true
  watch(() => config.value.theme, () => {
    applyTheme()
  })

  const listenSystemThemeChange = () => {
    if (systemThemeMq) return
    systemThemeMq = window.matchMedia('(prefers-color-scheme: dark)')
    systemThemeHandler = () => {
      if (config.value.theme === 'system') {
        applyTheme()
      }
    }
    systemThemeMq.addEventListener('change', systemThemeHandler)
  }

  const stopListenSystemThemeChange = () => {
    if (systemThemeMq && systemThemeHandler) {
      systemThemeMq.removeEventListener('change', systemThemeHandler)
      systemThemeMq = null
      systemThemeHandler = null
    }
  }

  // Pinia store 不支持 onMounted/onUnmounted，改为在 store 首次使用时初始化
  applyTheme()
  listenSystemThemeChange()

  const showToast = (msg: string) => {
    toastMessage.value = msg
    toastVisible.value = true
    if (toastTimer) {
      clearTimeout(toastTimer)
    }
    toastTimer = setTimeout(() => {
      toastVisible.value = false
      toastTimer = null
    }, 2500)
  }

  const resetToDefault = () => {
    config.value = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
    showToast('已恢复默认设置')
  }

  const resetShortcuts = () => {
    config.value.shortcutSettings = { ...DEFAULT_SHORTCUT_SETTINGS }
    showToast('快捷键已恢复默认')
  }

  const exportConfig = (): string => {
    return JSON.stringify(config.value, null, 2)
  }

  const downloadConfig = () => {
    const jsonStr = exportConfig()
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `qxc-serial-config-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    try {
      link.click()
    } finally {
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }
    showToast('配置文件已导出')
  }

  const importConfig = (jsonStr: string): boolean => {
    try {
      const parsed = JSON.parse(jsonStr)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        showToast('配置文件格式错误')
        return false
      }
      // 白名单过滤，只保留已知字段
      const filtered: Record<string, any> = {}
      for (const key of Object.keys(parsed)) {
        if (ALLOWED_IMPORT_KEYS.has(key)) {
          filtered[key] = parsed[key]
        }
      }
      // 深度合并默认值确保完整性
      const merged = deepMergeDefaults(filtered as Partial<AppSettings>, DEFAULT_SETTINGS) as AppSettings
      config.value = merged
      showToast('配置导入成功')
      return true
    } catch {
      showToast('配置文件格式错误')
      return false
    }
  }

  const clearAllData = () => {
    config.value = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
    showToast('本地数据已清除')
  }

  /** 清理系统主题监听器（应用卸载时调用） */
  const cleanup = () => {
    stopListenSystemThemeChange()
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }
  }

  return {
    config,
    toastMessage,
    toastVisible,
    applyTheme,
    resetToDefault,
    resetShortcuts,
    exportConfig,
    downloadConfig,
    importConfig,
    clearAllData,
    showToast,
    cleanup,
  }
})
