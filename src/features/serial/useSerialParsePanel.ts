import { computed, ref, watch, type Ref } from 'vue'
import type { CustomProtocolConfig, ParseMode, ParseSettings } from '../../stores/settings'

export type SerialParseDownload = (content: string, filename: string, type: string) => void

export interface SerialParseSettingsStore {
  config: {
    parseSettings: ParseSettings
  }
  showToast: (message: string) => void
}

export interface SerialParseDataService {
  setParseMode: (mode: ParseMode, baudRate?: number) => void
  setCustomProtocolConfig: (config: CustomProtocolConfig) => void
  clearResults: () => void
  exportResults: (format: 'txt') => string
}

export interface UseSerialParsePanelOptions {
  settings: SerialParseSettingsStore
  dataParse: SerialParseDataService
  baudRate: Ref<number>
  t: (key: string) => string
  downloadTextFile?: SerialParseDownload
}

function createDefaultCustomProtocol(): CustomProtocolConfig {
  return {
    frameHeader: 'AA 55',
    frameTail: '',
    lengthField: {
      enabled: true,
      offset: 2,
      size: 1,
      includesHeader: false,
    },
    checksum: {
      type: 'sum',
      offset: 0,
    },
    dataOffset: 3,
  }
}

function cloneCustomProtocol(config: CustomProtocolConfig): CustomProtocolConfig {
  return {
    ...config,
    lengthField: { ...config.lengthField },
    checksum: { ...config.checksum },
  }
}

function downloadTextFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function useSerialParsePanel(options: UseSerialParsePanelOptions) {
  const parseMode = computed({
    get: () => options.settings.config.parseSettings.mode,
    set: (val: ParseMode) => {
      options.settings.config.parseSettings.mode = val
      options.dataParse.setParseMode(val, options.baudRate.value)
    },
  })
  const parseEnabled = computed({
    get: () => options.settings.config.parseSettings.enabled,
    set: (val: boolean) => { options.settings.config.parseSettings.enabled = val },
  })
  const showParsePanel = ref(false)
  const customProtocolConfig = ref<CustomProtocolConfig>(cloneCustomProtocol(createDefaultCustomProtocol()))
  const parseResultExpanded = ref<Record<string, boolean>>({})
  const download = options.downloadTextFile ?? downloadTextFile

  const lengthFieldEnabled = computed({
    get: () => customProtocolConfig.value.lengthField.enabled,
    set: (val: boolean) => {
      customProtocolConfig.value = {
        ...customProtocolConfig.value,
        lengthField: {
          ...customProtocolConfig.value.lengthField,
          enabled: val,
        },
      }
    },
  })

  function initCustomProtocolConfig() {
    const stored = options.settings.config.parseSettings.customProtocol
    if (stored) {
      customProtocolConfig.value = cloneCustomProtocol(stored)
    }
  }

  function saveCustomProtocolConfig() {
    options.settings.config.parseSettings.customProtocol = cloneCustomProtocol(customProtocolConfig.value)
    options.dataParse.setCustomProtocolConfig(customProtocolConfig.value)
  }

  function toggleParseResultExpand(id: string) {
    parseResultExpanded.value[id] = !parseResultExpanded.value[id]
  }

  function handleClearParseResults() {
    options.dataParse.clearResults()
  }

  function handleExportParseResults() {
    const content = options.dataParse.exportResults('txt')
    download(content, `parse_results_${new Date().getTime()}.txt`, 'text/plain;charset=utf-8')
    options.settings.showToast(options.t('serial.exportSuccess'))
  }

  function formatBytes(bytes: number[]): string {
    return bytes.map(byte => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ')
  }

  watch(customProtocolConfig, () => {
    saveCustomProtocolConfig()
  }, { deep: true })

  watch(parseMode, newMode => {
    options.dataParse.setParseMode(newMode, options.baudRate.value)
  }, { immediate: true })

  return {
    parseMode,
    parseEnabled,
    showParsePanel,
    customProtocolConfig,
    lengthFieldEnabled,
    parseResultExpanded,
    initCustomProtocolConfig,
    saveCustomProtocolConfig,
    toggleParseResultExpand,
    handleClearParseResults,
    handleExportParseResults,
    formatBytes,
  }
}
