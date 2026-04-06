import { ref, onMounted, onUnmounted } from 'vue'

/**
 * 性能指标接口
 */
export interface PerformanceMetrics {
  /** 按键响应时间 */
  keyResponseTime: number
  /** 渲染时间 */
  renderTime: number
  /** 内存使用量 */
  memoryUsage: number
  /** FPS */
  fps: number
  /** 数据处理时间 */
  dataProcessTime: number
}

/**
 * 性能监控配置
 */
export interface PerformanceConfig {
  /** 是否启用监控 */
  enabled: boolean
  /** 采样间隔 */
  sampleInterval: number
  /** 最大样本数 */
  maxSamples: number
}

/**
 * 性能监控 Composable
 */
export function usePerformanceMonitor(config: Partial<PerformanceConfig> = {}) {
  const defaultConfig: PerformanceConfig = {
    enabled: import.meta.env.DEV,
    sampleInterval: 1000,
    maxSamples: 60,
  }
  
  const finalConfig = { ...defaultConfig, ...config }
  
  /** 性能指标历史 */
  const metricsHistory = ref<PerformanceMetrics[]>([])
  
  /** 当前性能指标 */
  const currentMetrics = ref<PerformanceMetrics>({
    keyResponseTime: 0,
    renderTime: 0,
    memoryUsage: 0,
    fps: 0,
    dataProcessTime: 0,
  })
  
  /** FPS 计算相关 */
  let frameCount = 0
  let lastFpsTime = performance.now()
  let fpsFrameId: number | null = null
  
  /** 计算 FPS */
  function calculateFps() {
    frameCount++
    const now = performance.now()
    const delta = now - lastFpsTime
    
    if (delta >= 1000) {
      currentMetrics.value.fps = Math.round((frameCount * 1000) / delta)
      frameCount = 0
      lastFpsTime = now
    }
    
    if (finalConfig.enabled) {
      fpsFrameId = requestAnimationFrame(calculateFps)
    }
  }
  
  /** 获取内存使用量 */
  function getMemoryUsage(): number {
    if ('memory' in performance && (performance as any).memory) {
      const memory = (performance as any).memory
      return Math.round(memory.usedJSHeapSize / 1024 / 1024)
    }
    return 0
  }
  
  /** 采样性能指标 */
  function sampleMetrics() {
    const metrics: PerformanceMetrics = {
      ...currentMetrics.value,
      memoryUsage: getMemoryUsage(),
    }
    
    metricsHistory.value.push(metrics)
    
    if (metricsHistory.value.length > finalConfig.maxSamples) {
      metricsHistory.value.shift()
    }
  }
  
  /** 采样定时器 */
  let sampleTimer: ReturnType<typeof setInterval> | null = null
  
  onMounted(() => {
    if (finalConfig.enabled) {
      calculateFps()
      sampleTimer = setInterval(sampleMetrics, finalConfig.sampleInterval)
    }
  })
  
  onUnmounted(() => {
    if (fpsFrameId !== null) {
      cancelAnimationFrame(fpsFrameId)
    }
    if (sampleTimer !== null) {
      clearInterval(sampleTimer)
    }
  })
  
  return {
    currentMetrics,
    metricsHistory,
  }
}

/**
 * 按键响应时间测量器
 */
export class KeyResponseTimer {
  private startTime = 0
  private samples: number[] = []
  private maxSamples = 100
  
  /** 开始测量 */
  start(): void {
    this.startTime = performance.now()
  }
  
  /** 结束测量 */
  end(): number {
    const duration = performance.now() - this.startTime
    this.samples.push(duration)
    
    if (this.samples.length > this.maxSamples) {
      this.samples.shift()
    }
    
    return duration
  }
  
  /** 获取平均响应时间 */
  getAverage(): number {
    if (this.samples.length === 0) return 0
    const sum = this.samples.reduce((a, b) => a + b, 0)
    return sum / this.samples.length
  }
  
  /** 获取最大响应时间 */
  getMax(): number {
    if (this.samples.length === 0) return 0
    return Math.max(...this.samples)
  }
  
  /** 获取最小响应时间 */
  getMin(): number {
    if (this.samples.length === 0) return 0
    return Math.min(...this.samples)
  }
  
  /** 获取 P95 响应时间 */
  getP95(): number {
    if (this.samples.length === 0) return 0
    const sorted = [...this.samples].sort((a, b) => a - b)
    const index = Math.floor(sorted.length * 0.95)
    return sorted[index]
  }
  
  /** 清空样本 */
  clear(): void {
    this.samples = []
  }
}

/**
 * 全局按键响应时间测量器
 */
export const keyResponseTimer = new KeyResponseTimer()

/**
 * 测量异步函数执行时间
 */
export async function measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!import.meta.env.DEV) {
    return fn()
  }
  
  const start = performance.now()
  const result = await fn()
  const duration = performance.now() - start
  
  if (duration > 16) {
    console.warn(`[Performance] ${name} took ${duration.toFixed(2)}ms (over 16ms threshold)`)
  }
  
  return result
}

/**
 * 测量同步函数执行时间
 */
export function measureSync<T>(name: string, fn: () => T): T {
  if (!import.meta.env.DEV) {
    return fn()
  }
  
  const start = performance.now()
  const result = fn()
  const duration = performance.now() - start
  
  if (duration > 4) {
    console.warn(`[Performance] ${name} took ${duration.toFixed(2)}ms (over 4ms threshold)`)
  }
  
  return result
}
