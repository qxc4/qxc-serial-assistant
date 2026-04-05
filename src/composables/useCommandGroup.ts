import { ref, computed, shallowRef, watch, onMounted, onUnmounted } from 'vue'
import type {
  CommandGroup,
  CommandItem,
  ExecutionLogEntry,
  GroupExecutionState,
  CommandStatus,
  GroupVersion,
  OperationResult,
  AutoSaveConfig,
  RecoveryPoint
} from '../types/command-group'
import {
  CommandStatus as CmdStatus,
  GroupExecutionState as GrpState,
  FailurePolicy as FailPolicy
} from '../types/command-group'

/** localStorage 存储键名 */
const STORAGE_KEY = 'qxc-serial-command-groups'
const VERSIONS_KEY = 'qxc-serial-group-versions'
const RECOVERY_KEY = 'qxc-serial-recovery-points'
const AUTOSAVE_CONFIG_KEY = 'qxc-serial-autosave-config'

/** 默认自动保存配置 */
const DEFAULT_AUTOSAVE_CONFIG: AutoSaveConfig = {
  enabled: true,
  interval: 30000,
  maxVersions: 10
}

/** 全局日志ID计数器 */
let logIdCounter = 0

/**
 * 指令组管理 Composable
 * 提供指令组的创建、编辑、保存、加载及完整的执行控制能力
 * 支持自动保存、历史版本、数据恢复等高级功能
 */
