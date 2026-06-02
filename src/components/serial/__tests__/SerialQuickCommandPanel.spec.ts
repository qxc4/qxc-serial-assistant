import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SerialQuickCommandPanel from '../SerialQuickCommandPanel.vue'
import type {
  ProtocolTemplate,
  QuickCommand,
  SerialReplayEvent,
  SerialReplayMode,
  SerialSessionRecording,
} from '../../../features/serial'

function createCommand(): QuickCommand {
  return {
    id: 1,
    enabled: true,
    content: 'AT',
    description: 'handshake',
    isHex: false,
    delay: 100,
  }
}

function createTemplate(): ProtocolTemplate {
  return {
    id: 'at',
    name: 'AT',
    category: 'at',
    description: 'AT template',
    parseHint: 'hint',
    quickCommands: [],
  }
}

function mountPanel() {
  return mount(SerialQuickCommandPanel, {
    props: {
      quickCommands: [createCommand()],
      enabledQuickCommands: [createCommand()],
      protocolTemplates: [createTemplate()],
      selectedProtocolTemplateId: 'at',
      selectedProtocolTemplate: createTemplate(),
      protocolTemplateHint: 'hint',
      isConnected: true,
      hasRunnableQuickCommands: true,
      isSendingQuickCommands: false,
      isLooping: false,
      loopInterval: 1000,
      replayMode: 'tx-only' as SerialReplayMode,
      replaySpeed: 1,
      isRecordingSession: false,
      recordedReplayEvents: [] as SerialReplayEvent[],
      loadedSessionRecording: null as SerialSessionRecording | null,
      isReplayingSession: false,
      replayCursor: 0,
      replayEventsForMode: [] as SerialReplayEvent[],
      simulatedReplayEvents: [] as SerialReplayEvent[],
      canStartSessionReplay: false,
      t: (key: string) => key,
    },
  })
}

describe('SerialQuickCommandPanel', () => {
  it('shows runnable command counts and template hint', () => {
    const wrapper = mountPanel()

    expect(wrapper.text()).toContain('1 / 1')
    expect(wrapper.text()).toContain('hint')
  })

  it('emits add command from toolbar', async () => {
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="quick-add-command"]').trigger('click')

    expect(wrapper.emitted('addCommand')).toHaveLength(1)
  })
})
