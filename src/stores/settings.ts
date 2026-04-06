import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import { ref, watch, onMounted, onUnmounted } from 'vue'

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
}

export const useSettingsStore = defineStore('settings', () => {
  const config = useStorage<AppSettings>('qxc-serial-settings', { ...DEFAULT_SETTINGS })
  
  /** 确保配置中包含所有必需字段（处理旧版本配置升级） */
  function ensureConfigFields() {
    if (!config.value.uiSettings) {
      config.value.uiSettings = { ...DEFAULT_UI_SETTINGS }
    } else {
      if (config.value.uiSettings.displayMode === undefined) {
        config.value.uiSettings.displayMode = DEFAULT_UI_SETTINGS.displayMode
      }
      if (config.value.uiSettings.receiveEncoding === undefined) {
        config.value.uiSettings.receiveEncoding = DEFAULT_UI_SETTINGS.receiveEncoding
      }
      if (config.value.uiSettings.sendEncoding === undefined) {
        config.value.uiSettings.sendEncoding = DEFAULT_UI_SETTINGS.sendEncoding
      }
      if (config.value.uiSettings.showTimestamp === undefined) {
        config.value.uiSettings.showTimestamp = DEFAULT_UI_SETTINGS.showTimestamp
      }
      if (config.value.uiSettings.autoScroll === undefined) {
        config.value.uiSettings.autoScroll = DEFAULT_UI_SETTINGS.autoScroll
      }
      if (config.value.uiSettings.showLeftPanel === undefined) {
        config.value.uiSettings.showLeftPanel = DEFAULT_UI_SETTINGS.showLeftPanel
      }
      if (config.value.uiSettings.showRightPanel === undefined) {
        config.value.uiSettings.showRightPanel = DEFAULT_UI_SETTINGS.showRightPanel
      }
      if (config.value.uiSettings.showBottomPanel === undefined) {
        config.value.uiSettings.showBottomPanel = DEFAULT_UI_SETTINGS.showBottomPanel
      }
      if (!config.value.uiSettings.toolbarExpanded) {
        config.value.uiSettings.toolbarExpanded = { ...DEFAULT_UI_SETTINGS.toolbarExpanded }
      }
    }
    if (!config.value.reconnectSettings) {
      config.value.reconnectSettings = { ...DEFAULT_RECONNECT_SETTINGS }
    } else {
      if (config.value.reconnectSettings.enabled === undefined) {
        config.value.reconnectSettings.enabled = DEFAULT_RECONNECT_SETTINGS.enabled
      }
      if (config.value.reconnectSettings.interval === undefined) {
        config.value.reconnectSettings.interval = DEFAULT_RECONNECT_SETTINGS.interval
      }
      if (config.value.reconnectSettings.maxAttempts === undefined) {
        config.value.reconnectSettings.maxAttempts = DEFAULT_RECONNECT_SETTINGS.maxAttempts
      }
    }
    if (!config.value.shortcutSettings) {
      config.value.shortcutSettings = { ...DEFAULT_SHORTCUT_SETTINGS }
    } else {
      const shortcuts = ['send', 'toggleConnect', 'clearData', 'saveGroup', 'toggleExecution', 'stopExecution', 'showHelp'] as const
      for (const key of shortcuts) {
        if (config.value.shortcutSettings[key] === undefined) {
          config.value.shortcutSettings[key] = DEFAULT_SHORTCUT_SETTINGS[key]
        }
      }
    }
  }
  
  ensureConfigFields()
  
  const toastMessage = ref('')
  const toastVisible = ref(false)
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

  watch(() => config.value.theme, () => {
    applyTheme()
  }, { deep: true })

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

  onMounted(() => {
    applyTheme()
    listenSystemThemeChange()
  })

  onUnmounted(() => {
    stopListenSystemThemeChange()
  })

  const showToast = (msg: string) => {
    toastMessage.value = msg
    toastVisible.value = true
    setTimeout(() => {
      toastVisible.value = false
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
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    showToast('配置文件已导出')
  }

  const importConfig = (jsonStr: string): boolean => {
    try {
      const parsed = JSON.parse(jsonStr) as Partial<AppSettings>
      if (!parsed || typeof parsed !== 'object') return false
      Object.assign(config.value, parsed)
      showToast('配置导入成功')
      return true
    } catch {
      showToast('配置文件格式错误')
      return false
    }
  }

  const clearAllData = () => {
    const defaultSettings = {
      theme: 'system' as const,
      language: 'zh-CN' as const,
      notificationsEnabled: true,
      autoConnect: false,
      privacyAnalytics: false,
      serialDefaults: {
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none' as const,
      },
      lastUsedPort: undefined,
      uiSettings: { ...DEFAULT_UI_SETTINGS },
    }
    
    config.value.theme = defaultSettings.theme
    config.value.language = defaultSettings.language
    config.value.notificationsEnabled = defaultSettings.notificationsEnabled
    config.value.autoConnect = defaultSettings.autoConnect
    config.value.privacyAnalytics = defaultSettings.privacyAnalytics
    config.value.lastUsedPort = defaultSettings.lastUsedPort
    
    config.value.serialDefaults = {
      baudRate: defaultSettings.serialDefaults.baudRate,
      dataBits: defaultSettings.serialDefaults.dataBits as 8 | 7,
      stopBits: defaultSettings.serialDefaults.stopBits as 1 | 2,
      parity: defaultSettings.serialDefaults.parity
    }
    
    config.value.uiSettings = { ...DEFAULT_UI_SETTINGS }
    
    setTimeout(() => {
      localStorage.setItem('qxc-serial-settings', JSON.stringify(defaultSettings))
    }, 10)
    
    showToast('本地数据已清除')
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
  }
})
