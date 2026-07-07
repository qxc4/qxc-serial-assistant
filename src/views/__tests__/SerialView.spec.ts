import { shallowMount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import SerialView from '../SerialView.vue'

const serialMock = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  reconnect: vi.fn(),
  onDataReceive: vi.fn(),
  receivedData: null as unknown as ReturnType<typeof ref<Array<{
    id: number
    timestamp: number
    data: string
    direction: 'rx' | 'tx'
  }>>>,
  isConnected: null as unknown as ReturnType<typeof ref<boolean>>,
  canReconnect: null as unknown as ReturnType<typeof ref<boolean>>,
}))

vi.mock('../../composables/useSerial', () => {
  const receivedData = ref<Array<{
    id: number
    timestamp: number
    data: string
    direction: 'rx' | 'tx'
  }>>([])
  const txBytes = ref(0)
  const rxBytes = ref(0)
  const dataCount = ref(0)
  serialMock.isConnected = ref(false)
  serialMock.canReconnect = ref(false)
  serialMock.receivedData = receivedData
  serialMock.connect.mockImplementation(async () => {
    serialMock.isConnected.value = true
  })
  serialMock.disconnect.mockImplementation(async () => {
    serialMock.isConnected.value = false
    serialMock.canReconnect.value = true
  })
  serialMock.reconnect.mockImplementation(async () => {
    serialMock.isConnected.value = true
    serialMock.canReconnect.value = false
  })
  serialMock.onDataReceive.mockImplementation(() => () => undefined)

  return {
    useSerial: () => ({
      isSupported: ref(true),
      isConnected: serialMock.isConnected,
      baudRate: ref(9600),
      dataBits: ref(8),
      stopBits: ref(1),
      parity: ref('none'),
      receivedData,
      txBytes,
      rxBytes,
      showTimestamp: ref(false),
      receiveEncoding: ref('utf8'),
      sendEncoding: ref('utf8'),
      isReconnecting: ref(false),
      reconnectAttempts: ref(0),
      dataCount,
      canReconnect: serialMock.canReconnect,
      connect: serialMock.connect,
      disconnect: serialMock.disconnect,
      reconnect: serialMock.reconnect,
      send: vi.fn(async () => undefined),
      clearData: vi.fn(),
      exportData: vi.fn(),
      redecodeAllData: vi.fn(),
      onDataReceive: serialMock.onDataReceive,
      lastSerialError: ref(null),
      clearSerialError: vi.fn(),
    }),
  }
})

const SerialConnectionDrawerStub = {
  name: 'SerialConnectionDrawer',
  props: ['visible'],
  emits: ['connect', 'disconnect', 'reconnect', 'update:visible'],
  template: '<div data-testid="serial-connection-drawer"><button data-testid="connect" @click="$emit(\'connect\')">connect</button></div>',
}

const BasicStub = {
  inheritAttrs: false,
  template: '<div />',
}

const mountedWrappers: ReturnType<typeof shallowMount>[] = []

function installMatchMediaMock() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
}

function installClipboardMock() {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn(async () => undefined),
    },
  })
}

function mountSerialView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const settingsStore = useSettingsStore()
  settingsStore.config.uiSettings.showLeftPanel = true

  const wrapper = shallowMount(SerialView, {
    global: {
      plugins: [pinia],
      stubs: {
        SerialConnectionDrawer: SerialConnectionDrawerStub,
        SerialTopToolbar: BasicStub,
        SerialLogPanel: BasicStub,
        SerialParseResultsPanel: BasicStub,
        SerialMiddleToolbar: BasicStub,
        SerialSendPanel: BasicStub,
        SerialQuickCommandPanel: BasicStub,
        SerialCommandGroupPanel: BasicStub,
        Teleport: true,
      },
    },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

describe('SerialView connection drawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    serialMock.receivedData.value = []
    installMatchMediaMock()
    installClipboardMock()
  })

  afterEach(() => {
    mountedWrappers.splice(0).forEach(wrapper => wrapper.unmount())
  })

  it('collapses the connection drawer after a successful default serial connection', async () => {
    const wrapper = mountSerialView()

    expect(serialMock.isConnected.value).toBe(false)
    expect(wrapper.getComponent(SerialConnectionDrawerStub).props('visible')).toBe(true)

    await wrapper.get('[data-testid="connect"]').trigger('click')
    await flushPromises()

    expect(serialMock.connect).toHaveBeenCalledTimes(1)
    expect(serialMock.isConnected.value).toBe(true)
    expect(useSettingsStore().config.uiSettings.showLeftPanel).toBe(false)
    expect(wrapper.getComponent(SerialConnectionDrawerStub).props('visible')).toBe(false)
  })

  it('copies only complete serial logs when Alt+A is pressed', async () => {
    serialMock.receivedData.value = Array.from({ length: 80 }, (_, index) => ({
      id: index + 1,
      timestamp: 1_700_000_000_000 + index,
      data: `packet-${index + 1}`,
      direction: index % 2 === 0 ? 'rx' : 'tx',
    }))
    mountSerialView()

    const event = new KeyboardEvent('keydown', {
      key: 'a',
      altKey: true,
      bubbles: true,
      cancelable: true,
    })
    window.dispatchEvent(event)
    await flushPromises()

    const writeText = vi.mocked(navigator.clipboard.writeText)
    expect(event.defaultPrevented).toBe(true)
    expect(writeText).toHaveBeenCalledTimes(1)
    const copied = writeText.mock.calls[0]?.[0] ?? ''
    expect(copied).toContain('RX: packet-1')
    expect(copied).toContain('TX: packet-80')
    expect(copied).not.toContain('connect')
    expect(copied.split('\n')).toHaveLength(80)
  })
})
