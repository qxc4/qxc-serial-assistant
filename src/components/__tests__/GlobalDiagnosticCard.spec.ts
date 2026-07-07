import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import GlobalDiagnosticCard from '../GlobalDiagnosticCard.vue'
import type { DiagnosticSnapshot } from '../../features/diagnostics/globalDiagnostics'

const moduleLabels = {
  platform: 'Platform',
  serial: 'Serial',
  modbus: 'Modbus',
  rtt: 'RTT',
  shell: 'Shell',
  chart: 'Chart',
}

const t = (key: string, params?: Record<string, unknown>) => {
  if (!params) return key
  return `${key}:${JSON.stringify(params)}`
}

function snapshot(overrides: Partial<DiagnosticSnapshot> = {}): DiagnosticSnapshot {
  return {
    generatedAt: 1000,
    highestTone: 'error',
    items: [
      {
        id: 'serial-last-error',
        module: 'serial',
        tone: 'error',
        title: '连接失败',
        detail: 'Permission denied',
        actionLabel: '打开串口',
        route: '/',
        priority: 100,
      },
      {
        id: 'modbus-parse-failed',
        module: 'modbus',
        tone: 'warn',
        title: '解析失败',
        detail: 'CRC mismatch',
        actionLabel: '打开 Modbus',
        route: '/modbus',
        priority: 80,
      },
      {
        id: 'chart-ready',
        module: 'chart',
        tone: 'ok',
        title: '图表正常',
        detail: '正在采集',
        priority: 10,
      },
    ],
    ...overrides,
  }
}

describe('GlobalDiagnosticCard', () => {
  it('shows issue count and groups diagnostics by module', async () => {
    const wrapper = mount(GlobalDiagnosticCard, {
      props: {
        modelValue: false,
        snapshot: snapshot(),
        moduleLabels,
        t,
      },
    })

    expect(wrapper.get('[data-testid="global-diagnostics-button"]').text()).toContain('2')

    await wrapper.get('[data-testid="global-diagnostics-button"]').trigger('click')

    expect(wrapper.text()).toContain('Serial')
    expect(wrapper.text()).toContain('Modbus')
    expect(wrapper.text()).toContain('连接失败')
    expect(wrapper.text()).toContain('解析失败')
  })

  it('emits route navigation from item actions', async () => {
    const wrapper = mount(GlobalDiagnosticCard, {
      props: {
        modelValue: true,
        snapshot: snapshot(),
        moduleLabels,
        t,
      },
    })

    await wrapper.get('[data-testid="diagnostics-action-serial-last-error"]').trigger('click')

    expect(wrapper.emitted('navigate')?.[0]).toEqual(['/'])
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
  })
})
