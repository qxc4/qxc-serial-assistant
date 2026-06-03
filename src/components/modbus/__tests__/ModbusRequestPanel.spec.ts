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
      pollingTaskImportMode: 'replace',
      pollingResultFilter: {
        status: 'all',
        taskName: '',
        query: '',
      },
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

  it('emits import polling tasks from the task toolbar', async () => {
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="modbus-import-polling-tasks"]').trigger('click')

    expect(wrapper.emitted('importPollingTasks')).toHaveLength(1)
  })

  it('emits import mode updates', async () => {
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="modbus-import-mode"]').setValue('append')

    expect(wrapper.emitted('update:pollingTaskImportMode')?.[0]).toEqual(['append'])
  })

  it('emits task duplicate and clear stats actions', async () => {
    const wrapper = mount(ModbusRequestPanel, {
      props: {
        ...mountPanel().props(),
        pollingTasks: [{
          id: 'task-1',
          name: '温度读取',
          enabled: true,
          address: 1,
          functionCode: 3,
          startAddress: 0,
          quantity: 2,
          writeValue: '',
          intervalMs: 1000,
          timeoutMs: 1000,
          retries: 1,
          failurePolicy: 'continue',
          sent: 2,
          success: 1,
          failed: 1,
          status: 'timeout',
          lastError: '响应超时',
          lastRunAt: 1000,
        }],
      },
    })

    await wrapper.get('[data-testid="modbus-duplicate-task-task-1"]').trigger('click')
    await wrapper.get('[data-testid="modbus-clear-task-stats-task-1"]').trigger('click')

    expect(wrapper.emitted('duplicatePollingTask')?.[0]).toEqual(['task-1'])
    expect(wrapper.emitted('clearPollingTaskStats')?.[0]).toEqual(['task-1'])
  })

  it('emits polling result filter updates', async () => {
    const wrapper = mount(ModbusRequestPanel, {
      props: {
        ...mountPanel().props(),
        pollingResults: [{
          id: 'result-1',
          taskId: 'task-1',
          taskName: '温度读取',
          timestamp: 1000,
          attempt: 1,
          status: 'timeout',
          durationMs: 1000,
          requestHex: '01 03',
          responseHex: '',
          error: '响应超时',
        }],
      },
    })

    await wrapper.get('[data-testid="modbus-result-filter-query"]').setValue('timeout')
    await wrapper.get('[data-testid="modbus-result-filter-status"]').setValue('timeout')
    await wrapper.get('[data-testid="modbus-result-filter-task"]').setValue('温度')

    expect(wrapper.emitted('update:pollingResultFilter')?.[0]).toEqual([{
      status: 'all',
      taskName: '',
      query: 'timeout',
    }])
    expect(wrapper.emitted('update:pollingResultFilter')?.[1]).toEqual([{
      status: 'timeout',
      taskName: '',
      query: 'timeout',
    }])
    expect(wrapper.emitted('update:pollingResultFilter')?.[2]).toEqual([{
      status: 'timeout',
      taskName: '温度',
      query: 'timeout',
    }])
  })
})
