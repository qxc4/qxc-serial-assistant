/**
 * 性能优化工具函数
 */

/** 缓存的快捷键解析结果 */
const shortcutCache = new Map<string, { ctrl: boolean; shift: boolean; alt: boolean; key: string }>()

/**
 * 解析快捷键字符串（带缓存）
 */
export function parseShortcutCached(shortcut: string): { ctrl: boolean; shift: boolean; alt: boolean; key: string } {
  const cached = shortcutCache.get(shortcut)
  if (cached) return cached
  
  const parts = shortcut.split('+').map(p => p.trim().toUpperCase())
  const result = {
    ctrl: parts.includes('CTRL'),
    shift: parts.includes('SHIFT'),
    alt: parts.includes('ALT'),
    key: parts.find(p => !['CTRL', 'SHIFT', 'ALT'].includes(p)) || ''
  }
  
  shortcutCache.set(shortcut, result)
  return result
}

/**
 * 快速检查按键是否匹配快捷键
 */
export function matchesShortcutFast(event: KeyboardEvent, parsed: { ctrl: boolean; shift: boolean; alt: boolean; key: string }): boolean {
  if (parsed.ctrl !== event.ctrlKey) return false
  if (parsed.shift !== event.shiftKey) return false
  if (parsed.alt !== event.altKey) return false
  
  const eventKey = event.key.toUpperCase()
  const targetKey = parsed.key
  
  if (targetKey === 'SPACE') return eventKey === ' ' || eventKey === 'SPACE'
  if (targetKey === 'ESCAPE') return eventKey === 'ESCAPE'
  if (targetKey === 'ENTER') return eventKey === 'ENTER'
  if (targetKey.length === 1) return eventKey === targetKey
  return eventKey === targetKey
}

/**
 * 预解析所有快捷键配置
 */
export function preparseShortcuts(shortcuts: Record<string, string>): Record<string, { ctrl: boolean; shift: boolean; alt: boolean; key: string }> {
  const result: Record<string, { ctrl: boolean; shift: boolean; alt: boolean; key: string }> = {}
  for (const key in shortcuts) {
    result[key] = parseShortcutCached(shortcuts[key])
  }
  return result
}

/** 节流函数 */
export function throttle<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let lastCall = 0
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  
  return ((...args: unknown[]) => {
    const now = Date.now()
    const remaining = delay - (now - lastCall)
    
    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      lastCall = now
      fn(...args)
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now()
        timeoutId = null
        fn(...args)
      }, remaining)
    }
  }) as T
}

/** 防抖函数 */
export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  
  return ((...args: unknown[]) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      timeoutId = null
      fn(...args)
    }, delay)
  }) as T
}

/** 使用 requestAnimationFrame 节流 */
export function rafThrottle<T extends (...args: any[]) => void>(fn: T): T {
  let rafId: number | null = null
  let lastArgs: unknown[] | null = null
  
  return ((...args: unknown[]) => {
    lastArgs = args
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (lastArgs) {
          fn(...lastArgs)
        }
      })
    }
  }) as T
}

/** 性能计时器 */
export class PerformanceTimer {
  private startTime = 0
  private name: string
  
  constructor(name: string) {
    this.name = name
    this.startTime = performance.now()
  }
  
  end(): number {
    const duration = performance.now() - this.startTime
    if (import.meta.env.DEV) {
      console.log(`[Perf] ${this.name}: ${duration.toFixed(2)}ms`)
    }
    return duration
  }
}

/** 测量函数执行时间 */
export function measurePerformance<T>(name: string, fn: () => T): T {
  const timer = new PerformanceTimer(name)
  const result = fn()
  timer.end()
  return result
}

/** 异步函数执行时间测量 */
export async function measurePerformanceAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const timer = new PerformanceTimer(name)
  const result = await fn()
  timer.end()
  return result
}

/** 批量处理函数（分片执行，避免阻塞主线程） */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => R,
  batchSize: number = 100
): Promise<R[]> {
  const results: R[] = []
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    for (const item of batch) {
      results.push(processor(item))
    }
    // 让出主线程
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  
  return results
}

/** 内存缓存 */
export class MemoryCache<K, V> {
  private cache = new Map<K, { value: V; expiry: number }>()
  private ttl: number
  
  constructor(ttl: number = 60000) {
    this.ttl = ttl
  }
  
  get(key: K): V | undefined {
    const item = this.cache.get(key)
    if (!item) return undefined
    if (Date.now() > item.expiry) {
      this.cache.delete(key)
      return undefined
    }
    return item.value
  }
  
  set(key: K, value: V): void {
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.ttl
    })
  }
  
  clear(): void {
    this.cache.clear()
  }
}
