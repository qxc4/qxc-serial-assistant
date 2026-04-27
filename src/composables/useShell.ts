import { ref, computed, shallowRef } from 'vue'
import { useSerial } from './useSerial'
import { useSettingsStore } from '../stores/settings'

/** 终端行数据 */
export interface TerminalLine {
  /** 唯一标识 */
  id: number
  /** 文本内容 */
  text: string
  /** 行类型 */
  type: 'input' | 'output' | 'error' | 'system' | 'prompt'
  /** 时间戳 */
  timestamp: number
  /** ANSI 样式类名 */
  ansiClass?: string
}

/** 命令历史条目 */
interface HistoryEntry {
  command: string
  timestamp: number
}

/** 环境变量 */
interface EnvVar {
  key: string
  value: string
}

/** 危险命令模式 */
const DANGEROUS_PATTERNS = [
  /\brm\s+-rf\s+\//i,
  /\bformat\s+[a-z]:/i,
  /\bdd\s+if=/i,
  /\bmkfs\b/i,
  /\b(fdisk|parted)\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bhalt\b/i,
  /\binit\s+[06]/i,
]

/** 最大历史记录数 */
const MAX_HISTORY = 500

/** 最大终端行数 */
const MAX_TERMINAL_LINES = 10000

/** 行 ID 计数器 */
let lineIdCounter = 0

/** 历史记录（全局单例） */
const history = ref<HistoryEntry[]>([])
const historyIndex = ref(-1)
const historyTempInput = ref('')

/** 终端行数据 */
const lines = shallowRef<TerminalLine[]>([])
const lineBuffer: TerminalLine[] = []

/** 环境变量 */
const envVars = ref<EnvVar[]>([])

/** 命令提示符 */
const promptText = ref('$ ')

/** 是否正在等待确认 */
const pendingConfirmation = ref<{ command: string; resolve: (ok: boolean) => void } | null>(null)

/** 搜索模式 */
const searchMode = ref(false)
const searchQuery = ref('')
const searchResults = ref<number[]>([])

/** 自动滚动 */
const autoScroll = ref(true)

/** 输出暂停 */
const outputPaused = ref(false)

