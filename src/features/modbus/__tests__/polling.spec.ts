import { describe, expect, test } from 'vitest'
import {
  createModbusPollingTask,
  doesModbusResponseMatchTask,
  duplicateModbusPollingTask,
  filterModbusPollingResults,
  formatModbusPollingProgress,
  parseModbusPollingTasksImport,
  resetModbusPollingTaskStats,
  serializeModbusPollingTasks,
  summarizeModbusPollingTasks,
  normalizeModbusPollingSettings,
  shouldContinueModbusPolling,
  updateModbusPollingTaskAfterResult,
} from '../polling'

describe('modbus polling helpers', () => {
  test('normalizes interval and cycle limits', () => {
    expect(normalizeModbusPollingSettings({ intervalMs: 10, maxCycles: -1 })).toEqual({
      intervalMs: 100,
      maxCycles: 0,
      isUnlimited: true,
    })

    expect(normalizeModbusPollingSettings({ intervalMs: 120_000, maxCycles: 1_000_000 })).toEqual({
      intervalMs: 60_000,
      maxCycles: 999_999,
      isUnlimited: false,
    })
  })

  test('treats max cycles 0 as unlimited polling', () => {
    expect(shouldContinueModbusPolling(100, 0)).toBe(true)
    expect(formatModbusPollingProgress(3, 0)).toBe('3 / 无限')
  })

  test('stops when finite cycle count is reached', () => {
    expect(shouldContinueModbusPolling(2, 3)).toBe(true)
    expect(shouldContinueModbusPolling(3, 3)).toBe(false)
    expect(formatModbusPollingProgress(2, 3)).toBe('2 / 3')
  })

  test('creates normalized polling tasks from request drafts', () => {
    const task = createModbusPollingTask({
      address: 300,
      functionCode: 3,
      startAddress: -1,
      quantity: 200,
      writeValue: '',
      intervalMs: 10,
      timeoutMs: 10,
      retries: 99,
    }, 0, 1000)

    expect(task).toMatchObject({
      id: 'poll-1000-0',
      name: '任务 1',
      enabled: true,
      address: 247,
      startAddress: 0,
      quantity: 125,
      intervalMs: 100,
      timeoutMs: 50,
      retries: 10,
      failurePolicy: 'continue',
      status: 'idle',
    })
  })

  test('matches normal and exception responses by address and function code', () => {
    const task = createModbusPollingTask({
      address: 1,
      functionCode: 3,
      startAddress: 0,
      quantity: 1,
      writeValue: '',
    }, 0, 1000)

    expect(doesModbusResponseMatchTask(task, { address: 1, functionCode: 3 })).toBe(true)
    expect(doesModbusResponseMatchTask(task, { address: 1, functionCode: 0x83 })).toBe(true)
    expect(doesModbusResponseMatchTask(task, { address: 2, functionCode: 3 })).toBe(false)
  })

  test('updates and summarizes task statistics', () => {
    const task = createModbusPollingTask({
      address: 1,
      functionCode: 3,
      startAddress: 0,
      quantity: 1,
      writeValue: '',
    }, 0, 1000)

    const success = updateModbusPollingTaskAfterResult(task, 'success', 2000)
    const failed = updateModbusPollingTaskAfterResult(success, 'timeout', 2500, '响应超时')
    const summary = summarizeModbusPollingTasks([failed])

    expect(failed.sent).toBe(2)
    expect(failed.success).toBe(1)
    expect(failed.failed).toBe(1)
    expect(summary.sent).toBe(2)
    expect(summary.success).toBe(1)
    expect(summary.failed).toBe(1)
    expect(summary.lastError).toBe('响应超时')
  })

  test('serializes polling tasks with metadata', () => {
    const task = createModbusPollingTask({
      address: 1,
      functionCode: 3,
      startAddress: 0,
      quantity: 1,
      writeValue: '',
    }, 0, 1000)

    const parsed = JSON.parse(serializeModbusPollingTasks([task]))
    expect(parsed.version).toBe(1)
    expect(parsed.tasks).toHaveLength(1)
    expect(parsed.tasks[0].address).toBe(1)
  })

  test('imports exported polling tasks and resets runtime state', () => {
    const exportedTask = {
      ...createModbusPollingTask({
        name: '温度读取',
        address: 1,
        functionCode: 3,
        startAddress: 0,
        quantity: 2,
        writeValue: '',
        intervalMs: 500,
        timeoutMs: 1500,
        retries: 2,
        failurePolicy: 'stop',
      }, 0, 1000),
      sent: 20,
      success: 18,
      failed: 2,
      status: 'failed',
      lastError: 'old error',
      lastRunAt: 2000,
    }

    const result = parseModbusPollingTasksImport(JSON.stringify({
      version: 1,
      tasks: [exportedTask],
    }), 3000)

    expect(result.success).toBe(true)
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0]).toMatchObject({
      id: 'poll-3000-0',
      name: '温度读取',
      address: 1,
      functionCode: 3,
      startAddress: 0,
      quantity: 2,
      intervalMs: 500,
      timeoutMs: 1500,
      retries: 2,
      failurePolicy: 'stop',
      sent: 0,
      success: 0,
      failed: 0,
      status: 'idle',
      lastError: '',
      lastRunAt: null,
    })
  })

  test('rejects invalid polling task imports', () => {
    expect(parseModbusPollingTasksImport('not json').success).toBe(false)
    expect(parseModbusPollingTasksImport(JSON.stringify({ version: 1, tasks: [] })).success).toBe(false)
    expect(parseModbusPollingTasksImport(JSON.stringify({ version: 1, tasks: 'bad' })).success).toBe(false)
  })

  test('duplicates a polling task with a fresh id and reset runtime state', () => {
    const source = {
      ...createModbusPollingTask({
        name: '压力读取',
        address: 2,
        functionCode: 4,
        startAddress: 16,
        quantity: 2,
        writeValue: '',
        intervalMs: 500,
        timeoutMs: 1500,
        retries: 2,
        failurePolicy: 'stop',
      }, 0, 1000),
      sent: 8,
      success: 7,
      failed: 1,
      status: 'failed' as const,
      lastError: 'old error',
      lastRunAt: 2000,
    }

    const duplicated = duplicateModbusPollingTask(source, 3, 3000)

    expect(duplicated).toMatchObject({
      id: 'poll-3000-3',
      name: '压力读取 副本',
      address: 2,
      functionCode: 4,
      startAddress: 16,
      quantity: 2,
      intervalMs: 500,
      timeoutMs: 1500,
      retries: 2,
      failurePolicy: 'stop',
      sent: 0,
      success: 0,
      failed: 0,
      status: 'idle',
      lastError: '',
      lastRunAt: null,
    })
  })

  test('resets task statistics without changing scheduling fields', () => {
    const task = {
      ...createModbusPollingTask({
        name: '温度读取',
        address: 1,
        functionCode: 3,
        startAddress: 0,
        quantity: 2,
        writeValue: '',
        intervalMs: 700,
        timeoutMs: 1200,
      }, 0, 1000),
      sent: 3,
      success: 2,
      failed: 1,
      status: 'timeout' as const,
      lastError: '响应超时',
      lastRunAt: 1500,
    }

    expect(resetModbusPollingTaskStats(task)).toMatchObject({
      id: task.id,
      name: '温度读取',
      intervalMs: 700,
      timeoutMs: 1200,
      sent: 0,
      success: 0,
      failed: 0,
      status: 'idle',
      lastError: '',
      lastRunAt: null,
    })
  })

  test('filters polling results by task name status and query', () => {
    const results = [
      {
        id: 'a',
        taskId: 'task-a',
        taskName: '温度读取',
        timestamp: 1000,
        attempt: 1,
        status: 'success' as const,
        durationMs: 20,
        requestHex: '01 03 00 00',
        responseHex: '01 03 02 00 2A',
        error: '',
      },
      {
        id: 'b',
        taskId: 'task-b',
        taskName: '压力读取',
        timestamp: 1100,
        attempt: 2,
        status: 'timeout' as const,
        durationMs: 1000,
        requestHex: '02 04 00 10',
        responseHex: '',
        error: '响应超时',
      },
    ]

    expect(filterModbusPollingResults(results, { taskName: '温度', status: 'all', query: '' })).toHaveLength(1)
    expect(filterModbusPollingResults(results, { status: 'timeout', query: '超时' })).toEqual([results[1]])
    expect(filterModbusPollingResults(results, { status: 'success', query: '00 2a' })).toEqual([results[0]])
  })
})
