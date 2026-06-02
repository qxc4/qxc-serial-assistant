import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RttLogFilterPanel from '../RttLogFilterPanel.vue'

describe('RttLogFilterPanel', () => {
  it('emits search, level and channel updates', async () => {
    const wrapper = mount(RttLogFilterPanel, {
      props: {
        searchText: '',
        selectedLevels: ['debug', 'info'],
        selectedChannels: [0],
        channels: [{ number: 0, name: 'Terminal', size: 1024, mode: 'text' }],
        levelOptions: [
          { value: 'debug', label: 'Debug', color: 'text-slate-500' },
          { value: 'error', label: 'Error', color: 'text-red-500' },
        ],
        levelBgMap: {
          debug: 'bg-slate-50',
          info: 'bg-blue-50',
          warn: 'bg-yellow-50',
          error: 'bg-red-50',
          trace: 'bg-purple-50',
        },
        t: (key: string) => key,
      },
    })

    await wrapper.get('[data-testid="rtt-filter-search"]').setValue('boot')
    await wrapper.get('[data-testid="rtt-level-error"]').trigger('click')
    await wrapper.get('[data-testid="rtt-channel-0"]').trigger('click')

    expect(wrapper.emitted('update:searchText')?.[0]).toEqual(['boot'])
    expect(wrapper.emitted('toggleLevel')?.[0]).toEqual(['error'])
    expect(wrapper.emitted('toggleChannel')?.[0]).toEqual([0])
  })

  it('shows no channel state', () => {
    const wrapper = mount(RttLogFilterPanel, {
      props: {
        searchText: '',
        selectedLevels: [],
        selectedChannels: [],
        channels: [],
        levelOptions: [],
        levelBgMap: {},
        t: (key: string) => key,
      },
    })

    expect(wrapper.text()).toContain('rtt.noChannels')
  })
})