export function useCommandGroup() {

  /** 当前激活的指令组（可编辑状态） */
  const activeGroup = ref<CommandGroup>(createEmptyGroup())

  /** 所有已保存的指令组列表 */
  const savedGroups = ref<CommandGroup[]>(loadGroupsFromStorage())

  /** 当前指令组的历史版本列表 */
  const groupVersions = ref<GroupVersion[]>([])

  /** 当前指令组整体执行状态 */
  const executionState = ref<GroupExecutionState>(GrpState.Idle)

  /** 当前正在执行的指令索引 */
  const currentExecutingIndex = ref(-1)

  /** 各指令的实时执行状态映射 (commandId -> status) */
  const commandStatusMap = ref<Record<number, CommandStatus>>({})

  /** 执行日志记录列表 */
  const executionLogs = shallowRef<ExecutionLogEntry[]>([])

  /** 自动保存配置 */
  const autoSaveConfig = ref<AutoSaveConfig>(loadAutoSaveConfig())

  /** 自动保存定时器 */
  let autoSaveTimer: ReturnType<typeof setInterval> | null = null

  /** 是否有未保存的更改 */
  const hasUnsavedChanges = ref(false)

  /** 恢复点列表 */
  const recoveryPoints = ref<RecoveryPoint[]>([])

  /** 最后一次错误信息 */
  const lastError = ref<string>('')

  /** 执行暂停/中断的控制器引用 */
  let abortController: AbortController | null = null

  /** 是否已因策略停止（用于标记不可恢复的终止） */
  let isStoppedByPolicy = false

  /** 已成功完成的指令ID集合（用于断点续传） */
  let completedCommandIds = new Set<number>()

  /** 暂停时的执行位置（用于精确恢复） */
  let pausedAtIndex = -1

  // ==================== 初始化 ====================

  /**
   * 初始化自动保存
   */
  function initAutoSave(): void {
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer)
    }
    
    if (autoSaveConfig.value.enabled) {
      autoSaveTimer = setInterval(() => {
        if (hasUnsavedChanges.value && activeGroup.value.commands.length > 0) {
          performAutoSave()
        }
      }, autoSaveConfig.value.interval)
    }
  }

  /**
   * 监听活跃指令组变化，标记未保存
   */
  watch(activeGroup, () => {
    hasUnsavedChanges.value = true
  }, { deep: true })

  /**
   * 组件挂载时初始化
   */
  onMounted(() => {
    initAutoSave()
    loadRecoveryPoints()
  })

  /**
   * 组件卸载时清理
   */
  onUnmounted(() => {
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer)
    }
  })

  // ==================== 创建与添加功能 ====================

  /**
   * 创建一个空白的指令组模板
   */
  function createEmptyGroup(): CommandGroup {
    return {
      id: generateId(),
      name: '未命名指令组',
      description: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      commands: [],
      onFailure: FailPolicy.SkipAndContinue,
      globalTimeout: 5000,
      version: 1
    }
  }

  /**
   * 创建一条空白指令项
   */
  function createEmptyCommand(): CommandItem {
    return {
      id: Date.now() + Math.random(),
      content: '',
      description: '',
      isHex: false,
      delay: 500,
      timeout: 0,
      enabled: true,
      dependencies: []
    }
  }

  /**
   * 创建新的指令组（带唯一性校验）
   */
  function createNewGroup(name?: string): OperationResult<CommandGroup> {
    const groupName = name || '未命名指令组'
    
    /** 检查名称唯一性 */
    const existingNames = savedGroups.value.map(g => g.name.toLowerCase())
    let finalName = groupName
    let counter = 1
    
    while (existingNames.includes(finalName.toLowerCase())) {
      finalName = `${groupName} (${counter})`
      counter++
    }

    const newGroup: CommandGroup = {
      id: generateId(),
      name: finalName,
      description: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      commands: [],
      onFailure: FailPolicy.SkipAndContinue,
      globalTimeout: 5000,
      version: 1
    }

    activeGroup.value = newGroup
    hasUnsavedChanges.value = false
    resetAllStatuses()
    
    return { success: true, data: newGroup }
  }

  /**
   * 检查指令组名称是否唯一
   */
  function isNameUnique(name: string, excludeId?: string): boolean {
    return !savedGroups.value.some(g => 
      g.name.toLowerCase() === name.toLowerCase() && g.id !== excludeId
    )
  }

  /**
   * 重命名指令组（带唯一性校验）
   */
  function renameGroup(newName: string): OperationResult {
    if (!newName.trim()) {
      return { success: false, error: '名称不能为空', code: 'EMPTY_NAME' }
    }

    if (!isNameUnique(newName, activeGroup.value.id)) {
      return { success: false, error: '该名称已被使用', code: 'DUPLICATE_NAME' }
    }

    activeGroup.value.name = newName.trim()
    touchGroup()
    
    return { success: true }
  }

  /**
   * 向当前指令组添加一条新指令
   */
  function addCommand(afterId?: number): OperationResult<CommandItem> {
    try {
      const newCmd = createEmptyCommand()
      
      if (afterId !== undefined) {
        const idx = activeGroup.value.commands.findIndex(c => c.id === afterId)
        if (idx >= 0) {
          activeGroup.value.commands.splice(idx + 1, 0, newCmd)
        } else {
          activeGroup.value.commands.push(newCmd)
        }
      } else {
        activeGroup.value.commands.push(newCmd)
      }
      
      touchGroup()
      return { success: true, data: newCmd }
    } catch (e) {
      return { success: false, error: '添加指令失败', code: 'ADD_COMMAND_ERROR' }
    }
  }

  /**
   * 批量添加指令
   */
  function addCommands(commands: Partial<CommandItem>[]): OperationResult<CommandItem[]> {
    try {
      const addedCommands: CommandItem[] = []
      const baseTime = Date.now()
      
      commands.forEach((partial, index) => {
        const newCmd: CommandItem = {
          id: baseTime + index + Math.random(),
          content: partial.content || '',
          description: partial.description || '',
          isHex: partial.isHex || false,
          delay: partial.delay || 500,
          timeout: partial.timeout || 0,
          enabled: partial.enabled !== false,
          dependencies: partial.dependencies || []
        }
        activeGroup.value.commands.push(newCmd)
        addedCommands.push(newCmd)
      })
      
      touchGroup()
      return { success: true, data: addedCommands }
    } catch (e) {
      return { success: false, error: '批量添加指令失败', code: 'BATCH_ADD_ERROR' }
    }
  }

  /**
   * 删除指定指令
   */
  function removeCommand(commandId: number): OperationResult {
    const idx = activeGroup.value.commands.findIndex(c => c.id === commandId)
    if (idx < 0) {
      return { success: false, error: '指令不存在', code: 'COMMAND_NOT_FOUND' }
    }

    /** 创建恢复点 */
    createRecoveryPoint('before_operation', '删除指令前')

    activeGroup.value.commands.splice(idx, 1)
    
    /** 清理其他指令的依赖引用 */
    activeGroup.value.commands.forEach(cmd => {
      cmd.dependencies = cmd.dependencies.filter(depId => depId !== commandId)
    })
    
    touchGroup()
    return { success: true }
  }

  /**
   * 更新指定指令的内容
   */
  function updateCommand(commandId: number, partial: Partial<CommandItem>): OperationResult {
    const cmd = activeGroup.value.commands.find(c => c.id === commandId)
    if (!cmd) {
      return { success: false, error: '指令不存在', code: 'COMMAND_NOT_FOUND' }
    }
    
    Object.assign(cmd, partial)
    touchGroup()
    return { success: true }
  }

  /**
   * 清空当前指令组中的所有指令
   */
  function clearCommands(): OperationResult {
    if (activeGroup.value.commands.length === 0) {
      return { success: true }
    }

    /** 创建恢复点 */
    createRecoveryPoint('before_operation', '清空指令前')

    activeGroup.value.commands = []
    commandStatusMap.value = {}
    executionLogs.value = []
    touchGroup()
    
    return { success: true }
  }

  /**
   * 重置所有指令的执行状态
   */
  function resetAllStatuses(keepCompleted = false): void {
    const map: Record<number, CommandStatus> = {}
    for (const cmd of activeGroup.value.commands) {
      if (keepCompleted && completedCommandIds.has(cmd.id)) {
        map[cmd.id] = CmdStatus.Success
      } else if (cmd.enabled) {
        map[cmd.id] = CmdStatus.Pending
      } else {
        map[cmd.id] = CmdStatus.Skipped
      }
    }
    commandStatusMap.value = map
    if (!keepCompleted) {
      executionLogs.value = []
    }
    currentExecutingIndex.value = -1
  }

  /**
   * 更新指令组的修改时间戳
   */
  function touchGroup(): void {
    activeGroup.value.updatedAt = Date.now()
    hasUnsavedChanges.value = true
  }

  // ==================== 保存与加载功能 ====================

  /**
   * 保存当前指令组（手动保存）
   */
  function saveCurrentGroup(changeNote?: string): OperationResult {
    /** 验证 */
    if (!activeGroup.value.name.trim()) {
      return { success: false, error: '请输入指令组名称', code: 'EMPTY_NAME' }
    }
    
    if (activeGroup.value.commands.length === 0) {
      return { success: false, error: '指令组不能为空', code: 'EMPTY_GROUP' }
    }

    try {
      /** 创建历史版本快照 */
      const existingGroup = savedGroups.value.find(g => g.id === activeGroup.value.id)
      const oldVersion = existingGroup?.version || 0

      /** 更新版本号 */
      activeGroup.value.version = oldVersion + 1
      activeGroup.value.updatedAt = Date.now()

      /** 深拷贝保存 */
      const clone = JSON.parse(JSON.stringify(activeGroup.value)) as CommandGroup

      /** 更新或添加到已保存列表 */
      const existingIdx = savedGroups.value.findIndex(g => g.id === activeGroup.value.id)
      if (existingIdx >= 0) {
        savedGroups.value[existingIdx] = clone
      } else {
        savedGroups.value.push(clone)
      }

      /** 保存历史版本 */
      saveVersion(clone, changeNote)

      /** 持久化存储 */
      saveGroupsToStorage(savedGroups.value)

      hasUnsavedChanges.value = false
      lastError.value = ''

      return { success: true }
    } catch (e) {
      const errorMsg = '保存失败：' + (e instanceof Error ? e.message : '未知错误')
      lastError.value = errorMsg
      return { success: false, error: errorMsg, code: 'SAVE_ERROR' }
    }
  }

  /**
   * 检查当前指令组是否已保存（存在于已保存列表中）
   */
  function isExistingGroup(): boolean {
    return savedGroups.value.some(g => g.id === activeGroup.value.id)
  }

  /**
   * 另存为新指令组
   */
  function saveAsGroup(newName?: string): OperationResult<CommandGroup> {
    /** 验证 */
    if (activeGroup.value.commands.length === 0) {
      return { success: false, error: '指令组不能为空', code: 'EMPTY_GROUP' }
    }

    const name = newName || activeGroup.value.name.trim()
    if (!name) {
      return { success: false, error: '请输入指令组名称', code: 'EMPTY_NAME' }
    }

    /** 检查名称唯一性 */
    if (!isNameUnique(name)) {
      return { success: false, error: '该名称已被使用，请使用其他名称', code: 'DUPLICATE_NAME' }
    }

    try {
      /** 创建新组 */
      const newGroup: CommandGroup = {
        ...JSON.parse(JSON.stringify(activeGroup.value)),
        id: generateId(),
        name: name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1
      }

      /** 重新生成指令ID */
      newGroup.commands.forEach(cmd => {
        cmd.id = Date.now() + Math.random()
      })

      /** 添加到已保存列表 */
      savedGroups.value.push(newGroup)
      saveGroupsToStorage(savedGroups.value)

      /** 切换到新组 */
      activeGroup.value = JSON.parse(JSON.stringify(newGroup))
      hasUnsavedChanges.value = false

      /** 保存初始版本 */
      saveVersion(newGroup, '另存为')

      return { success: true, data: newGroup }
    } catch (e) {
      const errorMsg = '另存为失败：' + (e instanceof Error ? e.message : '未知错误')
      lastError.value = errorMsg
      return { success: false, error: errorMsg, code: 'SAVE_AS_ERROR' }
    }
  }

  /**
   * 执行自动保存
   */
  function performAutoSave(): OperationResult {
    if (activeGroup.value.commands.length === 0) {
      return { success: false, error: '无内容需要保存', code: 'NOTHING_TO_SAVE' }
    }

    /** 创建恢复点 */
    createRecoveryPoint('auto', '自动保存')

    /** 静默保存，不更新版本号 */
    try {
      const clone = JSON.parse(JSON.stringify(activeGroup.value)) as CommandGroup
      const existingIdx = savedGroups.value.findIndex(g => g.id === activeGroup.value.id)
      
      if (existingIdx >= 0) {
        savedGroups.value[existingIdx] = clone
        saveGroupsToStorage(savedGroups.value)
      }
      /** 如果是新组，自动保存不写入主列表，只创建恢复点 */

      return { success: true }
    } catch (e) {
      return { success: false, error: '自动保存失败', code: 'AUTOSAVE_ERROR' }
    }
  }

  /**
   * 保存历史版本
   */
  function saveVersion(group: CommandGroup, changeNote?: string): void {
    const version: GroupVersion = {
      version: group.version,
      savedAt: Date.now(),
      snapshot: JSON.parse(JSON.stringify(group)),
      changeNote
    }

    /** 加载该组的所有版本 */
    const allVersions = loadAllVersions()
    const groupVersionsList = allVersions[group.id] || []

    /** 添加新版本 */
    groupVersionsList.unshift(version)

    /** 限制版本数量 */
    if (groupVersionsList.length > autoSaveConfig.value.maxVersions) {
      groupVersionsList.splice(autoSaveConfig.value.maxVersions)
    }

    allVersions[group.id] = groupVersionsList
    saveAllVersions(allVersions)

    /** 更新当前版本列表 */
    groupVersions.value = groupVersionsList
  }

  /**
   * 从已保存列表中加载一个指令组
   */
  function loadGroup(groupId: string): OperationResult<CommandGroup> {
    const found = savedGroups.value.find(g => g.id === groupId)
    if (!found) {
      return { success: false, error: '指令组不存在', code: 'GROUP_NOT_FOUND' }
    }

    try {
      /** 如果当前有未保存更改，创建恢复点 */
      if (hasUnsavedChanges.value) {
        createRecoveryPoint('before_operation', '切换指令组前')
      }

      activeGroup.value = JSON.parse(JSON.stringify(found))
      hasUnsavedChanges.value = false
      resetAllStatuses()

      /** 加载该组的历史版本 */
      loadGroupVersions(groupId)

      return { success: true, data: activeGroup.value }
    } catch (e) {
      return { success: false, error: '加载失败', code: 'LOAD_ERROR' }
    }
  }

  /**
   * 加载指定历史版本
   */
  function loadVersion(version: number): OperationResult<CommandGroup> {
    const foundVersion = groupVersions.value.find(v => v.version === version)
    if (!foundVersion) {
      return { success: false, error: '版本不存在', code: 'VERSION_NOT_FOUND' }
    }

    try {
      /** 创建恢复点 */
      createRecoveryPoint('before_operation', `恢复到版本 ${version} 前`)

      activeGroup.value = JSON.parse(JSON.stringify(foundVersion.snapshot))
      hasUnsavedChanges.value = true
      resetAllStatuses()

      return { success: true, data: activeGroup.value }
    } catch (e) {
      return { success: false, error: '版本加载失败', code: 'VERSION_LOAD_ERROR' }
    }
  }

  /**
   * 快速加载（仅加载元数据，延迟加载指令详情）
   */
  function quickLoadGroup(groupId: string): OperationResult<CommandGroup> {
    const found = savedGroups.value.find(g => g.id === groupId)
    if (!found) {
      return { success: false, error: '指令组不存在', code: 'GROUP_NOT_FOUND' }
    }

    /** 先加载基本信息 */
    const quickLoad: CommandGroup = {
      ...found,
      commands: []  /** 延迟加载指令 */
    }

    activeGroup.value = quickLoad
    hasUnsavedChanges.value = false

    /** 异步加载完整数据 */
    setTimeout(() => {
      const fullData = savedGroups.value.find(g => g.id === groupId)
      if (fullData) {
        activeGroup.value = JSON.parse(JSON.stringify(fullData))
        resetAllStatuses()
        loadGroupVersions(groupId)
      }
    }, 0)

    return { success: true, data: quickLoad }
  }

  /**
   * 增量加载指令（分批加载大量指令）
   */
  async function incrementalLoadCommands(
    groupId: string,
    batchSize: number = 50
  ): Promise<OperationResult> {
    const found = savedGroups.value.find(g => g.id === groupId)
    if (!found) {
      return { success: false, error: '指令组不存在', code: 'GROUP_NOT_FOUND' }
    }

    const allCommands = found.commands
    let loadedCount = 0

    /** 清空当前指令 */
    activeGroup.value.commands = []

    /** 分批加载 */
    while (loadedCount < allCommands.length) {
      const batch = allCommands.slice(loadedCount, loadedCount + batchSize)
      activeGroup.value.commands.push(...batch)
      loadedCount += batchSize
      
      /** 让出执行权，避免阻塞UI */
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    return { success: true }
  }

  /**
   * 删除一个已保存的指令组
   */
  function deleteSavedGroup(groupId: string): OperationResult {
    /** 创建恢复点 */
    createRecoveryPoint('before_operation', '删除指令组前')

    savedGroups.value = savedGroups.value.filter(g => g.id !== groupId)
    saveGroupsToStorage(savedGroups.value)

    /** 删除相关版本历史 */
    const allVersions = loadAllVersions()
    delete allVersions[groupId]
    saveAllVersions(allVersions)

    /** 如果删除的是当前激活的组，创建新组 */
    if (activeGroup.value.id === groupId) {
      activeGroup.value = createEmptyGroup()
      hasUnsavedChanges.value = false
    }

    return { success: true }
  }

  /**
   * 复制指令组
   */
  function duplicateGroup(groupId: string): OperationResult<CommandGroup> {
    const found = savedGroups.value.find(g => g.id === groupId)
    if (!found) {
      return { success: false, error: '指令组不存在', code: 'GROUP_NOT_FOUND' }
    }

    const clone: CommandGroup = JSON.parse(JSON.stringify(found))
    clone.id = generateId()
    clone.name = `${found.name} (副本)`
    clone.createdAt = Date.now()
    clone.updatedAt = Date.now()
    clone.version = 1

    /** 重新生成指令ID */
    const idMap = new Map<number, number>()
    clone.commands.forEach(cmd => {
      const newId = Date.now() + Math.random()
      idMap.set(cmd.id, newId)
      cmd.id = newId
    })

    /** 更新依赖引用 */
    clone.commands.forEach(cmd => {
      cmd.dependencies = cmd.dependencies
        .map(depId => idMap.get(depId))
        .filter((id): id is number => id !== undefined)
    })

    savedGroups.value.push(clone)
    saveGroupsToStorage(savedGroups.value)

    return { success: true, data: clone }
  }

  // ==================== 导入导出功能 ====================

  /**
   * 导出指令组为JSON字符串
   */
  function exportGroupAsJson(group?: CommandGroup): string {
    const target = group ?? activeGroup.value
    return JSON.stringify(target, null, 2)
  }

  /**
   * 从JSON字符串导入指令组
   */
  function importGroupFromJson(jsonStr: string): OperationResult<CommandGroup> {
    try {
      const parsed = JSON.parse(jsonStr) as Partial<CommandGroup>
      
      /** 验证必要字段 */
      if (!parsed || !Array.isArray(parsed.commands)) {
        return { success: false, error: '无效的JSON格式', code: 'INVALID_FORMAT' }
      }

      /** 创建恢复点 */
      createRecoveryPoint('before_operation', '导入前')

      /** 构建完整的指令组 */
      const imported: CommandGroup = {
        id: generateId(),
        name: parsed.name || '导入的指令组',
        description: parsed.description || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        commands: parsed.commands.map(cmd => ({
          id: Date.now() + Math.random(),
          content: cmd.content || '',
          description: cmd.description || '',
          isHex: cmd.isHex || false,
          delay: cmd.delay || 500,
          timeout: cmd.timeout || 0,
          enabled: cmd.enabled !== false,
          dependencies: []
        })),
        onFailure: parsed.onFailure || FailPolicy.SkipAndContinue,
        globalTimeout: parsed.globalTimeout || 5000,
        version: 1
      }

      activeGroup.value = imported
      hasUnsavedChanges.value = true
      resetAllStatuses()

      return { success: true, data: imported }
    } catch (e) {
      return { success: false, error: 'JSON解析失败', code: 'PARSE_ERROR' }
    }
  }

  // ==================== 恢复点与数据恢复 ====================

  /**
   * 创建恢复点
   */
  function createRecoveryPoint(type: RecoveryPoint['type'], _description?: string): void {
    const point: RecoveryPoint = {
      id: `rp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: Date.now(),
      type,
      data: JSON.parse(JSON.stringify(activeGroup.value))
    }

    recoveryPoints.value.unshift(point)

    /** 限制恢复点数量 */
    if (recoveryPoints.value.length > 20) {
      recoveryPoints.value.splice(20)
    }

    saveRecoveryPoints()
  }

  /**
   * 从恢复点恢复
   */
  function recoverFromPoint(pointId: string): OperationResult<CommandGroup> {
    const point = recoveryPoints.value.find(p => p.id === pointId)
    if (!point) {
      return { success: false, error: '恢复点不存在', code: 'RECOVERY_NOT_FOUND' }
    }

    try {
      activeGroup.value = JSON.parse(JSON.stringify(point.data))
      hasUnsavedChanges.value = true
      resetAllStatuses()

      return { success: true, data: activeGroup.value }
    } catch (e) {
      return { success: false, error: '恢复失败', code: 'RECOVERY_ERROR' }
    }
  }

  /**
   * 清除所有恢复点
   */
  function clearRecoveryPoints(): void {
    recoveryPoints.value = []
    saveRecoveryPoints()
  }

  // ==================== 自动保存配置 ====================

  /**
   * 更新自动保存配置
   */
  function updateAutoSaveConfig(config: Partial<AutoSaveConfig>): void {
    autoSaveConfig.value = { ...autoSaveConfig.value, ...config }
    saveAutoSaveConfig()
    initAutoSave()
  }

  // ==================== 执行引擎核心 ====================

  /**
   * 启动指令组顺序执行
   */
  async function executeGroup(sendFn: (data: string, isHex: boolean) => Promise<void>): Promise<void> {
    if (executionState.value === GrpState.Running) return
    const enabledCommands = activeGroup.value.commands.filter(c => c.enabled)
    if (enabledCommands.length === 0) return

    const isResuming = executionState.value === GrpState.Paused
    
    abortController = new AbortController()
    isStoppedByPolicy = false
    executionState.value = GrpState.Running
    
    if (isResuming) {
      resetAllStatuses(true)
    } else {
      completedCommandIds.clear()
      pausedAtIndex = -1
      resetAllStatuses(false)
    }

    const failedCommandIds = new Set<number>()
    const startIndex = isResuming ? pausedAtIndex + 1 : 0

    for (let i = startIndex; i < enabledCommands.length; i++) {
      if (abortController.signal.aborted || isStoppedByPolicy) break

      const cmd = enabledCommands[i]
      currentExecutingIndex.value = i

      if (completedCommandIds.has(cmd.id)) {
        continue
      }

      const shouldSkip = checkShouldSkip(cmd, failedCommandIds)
      if (shouldSkip) {
        commandStatusMap.value[cmd.id] = CmdStatus.Skipped
        addLogEntry({
          commandId: cmd.id,
          status: CmdStatus.Skipped,
          sentData: '',
          responseData: '(跳过)',
          message: '前序依赖指令失败或被跳过'
        })
        continue
      }

      commandStatusMap.value[cmd.id] = CmdStatus.Running
      const logEntry = startLogEntry(cmd)

      try {
        await executeWithTimeout(cmd, sendFn, abortController.signal)
        logEntry.status = CmdStatus.Success
        logEntry.endTime = Date.now()
        logEntry.duration = logEntry.endTime - logEntry.startTime
        finishLogEntry(logEntry)
        commandStatusMap.value[cmd.id] = CmdStatus.Success
        completedCommandIds.add(cmd.id)

        if (cmd.delay > 0 && !abortController.signal.aborted) {
          await waitWithAbort(cmd.delay, abortController.signal)
        }
      } catch (err: any) {
        handleExecutionError(err, cmd, logEntry, failedCommandIds)
        const shouldStop = applyFailurePolicy(failedCommandIds)
        if (shouldStop) break
      }
    }

    finalizeExecution()
  }

  /**
   * 根据依赖关系判断是否应跳过该指令
   */
  function checkShouldSkip(cmd: CommandItem, failedIds: Set<number>): boolean {
    if (cmd.dependencies.length === 0) return false
    return cmd.dependencies.some(depId => failedIds.has(depId))
  }

  /**
   * 带超时控制的单条指令执行
   */
  async function executeWithTimeout(
    cmd: CommandItem,
    sendFn: (data: string, isHex: boolean) => Promise<void>,
    signal: AbortSignal
  ): Promise<void> {
    const effectiveTimeout = cmd.timeout > 0 ? cmd.timeout : activeGroup.value.globalTimeout
    if (effectiveTimeout > 0) {
      await Promise.race([
        sendFn(cmd.content, cmd.isHex),
        waitWithAbort(effectiveTimeout, signal).then(() => {
          throw new Error(`TIMEOUT:${effectiveTimeout}`)
        })
      ])
    } else {
      await sendFn(cmd.content, cmd.isHex)
    }
  }

  /**
   * 处理指令执行错误
   */
  function handleExecutionError(
    err: any,
    cmd: CommandItem,
    logEntry: ExecutionLogEntry,
    failedIds: Set<number>
  ): void {
    const errMsg = err?.message ?? String(err)
    if (errMsg.startsWith('TIMEOUT:')) {
      logEntry.status = CmdStatus.Timeout
      logEntry.message = `执行超时 (${errMsg.split(':')[1]}ms)`
      commandStatusMap.value[cmd.id] = CmdStatus.Timeout
    } else if (errMsg === 'ABORTED') {
      logEntry.status = CmdStatus.Failed
      logEntry.message = '用户手动中断'
      commandStatusMap.value[cmd.id] = CmdStatus.Failed
    } else {
      logEntry.status = CmdStatus.Failed
      logEntry.message = errMsg || '发送失败'
      commandStatusMap.value[cmd.id] = CmdStatus.Failed
    }
    logEntry.endTime = Date.now()
    logEntry.duration = logEntry.endTime - logEntry.startTime
    finishLogEntry(logEntry)
    failedIds.add(cmd.id)
  }

  /**
   * 应用失败处理策略
   */
  function applyFailurePolicy(failedIds: Set<number>): boolean {
    const policy = activeGroup.value.onFailure
    switch (policy) {
      case FailPolicy.StopAll:
        isStoppedByPolicy = true
        return true
      case FailPolicy.SkipDependents:
        markDependentsSkipped(failedIds)
        return false
      case FailPolicy.SkipAndContinue:
      default:
        return false
    }
  }

  /**
   * 将所有依赖于失败指令的后继标记为跳过
   */
  function markDependentsSkipped(failedIds: Set<number>): void {
    for (const cmd of activeGroup.value.commands) {
      if (
        cmd.enabled &&
        !failedIds.has(cmd.id) &&
        commandStatusMap.value[cmd.id] === CmdStatus.Pending &&
        cmd.dependencies.some(depId => failedIds.has(depId))
      ) {
        commandStatusMap.value[cmd.id] = CmdStatus.Skipped
        addLogEntry({
          commandId: cmd.id,
          status: CmdStatus.Skipped,
          sentData: '',
          responseData: '(跳过)',
          message: `依赖指令(ID:${cmd.dependencies.join(',')})执行失败`
        })
      }
    }
  }

  /**
   * 结束执行
   */
  function finalizeExecution(): void {
    if (isStoppedByPolicy) {
      executionState.value = GrpState.Stopped
      currentExecutingIndex.value = -1
      completedCommandIds.clear()
      pausedAtIndex = -1
    } else if (abortController?.signal.aborted) {
      pausedAtIndex = currentExecutingIndex.value
      executionState.value = GrpState.Paused
    } else {
      executionState.value = GrpState.Completed
      currentExecutingIndex.value = -1
      completedCommandIds.clear()
      pausedAtIndex = -1
    }
    abortController = null
  }

  // ==================== 中断与恢复控制 ====================

  /**
   * 暂停指令组执行
   */
  function pauseExecution(): void {
    if (abortController && !abortController.signal.aborted) {
      pausedAtIndex = currentExecutingIndex.value
      abortController.abort()
    }
  }

  /**
   * 从当前暂停位置恢复执行
   */
  async function resumeExecution(sendFn: (data: string, isHex: boolean) => Promise<void>): Promise<void> {
    if (executionState.value !== GrpState.Paused) return
    await executeGroup(sendFn)
  }

  /**
   * 完全停止指令组执行
   */
  function stopExecution(): void {
    if (abortController && !abortController.signal.aborted) {
      abortController.abort()
    }
    completedCommandIds.clear()
    pausedAtIndex = -1
    executionState.value = GrpState.Stopped
    currentExecutingIndex.value = -1
  }

  /**
   * 清除执行日志
   */
  function clearLogs(): void {
    executionLogs.value = []
  }

  // ==================== 日志辅助方法 ====================

  function startLogEntry(cmd: CommandItem): ExecutionLogEntry {
    const entry: ExecutionLogEntry = {
      id: ++logIdCounter,
      commandId: cmd.id,
      status: CmdStatus.Running,
      sentData: cmd.content,
      responseData: '',
      startTime: Date.now(),
      endTime: 0,
      duration: 0
    }
    return entry
  }

  function finishLogEntry(entry: ExecutionLogEntry): void {
    executionLogs.value = [...executionLogs.value, entry]
  }

  function addLogEntry(partial: Omit<ExecutionLogEntry, 'id' | 'startTime' | 'endTime' | 'duration'>): void {
    const now = Date.now()
    executionLogs.value = [
      ...executionLogs.value,
      {
        id: ++logIdCounter,
        startTime: now,
        endTime: now,
        duration: 0,
        ...partial
      }
    ]
  }

  // ==================== 计算属性 ====================

  /** 统计各状态的指令数量 */
  const stats = computed(() => {
    let pending = 0, running = 0, success = 0, failed = 0, skipped = 0, timeout = 0
    for (const status of Object.values(commandStatusMap.value)) {
      switch (status) {
        case CmdStatus.Pending: pending++; break
        case CmdStatus.Running: running++; break
        case CmdStatus.Success: success++; break
        case CmdStatus.Failed: failed++; break
        case CmdStatus.Skipped: skipped++; break
        case CmdStatus.Timeout: timeout++; break
      }
    }
    return { total: activeGroup.value.commands.length, pending, running, success, failed, skipped, timeout }
  })

  /** 总进度百分比 */
  const progressPercent = computed(() => {
    const s = stats.value
    if (s.total === 0) return 0
    const finished = s.success + s.failed + s.skipped + s.timeout
    return Math.round((finished / s.total) * 100)
  })

  // ==================== 工具函数 ====================

  async function waitWithAbort(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms)
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new Error('ABORTED'))
      }, { once: true })
    })
  }

  function generateId(): string {
    return `grp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  }

  function loadGroupsFromStorage(): CommandGroup[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const groups = raw ? JSON.parse(raw) : []
      /** 兼容旧版本数据，添加version字段 */
      return groups.map((g: CommandGroup) => ({
        ...g,
        version: g.version || 1
      }))
    } catch {
      return []
    }
  }

  function saveGroupsToStorage(groups: CommandGroup[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
    } catch (e) {
      console.warn('指令组保存到localStorage失败', e)
      lastError.value = '存储空间不足，保存失败'
    }
  }

  function loadAllVersions(): Record<string, GroupVersion[]> {
    try {
      const raw = localStorage.getItem(VERSIONS_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }

  function saveAllVersions(versions: Record<string, GroupVersion[]>): void {
    try {
      localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions))
    } catch (e) {
      console.warn('版本历史保存失败', e)
    }
  }

  function loadGroupVersions(groupId: string): void {
    const allVersions = loadAllVersions()
    groupVersions.value = allVersions[groupId] || []
  }

  function loadAutoSaveConfig(): AutoSaveConfig {
    try {
      const raw = localStorage.getItem(AUTOSAVE_CONFIG_KEY)
      return raw ? { ...DEFAULT_AUTOSAVE_CONFIG, ...JSON.parse(raw) } : DEFAULT_AUTOSAVE_CONFIG
    } catch {
      return DEFAULT_AUTOSAVE_CONFIG
    }
  }

  function saveAutoSaveConfig(): void {
    try {
      localStorage.setItem(AUTOSAVE_CONFIG_KEY, JSON.stringify(autoSaveConfig.value))
    } catch {
      console.warn('自动保存配置保存失败')
    }
  }

  function loadRecoveryPoints(): void {
    try {
      const raw = localStorage.getItem(RECOVERY_KEY)
      recoveryPoints.value = raw ? JSON.parse(raw) : []
    } catch {
      recoveryPoints.value = []
    }
  }

  function saveRecoveryPoints(): void {
    try {
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(recoveryPoints.value))
    } catch {
      console.warn('恢复点保存失败')
    }
  }

  return {
    /** 状态 */
    activeGroup,
    savedGroups,
    groupVersions,
    executionState,
    currentExecutingIndex,
    commandStatusMap,
    executionLogs,
    stats,
    progressPercent,
    autoSaveConfig,
    hasUnsavedChanges,
    recoveryPoints,
    lastError,

    /** 创建与添加 */
    createEmptyGroup,
    createEmptyCommand,
    createNewGroup,
    isNameUnique,
    renameGroup,
    addCommand,
    addCommands,
    removeCommand,
    updateCommand,
    clearCommands,
    resetAllStatuses,

    /** 保存与加载 */
    saveCurrentGroup,
    isExistingGroup,
    saveAsGroup,
    performAutoSave,
    loadGroup,
    loadVersion,
    quickLoadGroup,
    incrementalLoadCommands,
    deleteSavedGroup,
    duplicateGroup,

    /** 导入导出 */
    exportGroupAsJson,
    importGroupFromJson,

    /** 恢复点 */
    createRecoveryPoint,
    recoverFromPoint,
    clearRecoveryPoints,

    /** 配置 */
    updateAutoSaveConfig,

    /** 执行控制 */
    executeGroup,
    pauseExecution,
    resumeExecution,
    stopExecution,
    clearLogs
  }
}
