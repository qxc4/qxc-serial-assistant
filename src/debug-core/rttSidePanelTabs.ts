export type RttSidePanelTabKey = 'diagnostics' | 'variables' | 'flash' | 'resources'

export interface RttSidePanelTab {
  key: RttSidePanelTabKey
  label: string
}

export const RTT_SIDE_PANEL_TABS: RttSidePanelTab[] = [
  { key: 'diagnostics', label: '诊断' },
  { key: 'variables', label: '变量' },
  { key: 'flash', label: '烧录' },
  { key: 'resources', label: '资源' },
]
