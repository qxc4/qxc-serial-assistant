/**
 * 按钮性能优化 Composable
 * 提供统一的按钮点击优化策略，目标响应时间 <100ms
 */

import { ref, onUnmounted } from 'vue'
import { keyResponseTimer } from './usePerformanceMonitor'

/** 按钮状态接口 */
export interface ButtonState {
  /** 是否正在处理中 */
  isProcessing: boolean
  /** 上次点击时间戳 */
  lastClickTime: number
  /** 点击计数 */
  clickCount: number
}

/** 按钮配置选项 */
interface ButtonOptions {
  /** 防抖间隔（毫秒），默认 0（不防抖） */
  debounceMs?: number
  /** 节流间隔（毫秒），默认 0（不节流） */
  throttleMs?: number
  /** 是否显示加载状态 */
  showLoading?: boolean
  /** 最小响应时间（用于显示加载状态的最短时间） */
  minProcessTime?: number
}

/**
 * 创建优化的按钮处理器
 * @param handler 实际的处理函数
 * @param options 配置选项
 * @returns 优化的点击处理函数和状态
 */
export function useOptimizedButton<T extends (...args: any[]) => Promise<any> | any>(
  handler: T,
  options: ButtonOptions = {}
) {
  const {
    debounceMs = 0,
    throttleMs = 0,
    minProcessTime = 0
  } = options

  /** 按钮状态 */
  const buttonState = ref<ButtonState>({
    isProcessing: false,
    lastClickTime: 0,
    clickCount: 0
  })

  /** 节流上次执行时间 */
  let lastExecuteTime = 0

  /** 防抖定时器 */
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  /** 清理函数 */
  function cleanup() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  /**
   * 优化的点击处理函数
   */
  async function optimizedHandler(...args: Parameters<T>): Promise<void> {
    const now = Date.now()
    
    // 节流检查
    if (throttleMs > 0 && now - lastExecuteTime < throttleMs) {
      return
    }

    // 防抖检查
    if (debounceMs > 0) {
      if (debounceTimer) {
        return
      }
      
      return new Promise<void>((resolve) => {
        debounceTimer = setTimeout(async () => {
          debounceTimer = null
          await executeHandler(...args)
          resolve()
        }, debounceMs)
      })
    }

    await executeHandler(...args)
  }

  /**
   * 执行实际的处理逻辑
   */
  async function executeHandler(...args: Parameters<T>): Promise<void> {
    // 开始计时
    keyResponseTimer.start()
    const startTime = performance.now()

    try {
      // 更新状态
      buttonState.value.isProcessing = true
      buttonState.value.lastClickTime = startTime
      buttonState.value.clickCount++

      // 执行处理函数
      const result = handler(...args)
      
      // 如果是异步函数，等待完成
      if (result instanceof Promise) {
        await result
      }

      // 记录响应时间（用于性能监控）
      keyResponseTimer.end()
      
      // 如果设置了最小处理时间且实际时间不足，则延迟
      if (minProcessTime > 0) {
        const elapsed = performance.now() - startTime
        if (elapsed < minProcessTime) {
          await new Promise(resolve => 
            setTimeout(resolve, minProcessTime - elapsed)
          )
        }
      }

    } catch (error) {
      console.error('[ButtonOptimization] Handler error:', error)
      keyResponseTimer.end()
    } finally {
      // 更新状态
      buttonState.value.isProcessing = false
      lastExecuteTime = Date.now()
    }
  }

  // 组件卸载时清理
  onUnmounted(cleanup)

  return {
    handleClick: optimizedHandler,
    buttonState,
    cleanup
  }
}

/**
 * 创建即时反馈的按钮处理器
 * 在用户点击后立即提供视觉反馈，然后执行实际操作
 */
