import { describe, expect, test } from 'vitest'
import { RTT_SIDE_PANEL_TABS } from '../rttSidePanelTabs'

describe('RTT side panel tabs', () => {
  test('keeps the right panel grouped by diagnostics variables flash and resources', () => {
    expect(RTT_SIDE_PANEL_TABS).toEqual([
      { key: 'diagnostics', label: '诊断' },
      { key: 'variables', label: '变量' },
      { key: 'flash', label: '烧录' },
      { key: 'resources', label: '资源' },
    ])
  })
})
