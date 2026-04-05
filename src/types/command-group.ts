/**
 * 指令执行状态枚举
 */
export const CommandStatus = {
  Pending: 'pending',
  Running: 'running',
  Success: 'success',
  Failed: 'failed',
  Timeout: 'timeout',
  Skipped: 'skipped'
} as const
export type CommandStatus = typeof CommandStatus[keyof typeof CommandStatus]

/**
 * 单条指令定义
 */
export interface CommandItem {
  id: number
  content: string
  description: string
  isHex: boolean
  delay: number
  timeout: number
  enabled: boolean
  dependencies: number[]
}

/**
 * 指令组执行记录项
 */
export interface ExecutionLogEntry {
  id: number
  commandId: number
  status: CommandStatus
  sentData: string
  responseData: string
  startTime: number
  endTime: number
  duration: number
  message?: string
}

/**
 * 指令组定义
 */
export interface CommandGroup {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
  commands: CommandItem[]
  onFailure: FailurePolicy
  globalTimeout: number
  /** 版本号 */
  version: number
}

/**
 * 指令组历史版本记录
 */
export interface GroupVersion {
  /** 版本号 */
  version: number
  /** 保存时间 */
  savedAt: number
  /** 该版本的快照数据 */
  snapshot: CommandGroup
  /** 变更描述 */
  changeNote?: string
}

/**
 * 前序指令失败处理策略
 */
export const FailurePolicy = {
  StopAll: 'stop-all',
  SkipAndContinue: 'skip-continue',
  SkipDependents: 'skip-dependents'
} as const
export type FailurePolicy = typeof FailurePolicy[keyof typeof FailurePolicy]

/**
 * 指令组整体执行状态
 */
export const GroupExecutionState = {
  Idle: 'idle',
  Running: 'running',
  Paused: 'paused',
  Completed: 'completed',
  Stopped: 'stopped'
} as const
export type GroupExecutionState = typeof GroupExecutionState[keyof typeof GroupExecutionState]

/**
 * 操作结果类型
 */
export interface OperationResult<T = void> {
  success: boolean
  data?: T
  error?: string
  code?: string
}

/**
 * 自动保存配置
 */
export interface AutoSaveConfig {
  enabled: boolean
  interval: number
  maxVersions: number
}

/**
 * 数据恢复点
 */
export interface RecoveryPoint {
  id: string
  timestamp: number
  type: 'auto' | 'manual' | 'before_operation'
  data: CommandGroup
}