export function useShell() {
  const { isConnected, send } = useSerial()
  const settingsStore = useSettingsStore()

  /** Shell 配置 */
  const shellConfig = computed({
    get: () => settingsStore.config.shellSettings ?? {
      echoCommands: true,
      showTimestamp: false,
      confirmDangerous: true,
      maxHistory: 500,
      prompt: '$ ',
      fontSize: 14,
    },
    set: (val) => { settingsStore.config.shellSettings = val }
  })

  /**
   * 添加一行到终端缓冲区
   * @param text 文本内容
   * @param type 行类型
   */
  function addLine(text: string, type: TerminalLine['type'] = 'output'): void {
    const line: TerminalLine = {
      id: ++lineIdCounter,
      text,
      type,
      timestamp: Date.now(),
    }
    lineBuffer.push(line)

    if (lineBuffer.length > MAX_TERMINAL_LINES) {
      lineBuffer.splice(0, lineBuffer.length - MAX_TERMINAL_LINES)
    }

    lines.value = [...lineBuffer]
  }

  /**
   * 添加系统消息
   * @param text 消息文本
   */
  function addSystemLine(text: string): void {
    addLine(`[系统] ${text}`, 'system')
  }

  /**
   * 添加错误消息
   * @param text 错误文本
   */
  function addErrorLine(text: string): void {
    addLine(`[错误] ${text}`, 'error')
  }

  /**
   * 添加提示行
   * @param text 提示文本
   */
  function addPromptLine(text: string): void {
    addLine(text, 'prompt')
  }

  /**
   * 替换变量引用 ${VAR} 为实际值
   * @param input 输入字符串
   * @returns 替换后的字符串
   */
  function substituteVariables(input: string): string {
    return input.replace(/\$\{(\w+)\}/g, (_match, key: string) => {
      const envVar = envVars.value.find(v => v.key === key)
      if (envVar) return envVar.value
      return `\${${key}:未定义}`
    })
  }

  /**
   * 检查命令是否为危险命令
   * @param command 命令字符串
   * @returns 是否为危险命令
   */
  function isDangerousCommand(command: string): boolean {
    if (!shellConfig.value.confirmDangerous) return false
    return DANGEROUS_PATTERNS.some(pattern => pattern.test(command))
  }

  /**
   * 处理管道命令
   * 将 "cmd1 | cmd2" 解析为多个命令
   * @param input 输入字符串
   * @returns 命令数组
   */
  function parsePipeline(input: string): string[] {
    return input.split('|').map(cmd => cmd.trim()).filter(cmd => cmd.length > 0)
  }

  /**
   * 处理重定向
   * 解析 "cmd > file" 或 "cmd >> file"
   * @param input 输入字符串
   * @returns 解析结果
   */
  function parseRedirection(input: string): { command: string; target?: string; append?: boolean } {
    const appendMatch = input.match(/^(.+?)\s*>>\s*(.+)$/)
    if (appendMatch) {
      return { command: appendMatch[1].trim(), target: appendMatch[2].trim(), append: true }
    }
    const overwriteMatch = input.match(/^(.+?)\s*>\s*(.+)$/)
    if (overwriteMatch) {
      return { command: overwriteMatch[1].trim(), target: overwriteMatch[2].trim(), append: false }
    }
    return { command: input }
  }

  /**
   * 处理内置命令
   * @param command 命令字符串
   * @returns 是否为内置命令
   */
  function handleBuiltinCommand(command: string): boolean {
    const trimmed = command.trim()
    const parts = trimmed.split(/\s+/)
    const cmd = parts[0].toLowerCase()

    switch (cmd) {
      case 'help': {
        addSystemLine('可用内置命令:')
        addLine('  help              - 显示帮助信息', 'output')
        addLine('  clear             - 清空终端', 'output')
        addLine('  history           - 显示命令历史', 'output')
        addLine('  env               - 显示环境变量', 'output')
        addLine('  export KEY=VALUE  - 设置环境变量', 'output')
        addLine('  unset KEY         - 删除环境变量', 'output')
        addLine('  echo TEXT         - 输出文本', 'output')
        addLine('  prompt TEXT       - 修改提示符', 'output')
        addLine('  save              - 保存当前配置', 'output')
        addLine('  pause             - 暂停输出', 'output')
        addLine('  resume            - 恢复输出', 'output')
        return true
      }

      case 'clear': {
        lineBuffer.length = 0
        lines.value = []
        return true
      }

      case 'history': {
        if (history.value.length === 0) {
          addSystemLine('暂无命令历史')
          return true
        }
        addSystemLine('命令历史:')
        const recent = history.value.slice(-50)
        recent.forEach((entry, i) => {
          const idx = history.value.length - 50 + i + 1
          addLine(`  ${String(idx).padStart(4)}  ${entry.command}`, 'output')
        })
        return true
      }

      case 'env': {
        if (envVars.value.length === 0) {
          addSystemLine('暂无环境变量')
          return true
        }
        addSystemLine('环境变量:')
        envVars.value.forEach(v => {
          addLine(`  ${v.key}=${v.value}`, 'output')
        })
        return true
      }

      case 'export': {
        const expr = trimmed.slice(7).trim()
        const eqIdx = expr.indexOf('=')
        if (eqIdx === -1) {
          addErrorLine('用法: export KEY=VALUE')
          return true
        }
        const key = expr.slice(0, eqIdx).trim()
        const value = expr.slice(eqIdx + 1).trim()
        if (!key) {
          addErrorLine('变量名不能为空')
          return true
        }
        const existing = envVars.value.find(v => v.key === key)
        if (existing) {
          existing.value = value
        } else {
          envVars.value.push({ key, value })
        }
        addSystemLine(`已设置: ${key}=${value}`)
        return true
      }

      case 'unset': {
        const key = parts[1]
        if (!key) {
          addErrorLine('用法: unset KEY')
          return true
        }
        const idx = envVars.value.findIndex(v => v.key === key)
        if (idx !== -1) {
          envVars.value.splice(idx, 1)
          addSystemLine(`已删除: ${key}`)
        } else {
          addErrorLine(`变量不存在: ${key}`)
        }
        return true
      }

      case 'echo': {
        const text = trimmed.slice(5).trim()
        const substituted = substituteVariables(text)
        addLine(substituted, 'output')
        return true
      }

      case 'prompt': {
        const newPrompt = trimmed.slice(7).trim() || '$ '
        promptText.value = newPrompt
        addSystemLine(`提示符已更改为: ${newPrompt}`)
        return true
      }

      case 'save': {
        try {
          addSystemLine('配置已保存')
        } catch {
          addErrorLine('保存失败')
        }
        return true
      }

      case 'pause': {
        outputPaused.value = true
        addSystemLine('输出已暂停 (使用 resume 恢复)')
        return true
      }

      case 'resume': {
        outputPaused.value = false
        addSystemLine('输出已恢复')
        return true
      }

      default:
        return false
    }
  }

  /**
   * 执行命令
   * @param command 命令字符串
   * @returns 是否执行成功
   */
  async function executeCommand(command: string): Promise<boolean> {
    const trimmed = command.trim()
    if (!trimmed) return false

    // 添加到历史
    history.value.push({ command: trimmed, timestamp: Date.now() })
    if (history.value.length > MAX_HISTORY) {
      history.value.splice(0, history.value.length - MAX_HISTORY)
    }
    historyIndex.value = -1
    historyTempInput.value = ''

    // 显示输入行
    if (shellConfig.value.echoCommands) {
      addPromptLine(`${promptText.value}${trimmed}`)
    }

    // 变量替换
    const substituted = substituteVariables(trimmed)

    // 检查危险命令
    if (isDangerousCommand(substituted)) {
      addErrorLine('⚠ 检测到潜在危险命令，请确认是否执行')
      return new Promise<boolean>((resolve) => {
        pendingConfirmation.value = { command: substituted, resolve }
      })
    }

    return doExecute(substituted)
  }

  /**
   * 实际执行命令（确认后调用）
   * @param command 命令字符串
   * @returns 是否执行成功
   */
  async function doExecute(command: string): Promise<boolean> {
    // 解析重定向
    const { command: cmd, target, append } = parseRedirection(command)

    // 解析管道
    const pipeline = parsePipeline(cmd)

    // 检查内置命令（仅对管道的第一个命令）
    if (pipeline.length === 1 && !target) {
      if (handleBuiltinCommand(pipeline[0])) {
        return true
      }
    }

    // 检查连接状态
    if (!isConnected.value) {
      addErrorLine('串口未连接，请先连接设备')
      return false
    }

    // 执行管道命令
    for (let i = 0; i < pipeline.length; i++) {
      const cmdText = pipeline[i]

      if (i === pipeline.length - 1 && target) {
        // 最后一个命令 + 重定向
        addSystemLine(`输出将${append ? '追加' : '写入'}到: ${target}`)
      }

      try {
        await send(cmdText)
      } catch (err) {
        addErrorLine(`发送失败: ${err instanceof Error ? err.message : String(err)}`)
        return false
      }

      // 管道间添加延迟
      if (i < pipeline.length - 1) {
        await new Promise(r => setTimeout(r, 50))
      }
    }

    return true
  }

  /**
   * 确认执行危险命令
   */
  function confirmDangerousCommand(): void {
    if (pendingConfirmation.value) {
      const { command, resolve } = pendingConfirmation.value
      pendingConfirmation.value = null
      addSystemLine('已确认执行危险命令')
      doExecute(command).then(resolve)
    }
  }

  /**
   * 取消执行危险命令
   */
  function cancelDangerousCommand(): void {
    if (pendingConfirmation.value) {
      pendingConfirmation.value.resolve(false)
      pendingConfirmation.value = null
      addSystemLine('已取消执行')
    }
  }

  /**
   * 在历史记录中向上导航
   * @param currentInput 当前输入内容
   * @returns 历史命令
   */
  function historyUp(currentInput: string): string {
    if (history.value.length === 0) return currentInput

    if (historyIndex.value === -1) {
      historyTempInput.value = currentInput
      historyIndex.value = history.value.length - 1
    } else if (historyIndex.value > 0) {
      historyIndex.value--
    }

    return history.value[historyIndex.value].command
  }

  /**
   * 在历史记录中向下导航
   * @returns 历史命令或临时输入
   */
  function historyDown(): string {
    if (historyIndex.value === -1) return historyTempInput.value

    if (historyIndex.value < history.value.length - 1) {
      historyIndex.value++
      return history.value[historyIndex.value].command
    }

    historyIndex.value = -1
    return historyTempInput.value
  }

  /**
   * 搜索历史记录
   * @param query 搜索关键词
   * @returns 匹配的命令列表
   */
  function searchHistory(query: string): string[] {
    if (!query) return []
    const lowerQuery = query.toLowerCase()
    return history.value
      .filter(h => h.command.toLowerCase().includes(lowerQuery))
      .map(h => h.command)
      .slice(-20)
  }

  /**
   * 清空终端
   */
  function clearTerminal(): void {
    lineBuffer.length = 0
    lines.value = []
  }

  /**
   * 清空历史
   */
  function clearHistory(): void {
    history.value = []
    historyIndex.value = -1
  }

  /**
   * 获取自动补全建议
   * @param input 当前输入
   * @returns 建议列表
   */
  function getCompletions(input: string): string[] {
    if (!input) return []
    const lowerInput = input.toLowerCase()
    const builtins = ['help', 'clear', 'history', 'env', 'export', 'unset', 'echo', 'prompt', 'save', 'pause', 'resume']
    const matches = builtins.filter(b => b.startsWith(lowerInput))
    const historyMatches = history.value
      .filter(h => h.command.toLowerCase().startsWith(lowerInput))
      .map(h => h.command)
    return [...new Set([...matches, ...historyMatches])].slice(0, 10)
  }

  return {
    lines,
    history,
    historyIndex,
    envVars,
    promptText,
    pendingConfirmation,
    searchMode,
    searchQuery,
    searchResults,
    autoScroll,
    outputPaused,
    shellConfig,
    addLine,
    addSystemLine,
    addErrorLine,
    addPromptLine,
    executeCommand,
    confirmDangerousCommand,
    cancelDangerousCommand,
    historyUp,
    historyDown,
    searchHistory,
    clearTerminal,
    clearHistory,
    getCompletions,
    substituteVariables,
  }
}
