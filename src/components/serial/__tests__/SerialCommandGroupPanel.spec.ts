import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ref, shallowRef } from 'vue'
import SerialCommandGroupPanel from '../SerialCommandGroupPanel.vue'

function createCommandGroupHarness() {
  const cg = {
    activeGroup: ref({
      id: 'group-1',
      name: '测试指令组',
      description: '',
      commands: [],
      onFailure: 'skip-continue',
      globalTimeout: 5000,
    }),
    progressPercent: ref(0),
    executionState: ref('idle'),
    stats: ref({ success: 0, failed: 0, timeout: 0, skipped: 0, total: 0 }),
    currentExecutingIndex: ref(-1),
    savedGroups: ref([]),
    executionLogs: shallowRef([]),
    addCommand: vi.fn(),
    clearCommands: vi.fn(),
    removeCommand: vi.fn(),
    pauseExecution: vi.fn(),
    stopExecution: vi.fn(),
    deleteSavedGroup: vi.fn(),
    clearLogs: vi.fn(),
  }

  return {
    cg,
    wrapper: mount(SerialCommandGroupPanel, {
      props: {
        cg,
        isConnected: true,
        showGroupLoader: false,
        showExecLog: false,
        recentExecutionLogs: [],
        executionLogPreviewLimit: 50,
        t: (key: string) => key,
        getCmdStatusInfo: () => null,
      },
    }),
  }
}

describe('SerialCommandGroupPanel', () => {
  it('renders the active group name and empty command state', () => {
    const { wrapper } = createCommandGroupHarness()

    expect(wrapper.text()).toContain('serial.noCommandsHint')
  })

  it('emits execute command group from the run button', async () => {
    const { wrapper } = createCommandGroupHarness()

    await wrapper.get('[data-testid="command-group-run"]').trigger('click')

    expect(wrapper.emitted('executeCommandGroup')).toHaveLength(1)
  })
})
