import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import type { CustomProtocolConfig, ParseMode } from '../../../stores/settings'
import { useSerialParsePanel } from '../useSerialParsePanel'

function createCustomProtocolConfig(): CustomProtocolConfig {
  return {
    frameHeader: 'AB CD',
    frameTail: 'EF',
    lengthField: {
      enabled: false,
      offset: 4,
      size: 2,
      includesHeader: true,
    },
    checksum: {
      type: 'xor',
      offset: 1,
    },
    dataOffset: 6,
  }
}

function createHarness() {
  const showToast = vi.fn()
  const setParseMode = vi.fn()
  const setCustomProtocolConfig = vi.fn()
  const clearResults = vi.fn()
  const exportResults = vi.fn(() => 'parse-results')
  const downloadTextFile = vi.fn()
  const baudRate = ref(115200)
  const settings = {
    config: {
      parseSettings: {
        enabled: true,
        mode: 'none' as ParseMode,
        showParseResult: true,
        autoParse: true,
        customProtocol: createCustomProtocolConfig(),
      },
    },
    showToast,
  }

  const panel = useSerialParsePanel({
    settings,
    dataParse: {
      setParseMode,
      setCustomProtocolConfig,
      clearResults,
      exportResults,
    },
    baudRate,
    t: key => key,
    downloadTextFile,
  })

  return {
    ...panel,
    settings,
    baudRate,
    setParseMode,
    setCustomProtocolConfig,
    clearResults,
    exportResults,
    downloadTextFile,
    showToast,
  }
}

describe('useSerialParsePanel', () => {
  it('initializes custom protocol config from settings', () => {
    const harness = createHarness()

    harness.initCustomProtocolConfig()

    expect(harness.customProtocolConfig.value.frameHeader).toBe('AB CD')
    expect(harness.customProtocolConfig.value.lengthField).toEqual({
      enabled: false,
      offset: 4,
      size: 2,
      includesHeader: true,
    })
  })

  it('updates nested length field enabled state immutably', async () => {
    const harness = createHarness()
    harness.initCustomProtocolConfig()

    harness.lengthFieldEnabled.value = true
    await nextTick()

    expect(harness.customProtocolConfig.value.lengthField.enabled).toBe(true)
    expect(harness.settings.config.parseSettings.customProtocol?.lengthField.enabled).toBe(true)
  })

  it('syncs parse mode changes to data parser with the current baud rate', async () => {
    const harness = createHarness()

    harness.parseMode.value = 'modbus-rtu'
    await nextTick()

    expect(harness.setParseMode).toHaveBeenCalledWith('modbus-rtu', 115200)
  })

  it('toggles expanded results and clears parser output', () => {
    const harness = createHarness()

    harness.toggleParseResultExpand('row-1')
    harness.handleClearParseResults()

    expect(harness.parseResultExpanded.value['row-1']).toBe(true)
    expect(harness.clearResults).toHaveBeenCalledTimes(1)
  })

  it('exports parse results through the injected downloader', () => {
    const harness = createHarness()

    harness.handleExportParseResults()

    expect(harness.exportResults).toHaveBeenCalledWith('txt')
    expect(harness.downloadTextFile.mock.calls[0]?.[0]).toBe('parse-results')
    expect(harness.downloadTextFile.mock.calls[0]?.[1]).toMatch(/^parse_results_\d+\.txt$/)
    expect(harness.showToast).toHaveBeenCalledWith('serial.exportSuccess')
  })
})
