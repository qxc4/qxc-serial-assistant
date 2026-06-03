import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SerialConnectionDrawer from '../SerialConnectionDrawer.vue'
import type { CustomProtocolConfig, ParseMode } from '../../../stores/settings'

function createCustomProtocolConfig(): CustomProtocolConfig {
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

function mountDrawer(overrides: Record<string, unknown> = {}) {
  return mount(SerialConnectionDrawer, {
    props: {
      visible: true,
      activeTab: 'serial',
      isSupported: false,
      isConnected: false,
      canReconnect: false,
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      baudRatePresets: [9600, 115200],
      isCustomBaudRate: false,
      customBaudRateInput: '',
      parseEnabled: true,
      parseMode: 'none' as ParseMode,
      customProtocolConfig: createCustomProtocolConfig(),
      lengthFieldEnabled: true,
      parseResultCount: 0,
      showParsePanel: false,
      t: (key: string) => key,
      ...overrides,
    },
  })
}

describe('SerialConnectionDrawer', () => {
  it('shows unsupported browser guidance', () => {
    const wrapper = mountDrawer()

    expect(wrapper.text()).toContain('serial.notSupported')
  })

  it('emits close when the close button is clicked', async () => {
    const wrapper = mountDrawer()

    await wrapper.get('[data-testid="serial-drawer-close"]').trigger('click')

    expect(wrapper.emitted('update:visible')?.[0]).toEqual([false])
  })

  it('routes bluetooth tab clicks to the caller', async () => {
    const onBluetoothComingSoon = vi.fn()
    const wrapper = mountDrawer({ onBluetoothComingSoon })

    await wrapper.get('[data-testid="serial-drawer-bluetooth"]').trigger('click')

    expect(onBluetoothComingSoon).toHaveBeenCalledTimes(1)
  })

  it('shows the active serial session controlled by the drawer', () => {
    const wrapper = mountDrawer({
      activeSessionName: '串口 2',
      isDefaultSession: false,
    })

    expect(wrapper.text()).toContain('当前会话：串口 2')
    expect(wrapper.text()).toContain('独立多端口连接')
  })
})
