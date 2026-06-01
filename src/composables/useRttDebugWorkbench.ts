import { computed, onMounted, ref, watch, type Ref } from 'vue'
import { CortexMDebugTarget } from '../debug-core'

export type DebugControlState = 'idle' | 'running' | 'halted' | 'reset' | 'error'
export type DebugAction = 'halt' | 'resume' | 'step' | 'reset'

export interface BreakpointSlotStatus {
  used: number
  total: number
  remaining: number
}

interface DebugMemoryApi {
  readMemory(address: number, bytes: number): Promise<Uint8Array>
  writeMemory(address: number, data: Uint8Array): Promise<void>
}

export interface RttDebugWorkbenchOptions {
  isConnected: Ref<boolean>
  memory: DebugMemoryApi
  parseHexAddress(value: string): number | null
  formatHexAddress(value: number): string
}

const BREAKPOINT_SESSION_KEY = 'qxc-serial-rtt-breakpoints'
const CORE_REGISTER_NAMES = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'SP', 'LR', 'PC', 'XPSR'] as const

export function useRttDebugWorkbench(options: RttDebugWorkbenchOptions) {
  const debugControlState = ref<DebugControlState>('idle')
  const debugControlError = ref('')
  const coreRegisters = ref<Uint32Array>(new Uint32Array(17))
  const breakpointInput = ref('0x08000000')
  const hardwareBreakpoints = ref<number[]>([])
  const breakpointRestoreStatus = ref('')
  const breakpointSlotStatus = ref<BreakpointSlotStatus | null>(null)
  const memoryViewAddressInput = ref('0x20000000')
  const memoryViewLengthInput = ref(128)
  const memoryViewHexLines = ref<string[]>([])
  const memoryViewError = ref('')
  const pcFocusRequestId = ref(0)
  const registerWriteName = ref('PC')
  const registerWriteValueInput = ref('0x00000000')
  let debugTargetInstance: CortexMDebugTarget | null = null

  const coreRegisterItems = computed(() => {
    return CORE_REGISTER_NAMES.map((name, index) => ({
      name,
      value: coreRegisters.value[index] ?? 0,
      isKey: name === 'SP' || name === 'LR' || name === 'PC',
    }))
  })

  const memoryViewByteLength = computed(() => {
    const value = memoryViewLengthInput.value
    if (!Number.isFinite(value)) return null
    return Math.max(16, Math.min(512, Math.floor(value)))
  })

  function createDebugTarget(): CortexMDebugTarget {
    if (debugTargetInstance) return debugTargetInstance
    debugTargetInstance = new CortexMDebugTarget({
      read8: (address, length) => options.memory.readMemory(address, length),
      write8: (address, data) => options.memory.writeMemory(address, data),
      read32: async (address, words) => {
        const bytes = await options.memory.readMemory(address, words * 4)
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        const result = new Uint32Array(words)
        for (let i = 0; i < words; i++) {
          result[i] = view.getUint32(i * 4, true)
        }
        return result
      },
      write32: async (address, words) => {
        const bytes = new Uint8Array(words.length * 4)
        const view = new DataView(bytes.buffer)
        for (let i = 0; i < words.length; i++) {
          view.setUint32(i * 4, words[i] ?? 0, true)
        }
        await options.memory.writeMemory(address, bytes)
      },
    })
    return debugTargetInstance
  }

  async function refreshCoreRegisters(): Promise<void> {
    if (!options.isConnected.value) {
      debugControlError.value = '请先连接调试探针'
      return
    }
    try {
      const target = createDebugTarget()
      coreRegisters.value = await target.readCoreRegisters()
      debugControlError.value = ''
    } catch (error) {
      debugControlError.value = error instanceof Error ? error.message : String(error)
    }
  }

  async function refreshBreakpointSlotStatus(): Promise<void> {
    if (!options.isConnected.value) {
      breakpointSlotStatus.value = null
      return
    }
    try {
      breakpointSlotStatus.value = await createDebugTarget().getHardwareBreakpointStatus()
    } catch {
      breakpointSlotStatus.value = null
    }
  }

  function persistHardwareBreakpoints(): void {
    sessionStorage.setItem(BREAKPOINT_SESSION_KEY, JSON.stringify(hardwareBreakpoints.value))
  }

  function restoreHardwareBreakpoints(): void {
    const raw = sessionStorage.getItem(BREAKPOINT_SESSION_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        hardwareBreakpoints.value = parsed
          .map(item => Number(item))
          .filter(item => Number.isInteger(item) && item >= 0)
          .sort((a, b) => a - b)
      }
    } catch {
      // Ignore malformed session cache.
    }
  }

  async function handleDebugAction(action: DebugAction): Promise<void> {
    if (!options.isConnected.value) {
      debugControlError.value = '请先连接调试探针'
      return
    }
    try {
      const target = createDebugTarget()
      const state = await target[action]()
      debugControlState.value = state === 'unknown' ? 'idle' : state
      debugControlError.value = ''
      await refreshCoreRegisters()
      if (action === 'step') {
        pcFocusRequestId.value += 1
      }
    } catch (error) {
      debugControlState.value = 'error'
      debugControlError.value = error instanceof Error ? error.message : String(error)
    }
  }

  async function addHardwareBreakpoint(): Promise<void> {
    if (!options.isConnected.value) {
      debugControlError.value = '请先连接调试探针'
      return
    }
    const address = options.parseHexAddress(breakpointInput.value)
    if (address === null) {
      debugControlError.value = '断点地址必须是十六进制'
      return
    }
    try {
      const target = createDebugTarget()
      await target.setHardwareBreakpoint(address)
      if (!hardwareBreakpoints.value.includes(address)) {
        hardwareBreakpoints.value = [...hardwareBreakpoints.value, address].sort((a, b) => a - b)
        persistHardwareBreakpoints()
      }
      breakpointSlotStatus.value = await target.getHardwareBreakpointStatus()
      debugControlError.value = ''
    } catch (error) {
      debugControlError.value = error instanceof Error ? error.message : String(error)
    }
  }

  async function removeHardwareBreakpoint(address: number): Promise<void> {
    if (!options.isConnected.value) {
      debugControlError.value = '请先连接调试探针'
      return
    }
    try {
      const target = createDebugTarget()
      await target.clearHardwareBreakpoint(address)
      hardwareBreakpoints.value = hardwareBreakpoints.value.filter(item => item !== address)
      persistHardwareBreakpoints()
      breakpointSlotStatus.value = await target.getHardwareBreakpointStatus()
      debugControlError.value = ''
    } catch (error) {
      debugControlError.value = error instanceof Error ? error.message : String(error)
    }
  }

  async function reapplyHardwareBreakpoints(): Promise<void> {
    if (!options.isConnected.value) return
    const target = createDebugTarget()
    if (hardwareBreakpoints.value.length === 0) {
      await refreshBreakpointSlotStatus()
      return
    }
    const failed: number[] = []
    let successCount = 0
    for (const address of hardwareBreakpoints.value) {
      try {
        await target.setHardwareBreakpoint(address)
        successCount += 1
      } catch {
        failed.push(address)
      }
    }
    breakpointSlotStatus.value = await target.getHardwareBreakpointStatus()
    if (failed.length > 0) {
      breakpointRestoreStatus.value = `断点恢复: 成功 ${successCount} / 失败 ${failed.length}`
      debugControlError.value = `部分断点恢复失败: ${failed.map(item => options.formatHexAddress(item)).join(', ')}`
      return
    }
    breakpointRestoreStatus.value = successCount > 0 ? `断点恢复: 已恢复 ${successCount} 个` : ''
  }

  async function clearAllHardwareBreakpoints(): Promise<void> {
    if (!options.isConnected.value) {
      hardwareBreakpoints.value = []
      persistHardwareBreakpoints()
      breakpointRestoreStatus.value = '断点列表已清空（未连接目标）'
      breakpointSlotStatus.value = null
      return
    }
    try {
      const target = createDebugTarget()
      for (const address of hardwareBreakpoints.value) {
        await target.clearHardwareBreakpoint(address)
      }
      hardwareBreakpoints.value = []
      persistHardwareBreakpoints()
      breakpointSlotStatus.value = await target.getHardwareBreakpointStatus()
      debugControlError.value = ''
      breakpointRestoreStatus.value = '断点已全部清除'
    } catch (error) {
      debugControlError.value = error instanceof Error ? error.message : String(error)
    }
  }

  async function readMemoryPreview(): Promise<void> {
    if (!options.isConnected.value) {
      memoryViewError.value = '请先连接调试探针'
      return
    }
    const address = options.parseHexAddress(memoryViewAddressInput.value)
    if (address === null) {
      memoryViewError.value = '内存地址必须是十六进制'
      return
    }
    const byteLength = memoryViewByteLength.value
    if (byteLength === null) {
      memoryViewError.value = '读取长度必须是数字'
      return
    }
    try {
      const bytes = await options.memory.readMemory(address, byteLength)
      const lines: string[] = []
      for (let offset = 0; offset < bytes.length; offset += 16) {
        const chunk = bytes.slice(offset, offset + 16)
        const addrText = options.formatHexAddress((address + offset) >>> 0)
        const hexText = Array.from(chunk)
          .map(item => item.toString(16).toUpperCase().padStart(2, '0'))
          .join(' ')
        const asciiText = Array.from(chunk)
          .map(item => item >= 0x20 && item <= 0x7e ? String.fromCharCode(item) : '.')
          .join('')
        lines.push(`${addrText}: ${hexText.padEnd(47, ' ')} |${asciiText}|`)
      }
      memoryViewHexLines.value = lines
      memoryViewError.value = ''
    } catch (error) {
      memoryViewHexLines.value = []
      memoryViewError.value = error instanceof Error ? error.message : String(error)
    }
  }

  async function writeCoreRegisterValue(): Promise<void> {
    if (!options.isConnected.value) {
      debugControlError.value = '请先连接调试探针'
      return
    }
    const registerIndex = CORE_REGISTER_NAMES.findIndex(name => name === registerWriteName.value)
    if (registerIndex < 0) {
      debugControlError.value = '寄存器名称无效'
      return
    }
    const value = options.parseHexAddress(registerWriteValueInput.value)
    if (value === null) {
      debugControlError.value = '寄存器值必须是十六进制'
      return
    }
    try {
      const target = createDebugTarget()
      await target.writeCoreRegister(registerIndex, value >>> 0)
      debugControlError.value = ''
      await refreshCoreRegisters()
      if (registerWriteName.value === 'PC') {
        pcFocusRequestId.value += 1
      }
    } catch (error) {
      debugControlError.value = error instanceof Error ? error.message : String(error)
    }
  }

  watch(options.isConnected, connected => {
    if (!connected) {
      debugControlState.value = 'idle'
      coreRegisters.value = new Uint32Array(17)
      breakpointRestoreStatus.value = ''
      breakpointSlotStatus.value = null
      debugTargetInstance = null
    } else {
      debugTargetInstance = null
      void reapplyHardwareBreakpoints()
    }
  })

  onMounted(() => {
    restoreHardwareBreakpoints()
  })

  return {
    debugControlState,
    debugControlError,
    breakpointInput,
    hardwareBreakpoints,
    breakpointRestoreStatus,
    breakpointSlotStatus,
    coreRegisterItems,
    memoryViewAddressInput,
    memoryViewLengthInput,
    memoryViewHexLines,
    memoryViewError,
    pcFocusRequestId,
    registerWriteName,
    registerWriteValueInput,
    refreshCoreRegisters,
    handleDebugAction,
    addHardwareBreakpoint,
    removeHardwareBreakpoint,
    clearAllHardwareBreakpoints,
    readMemoryPreview,
    writeCoreRegisterValue,
  }
}