export function useInstantFeedbackButton<T extends (...args: any[]) => Promise<any> | any>(
  handler: T,
  options: ButtonOptions & {
    /** 反馈持续时间（毫秒） */
    feedbackDuration?: number
  } = {}
) {
  const { feedbackDuration = 150, ...buttonOptions } = options
  
  const { handleClick, buttonState, cleanup } = useOptimizedButton(handler, buttonOptions)

  /** 是否显示反馈效果 */
  const showFeedback = ref(false)

  /**
   * 带即时反馈的点击处理
   */
  async function handleWithFeedback(...args: Parameters<T>) {
    // 立即显示反馈
    showFeedback.value = true
    
    // 执行处理
    await handleClick(...args)
    
    // 延迟隐藏反馈
    setTimeout(() => {
      showFeedback.value = false
    }, feedbackDuration)
  }

  return {
    handleClick: handleWithFeedback,
    buttonState,
    showFeedback,
    cleanup
  }
}

/**
 * 批量操作优化工具
 * 将多个连续的 DOM 操作合并为一次更新
 */
export class BatchDOMUpdater {
  private pendingUpdates: Array<() => void> = []
  private rafId: number | null = null
  
  /**
   * 添加待执行的 DOM 更新
   */
  schedule(update: () => void): void {
    this.pendingUpdates.push(update)
    
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.flush()
      })
    }
  }
  
  /**
   * 立即执行所有待处理的更新
   */
  flush(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    
    const updates = this.pendingUpdates.splice(0)
    updates.forEach(update => update())
  }
  
  /**
   * 清理
   */
  dispose(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.pendingUpdates = []
  }
}

/**
 * 性能指标收集器
 * 用于收集和分析按钮响应时间数据
 */
export class ButtonPerformanceCollector {
  private metrics: Array<{
    action: string
    duration: number
    timestamp: number
  }> = []
  
  private maxSamples: number
  
  constructor(maxSamples: number = 1000) {
    this.maxSamples = maxSamples
  }
  
  /**
   * 记录一次按钮点击的性能指标
   */
  record(action: string, duration: number): void {
    this.metrics.push({
      action,
      duration,
      timestamp: Date.now()
    })
    
    // 保持样本数量在限制内
    if (this.metrics.length > this.maxSamples) {
      this.metrics.shift()
    }
  }
  
  /**
   * 获取指定动作的平均响应时间
   */
  getAverage(action?: string): number {
    const filtered = action 
      ? this.metrics.filter(m => m.action === action)
      : this.metrics
    
    if (filtered.length === 0) return 0
    
    const sum = filtered.reduce((acc, m) => acc + m.duration, 0)
    return sum / filtered.length
  }
  
  /**
   * 获取 P95 响应时间
   */
  getP95(action?: string): number {
    const filtered = action 
      ? this.metrics.filter(m => m.action === action)
      : this.metrics
    
    if (filtered.length === 0) return 0
    
    const sorted = [...filtered].sort((a, b) => a.duration - b.duration)
    const index = Math.floor(sorted.length * 0.95)
    return sorted[index].duration
  }
  
  /**
   * 获取统计报告
   */
  getReport(): Record<string, { avg: number; p95: number; count: number }> {
    const actions = new Set(this.metrics.map(m => m.action))
    const report: Record<string, { avg: number; p95: number; count: number }> = {}
    
    for (const action of actions) {
      const filtered = this.metrics.filter(m => m.action === action)
      report[action] = {
        avg: this.getAverage(action),
        p95: this.getP95(action),
        count: filtered.length
      }
    }
    
    return report
  }
  
  /**
   * 清空所有指标
   */
  clear(): void {
    this.metrics = []
  }
}

/** 全局性能收集器实例 */
export const globalButtonPerformanceCollector = new ButtonPerformanceCollector()

/**
 * 创建带性能监控的按钮处理器
 * 自动记录每次点击的响应时间
 */
export function useMonitoredButton<T extends (...args: any[]) => Promise<any> | any>(
  actionName: string,
  handler: T,
  options?: ButtonOptions
) {
  const monitoredHandler = ((...args: Parameters<T>) => {
    const start = performance.now()
    const result = handler(...args)
    
    if (result instanceof Promise) {
      return result.then((res) => {
        globalButtonPerformanceCollector.record(actionName, performance.now() - start)
        return res
      }).catch((error) => {
        globalButtonPerformanceCollector.record(actionName, performance.now() - start)
        throw error
      })
    } else {
      globalButtonPerformanceCollector.record(actionName, performance.now() - start)
      return result
    }
  }) as T
  
  return useOptimizedButton(monitoredHandler, options)
}
