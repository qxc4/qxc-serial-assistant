import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RttWorkbenchHeader from '../RttWorkbenchHeader.vue'

function mountHeader() {
  return mount(RttWorkbenchHeader, {
    props: {
      backend: 'webusb',
      showTopConfigDetails: false,
      webUsbProtocol: 'swd',
      webUsbFrequency: 4000000,
      rttScanStartInput: '0x20000000',
      rttScanEndInput: '0x20010000',
      rttScanStepInput: 4,
      autoScroll: true,
      showHelpPanel: false,
      showRightPanel: true,
      connectionState: 'disconnected',
      stateIndicator: 'bg-slate-300',
      isConnected: false,
      isPaused: false,
      connectBtnText: '连接',
      isWebUsbMode: true,
      rttBackendOptions: [{ value: 'webusb', label: 'WebUSB' }],
      rttFrequencyOptions: [{ value: 4000000, label: '4MHz' }],
      channelsLength: 0,
      workbenchStatusChips: [{ key: 'connection', label: '连接', value: 'disconnected', tone: 'idle' }],
      logStats: { total: 0, errors: 0, warnings: 0 },
      webUsbProbeName: '未选择设备',
      hasWebUsbProbe: false,
      webUsbSupported: true,
      webUsbScanRangeError: '',
      errorMessage: '',
      t: (key: string) => key,
    },
  })
}

describe('RttWorkbenchHeader', () => {
  it('emits connectToggle from the connect button', async () => {
    const wrapper = mountHeader()

    await wrapper.findAll('button')[1]!.trigger('click')

    expect(wrapper.emitted('connectToggle')).toHaveLength(1)
  })

  it('updates showTopConfigDetails when expanding config', async () => {
    const wrapper = mountHeader()

    await wrapper.findAll('button')[0]!.trigger('click')

    expect(wrapper.emitted('update:showTopConfigDetails')?.[0]).toEqual([true])
  })
})
