import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { VariableImageSummary, VariableSpec, VariableValue } from '../../../debug-core'
import RttVariablePanel from '../RttVariablePanel.vue'

const variableSpecs: VariableSpec[] = [
  { name: 'counter', address: 0x20000000, type: 'u32', displayKind: 'primitive' },
  { name: 'state', address: 0x20000004, type: 'u8', displayKind: 'primitive' },
]

const variableValues: VariableValue[] = [
  { name: 'counter', address: 0x20000000, type: 'u32', value: 42, displayKind: 'primitive' },
  { name: 'state', address: 0x20000004, type: 'u8', value: 1, displayKind: 'primitive' },
]

const imageSummary: VariableImageSummary = {
  totalSymbols: 8,
  objectSymbols: 2,
  functionSymbols: 3,
  readableVariables: 2,
  bestEffortVariables: 0,
  currentFunction: {
    name: 'main',
    address: 0x08000100,
    size: 48,
    type: 'func',
  },
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(RttVariablePanel, {
    props: {
      isConnected: true,
      variableElfName: 'firmware.elf',
      variableSpecs,
      filteredVariableValues: variableValues,
      variableImageSummary: imageSummary,
      variableError: '',
      variableLoading: false,
      variableFilterText: '',
      variableAutoRefresh: false,
      variableRefreshMs: 500,
      formatVariableAddress: (address: number) => `0x${address.toString(16).toUpperCase().padStart(8, '0')}`,
      formatVariableValue: (item: VariableValue) => String(item.value ?? '-'),
      ...overrides,
    },
  })
}

describe('RttVariablePanel', () => {
  it('shows ELF summary and variable values', () => {
    const wrapper = mountPanel()

    expect(wrapper.text()).toContain('firmware.elf')
    expect(wrapper.text()).toContain('2 个变量 / 2 条显示')
    expect(wrapper.text()).toContain('PC 函数： main')
    expect(wrapper.text()).toContain('counter(u32)')
    expect(wrapper.text()).toContain('0x20000000')
    expect(wrapper.text()).toContain('42')
  })

  it('emits import refresh and model updates', async () => {
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="rtt-variable-import"]').trigger('click')
    await wrapper.get('[data-testid="rtt-variable-refresh"]').trigger('click')
    await wrapper.get('[data-testid="rtt-variable-filter"]').setValue('count')
    await wrapper.get('[data-testid="rtt-variable-auto"]').setValue(true)
    await wrapper.setProps({ variableAutoRefresh: true })
    await wrapper.get('[data-testid="rtt-variable-refresh-ms"]').setValue('1000')

    expect(wrapper.emitted('importElf')).toHaveLength(1)
    expect(wrapper.emitted('refreshVariables')).toHaveLength(1)
    expect(wrapper.emitted('update:variableFilterText')?.[0]).toEqual(['count'])
    expect(wrapper.emitted('update:variableAutoRefresh')?.[0]).toEqual([true])
    expect(wrapper.emitted('update:variableRefreshMs')?.[0]).toEqual([1000])
  })

  it('disables refresh when disconnected or no variables are loaded', () => {
    const wrapper = mountPanel({
      isConnected: false,
      variableSpecs: [],
    })

    expect(wrapper.get('[data-testid="rtt-variable-refresh"]').attributes('disabled')).toBeDefined()
  })
})
