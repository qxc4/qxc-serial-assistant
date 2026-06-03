import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { SerialSessionDescriptor } from '../../../features/serial'
import SerialSessionStrip from '../SerialSessionStrip.vue'

const sessions: SerialSessionDescriptor[] = [
  {
    id: 'default',
    name: '串口 1',
    createdAt: '2026-06-03T00:00:00.000Z',
    updatedAt: '2026-06-03T00:00:00.000Z',
    isDefault: true,
    connectionLabel: '当前 Web Serial 连接已连接',
    stats: { txBytes: 12, rxBytes: 34, events: 3 },
  },
  {
    id: 'session-2',
    name: '串口 2',
    createdAt: '2026-06-03T00:00:00.000Z',
    updatedAt: '2026-06-03T00:00:00.000Z',
    isDefault: false,
    connectionLabel: 'USB Serial 已连接',
    stats: { txBytes: 56, rxBytes: 78, events: 9 },
  },
]

describe('SerialSessionStrip', () => {
  it('shows connection state and per-session traffic density', () => {
    const wrapper = mount(SerialSessionStrip, {
      props: {
        sessions,
        activeSessionId: 'session-2',
        maxSessions: 4,
        isConnected: true,
      },
    })

    expect(wrapper.text()).toContain('串口 2')
    expect(wrapper.text()).toContain('已连接')
    expect(wrapper.text()).toContain('TX 56')
    expect(wrapper.text()).toContain('RX 78')
    expect(wrapper.text()).toContain('日志 9')
  })

  it('emits add remove and activation actions', async () => {
    const wrapper = mount(SerialSessionStrip, {
      props: {
        sessions,
        activeSessionId: 'default',
        maxSessions: 4,
        isConnected: true,
      },
    })

    await wrapper.get('[data-testid="serial-session-session-2"]').trigger('click')
    await wrapper.get('[data-testid="serial-session-remove-session-2"]').trigger('click')
    await wrapper.get('[data-testid="serial-session-add"]').trigger('click')

    expect(wrapper.emitted('setActiveSession')?.[0]).toEqual(['session-2'])
    expect(wrapper.emitted('removeSession')?.[0]).toEqual(['session-2'])
    expect(wrapper.emitted('addSession')).toHaveLength(1)
  })
})
