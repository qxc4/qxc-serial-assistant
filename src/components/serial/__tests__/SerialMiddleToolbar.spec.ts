import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SerialMiddleToolbar from '../SerialMiddleToolbar.vue'

function mountToolbar(dataCount = 3) {
  return mount(SerialMiddleToolbar, {
    props: {
      displayMode: 'mixed',
      receiveEncoding: 'utf8',
      sendEncoding: 'utf8',
      showTimestamp: false,
      autoScroll: true,
      dataCount,
      toolbarExpanded: {
        display: true,
        encoding: true,
        options: true,
      },
      t: (key: string) => key,
    },
  })
}

describe('SerialMiddleToolbar', () => {
  it('emits copyData when the copy log button is clicked', async () => {
    const wrapper = mountToolbar()

    await wrapper.get('[data-testid="serial-copy-log"]').trigger('click')

    expect(wrapper.emitted('copyData')).toHaveLength(1)
  })

  it('disables the copy log button when there are no log entries', () => {
    const wrapper = mountToolbar(0)

    expect(wrapper.get('[data-testid="serial-copy-log"]').attributes('disabled')).toBeDefined()
  })
})
