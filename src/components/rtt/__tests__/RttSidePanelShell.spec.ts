import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RttSidePanelShell from '../RttSidePanelShell.vue'

describe('RttSidePanelShell', () => {
  it('renders tabs and emits active tab updates', async () => {
    const wrapper = mount(RttSidePanelShell, {
      props: {
        activeTab: 'diagnostics',
        tabs: [
          { key: 'diagnostics', label: '诊断' },
          { key: 'variables', label: '变量' },
        ],
      },
      slots: {
        default: '<div data-testid="side-content">content</div>',
      },
    })

    expect(wrapper.text()).toContain('诊断')
    expect(wrapper.text()).toContain('变量')
    expect(wrapper.get('[data-testid="side-content"]').text()).toBe('content')

    await wrapper.get('[data-testid="rtt-side-tab-variables"]').trigger('click')

    expect(wrapper.emitted('update:activeTab')?.[0]).toEqual(['variables'])
  })

  it('does not render when hidden', () => {
    const wrapper = mount(RttSidePanelShell, {
      props: {
        activeTab: 'diagnostics',
        tabs: [{ key: 'diagnostics', label: '诊断' }],
        visible: false,
      },
    })

    expect(wrapper.find('aside').exists()).toBe(false)
  })
})
