import { computed, ref, type ComputedRef, type Ref } from 'vue'
import {
  createDefaultQuickCommands,
  type QuickCommand,
} from './serialOptions'
import {
  applyProtocolTemplate,
  getProtocolTemplate,
  PROTOCOL_TEMPLATES,
  type ProtocolTemplate,
} from './protocolTemplates'

export type QuickCommandSend = (data: string, isHex?: boolean) => Promise<void>
export type QuickCommandMeasure = <T>(name: string, fn: () => T) => T

export interface UseQuickCommandsOptions {
  send: QuickCommandSend
  isConnected: Ref<boolean>
  showToast: (message: string) => void
  measureSync?: QuickCommandMeasure
}

export interface UseQuickCommandsReturn {
  protocolTemplates: ProtocolTemplate[]
  quickCommands: Ref<QuickCommand[]>
  selectedProtocolTemplateId: Ref<string>
  protocolTemplateHint: Ref<string>
  loopInterval: Ref<number>
  isLooping: Ref<boolean>
  isSendingQuickCommands: Ref<boolean>
  enabledQuickCommands: ComputedRef<QuickCommand[]>
  hasRunnableQuickCommands: ComputedRef<boolean>
  selectedProtocolTemplate: ComputedRef<ProtocolTemplate | null>
  addCommand: () => void
  deleteCommand: (id: number) => void
  sendCommand: (cmd: QuickCommand) => Promise<void>
  sendSelected: () => Promise<void>
  applySelectedProtocolTemplate: () => void
  toggleLoopSend: () => void
  cleanupQuickCommands: () => void
}

function waitForQuickCommandDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve()

  return new Promise(resolve => {
    const timeoutId = window.setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timeoutId)
      resolve()
    }, { once: true })
  })
}

export function useQuickCommands(options: UseQuickCommandsOptions): UseQuickCommandsReturn {
  const measure = options.measureSync ?? ((_name, fn) => fn())
  const quickCommands = ref<QuickCommand[]>(createDefaultQuickCommands())
  const selectedProtocolTemplateId = ref(PROTOCOL_TEMPLATES[0]?.id ?? '')
  const protocolTemplateHint = ref('')
  const loopInterval = ref(5000)
  const isLooping = ref(false)
  const isSendingQuickCommands = ref(false)
  let loopTimer: number | null = null
  let sendSelectedAbortController: AbortController | null = null

  const enabledQuickCommands = computed(() =>
    quickCommands.value.filter(cmd => cmd.enabled && cmd.content.trim().length > 0),
  )
  const hasRunnableQuickCommands = computed(() => enabledQuickCommands.value.length > 0)
  const selectedProtocolTemplate = computed(() => getProtocolTemplate(selectedProtocolTemplateId.value))

  function addCommand() {
    measure('addCommand', () => {
      quickCommands.value.push({
        id: Date.now(),
        enabled: true,
        content: '',
        description: '',
        isHex: false,
        delay: 1000,
      })
    })
  }

  function deleteCommand(id: number) {
    measure('deleteCommand', () => {
      const index = quickCommands.value.findIndex(cmd => cmd.id === id)
      if (index > -1) {
        quickCommands.value.splice(index, 1)
      }
    })
  }

  async function sendCommand(cmd: QuickCommand) {
    if (!options.isConnected.value || !cmd.content) return

    try {
      await options.send(cmd.content, cmd.isHex)
    } catch (error) {
      console.error('[Serial] Send command error:', error)
    }
  }

  async function sendSelected() {
    if (!options.isConnected.value || !hasRunnableQuickCommands.value) return

    sendSelectedAbortController?.abort()
    sendSelectedAbortController = new AbortController()
    const { signal } = sendSelectedAbortController
    isSendingQuickCommands.value = true

    try {
      for (const cmd of enabledQuickCommands.value) {
        if (signal.aborted) break

        await options.send(cmd.content, cmd.isHex)
        await waitForQuickCommandDelay(cmd.delay, signal)
      }
    } finally {
      isSendingQuickCommands.value = false
      sendSelectedAbortController = null
    }
  }

  function applySelectedProtocolTemplate() {
    const template = selectedProtocolTemplate.value
    if (!template) return
    let nextId = Date.now()
    const result = applyProtocolTemplate(template, () => nextId++)
    quickCommands.value.push(...result.addedCommands)
    protocolTemplateHint.value = result.parseHint
    options.showToast(`已应用模板：${template.name}`)
  }

  async function runLoop() {
    if (!isLooping.value) return

    try {
      await sendSelected()

      if (isLooping.value) {
        loopTimer = window.setTimeout(runLoop, loopInterval.value)
      }
    } catch (error) {
      console.error('[Serial] Loop send error:', error)
      isLooping.value = false
      if (loopTimer) {
        clearTimeout(loopTimer)
        loopTimer = null
      }
    }
  }

  function toggleLoopSend() {
    measure('toggleLoopSend', () => {
      if (isLooping.value) {
        cleanupQuickCommands()
      } else {
        if (!options.isConnected.value) return
        isLooping.value = true
        void runLoop()
      }
    })
  }

  function cleanupQuickCommands() {
    isLooping.value = false
    if (loopTimer) {
      clearTimeout(loopTimer)
      loopTimer = null
    }
    if (sendSelectedAbortController) {
      sendSelectedAbortController.abort()
      sendSelectedAbortController = null
    }
    isSendingQuickCommands.value = false
  }

  return {
    protocolTemplates: PROTOCOL_TEMPLATES,
    quickCommands,
    selectedProtocolTemplateId,
    protocolTemplateHint,
    loopInterval,
    isLooping,
    isSendingQuickCommands,
    enabledQuickCommands,
    hasRunnableQuickCommands,
    selectedProtocolTemplate,
    addCommand,
    deleteCommand,
    sendCommand,
    sendSelected,
    applySelectedProtocolTemplate,
    toggleLoopSend,
    cleanupQuickCommands,
  }
}
