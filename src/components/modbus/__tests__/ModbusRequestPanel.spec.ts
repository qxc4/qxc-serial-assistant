import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ModbusRequestPanel from '../ModbusRequestPanel.vue'

function mountPanel() {
  return mount(ModbusRequestPanel, {
    props: {
      buildSettings: {
        address: 1,
        functionCode: 3,
        startAddress: 0,
        quantity: 1,
        writeValue: '',
      },
      pollingSettings: {
        intervalMs: 1000,
        maxCycles: 0,
      },
      dataTypeSettings: {
        type: 'uint16',
        byteOrder: 'ABCD',
      },
      functionCodeOptions: [{ value: 3, label: 'FC03' }],
      selectedFunctionCode: { needsValue: false },
      buildResult: '',
      isSerialConnected: false,
      isSendingModbusRequest: false,
      isPollingModbus: false,
      pollingProgressLabel: '0 / ∞',
      lastPollingSentAt: null,
      lastPollingError: '',
      pollingTasks: [],
      pollingResults: [],
      isTaskPolling: false,
      activePollingTaskId: '',
      pollingTaskCycle: 0,
      taskPollingSummary: { sent: 0, success: 0, failed: 0 },
      dataTypeOptions: [{ value: 'uint16', label: 'uint16', bytes: 2 }],
      byteOrderOptions: [{ value: 'ABCD', label: 'ABCD' }],
      t: (key: string) => key,
      formatTimestamp: (timestamp: number) => String(timestamp),
    },
  })
}

describe('ModbusRequestPanel', () => {
  it('emits build from the build frame button', async () => {
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="modbus-build-frame"]').trigger('click')

    expect(wrapper.emitted('build')).toHaveLength(1)
  })

  it('shows the empty polling task state', () => {
    const wrapper = mountPanel()

    expect(wrapper.text()).toContain('暂无任务')
  })
})
