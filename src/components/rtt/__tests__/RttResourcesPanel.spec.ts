import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { RttSourceFile } from '../../../debug-core/rttSourceDownloads'
import RttResourcesPanel from '../RttResourcesPanel.vue'

const files: RttSourceFile[] = [
  {
    id: 'segger-rtt-h',
    fileName: 'SEGGER_RTT.h',
    path: 'RTT/SEGGER_RTT.h',
    description: 'RTT header',
    url: 'https://example.com/SEGGER_RTT.h',
  },
]

describe('RttResourcesPanel', () => {
  it('emits source download and export actions', async () => {
    const wrapper = mount(RttResourcesPanel, {
      props: {
        files,
        repositoryUrl: 'https://example.com',
        downloadingId: '',
        downloadMessage: '',
        downloadError: '',
        t: (key: string) => key,
      },
    })

    await wrapper.get('[data-testid="rtt-source-segger-rtt-h"]').trigger('click')
    await wrapper.get('[data-testid="rtt-export-txt"]').trigger('click')
    await wrapper.get('[data-testid="rtt-export-session"]').trigger('click')

    expect(wrapper.emitted('downloadSource')?.[0]).toEqual([files[0]])
    expect(wrapper.emitted('exportTxt')).toHaveLength(1)
    expect(wrapper.emitted('exportSession')).toHaveLength(1)
  })

  it('shows download status messages', () => {
    const wrapper = mount(RttResourcesPanel, {
      props: {
        files,
        repositoryUrl: 'https://example.com',
        downloadingId: '',
        downloadMessage: '已下载 SEGGER_RTT.h',
        downloadError: 'network failed',
        t: (key: string) => key,
      },
    })

    expect(wrapper.text()).toContain('已下载 SEGGER_RTT.h')
    expect(wrapper.text()).toContain('network failed')
  })
})
