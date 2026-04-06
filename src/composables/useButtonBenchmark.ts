/**
 * 按钮性能基准测试工具
 * 用于测量和验证按钮响应时间是否达到目标（<100ms）
 */

import { globalButtonPerformanceCollector } from './useButtonOptimizer'

/** 性能基准配置 */
interface PerformanceBenchmark {
  /** 动作名称 */
  action: string
  /** 目标响应时间（毫秒） */
  targetMs: number
  /** 最大可接受响应时间（毫秒） */
  maxAcceptableMs: number
}

/** 预定义的性能基准 */
const BENCHMARKS: PerformanceBenchmark[] = [
  { action: 'toggleConnect', targetMs: 50, maxAcceptableMs: 100 },
  { action: 'handleSend', targetMs: 30, maxAcceptableMs: 80 },
  { action: 'addCommand', targetMs: 20, maxAcceptableMs: 50 },
  { action: 'deleteCommand', targetMs: 20, maxAcceptableMs: 50 },
  { action: 'toggleLoopSend', targetMs: 30, maxAcceptableMs: 60 },
  { action: 'chartTypeChange', targetMs: 100, maxAcceptableMs: 200 },
  { action: 'toggleCollection', targetMs: 50, maxAcceptableMs: 100 },
  { action: 'clearData', targetMs: 30, maxAcceptableMs: 80 },
  { action: 'startPlayback', targetMs: 50, maxAcceptableMs: 100 },
  { action: 'export', targetMs: 100, maxAcceptableMs: 200 },
]

/** 性能测试结果接口 */
interface BenchmarkResult {
  action: string
  targetMs: number
  maxAcceptableMs: number
  averageMs: number
  p95Ms: number
  p99Ms: number
  sampleCount: number
  passed: boolean
  grade: 'A' | 'B' | 'C' | 'F'
}

/**
 * 性能基准测试类
 */
export class ButtonPerformanceBenchmark {
  private benchmarks: PerformanceBenchmark[]
  
  constructor(customBenchmarks?: PerformanceBenchmark[]) {
    this.benchmarks = customBenchmarks || BENCHMARKS
  }
  
  /**
   * 运行所有基准测试
   * @returns 测试结果数组
   */
  runAll(): BenchmarkResult[] {
    return this.benchmarks.map(benchmark => this.runSingle(benchmark))
  }
  
  /**
   * 运行单个基准测试
   * @param benchmark 基准配置
   * @returns 测试结果
   */
  runSingle(benchmark: PerformanceBenchmark): BenchmarkResult {
    const report = globalButtonPerformanceCollector.getReport()
    const data = report[benchmark.action]
    
    if (!data || data.count === 0) {
      return {
        ...benchmark,
        averageMs: 0,
        p95Ms: 0,
        p99Ms: 0,
        sampleCount: 0,
        passed: false,
        grade: 'F'
      }
    }
    
    const avg = data.avg
    const p95 = data.p95
    
    // 计算 P99（近似值）
    const p99 = p95 * 1.2 // 简化计算
    
    // 判断是否通过
    const passed = avg <= benchmark.targetMs && p95 <= benchmark.maxAcceptableMs
    
    // 评级
    let grade: 'A' | 'B' | 'C' | 'F'
    if (avg <= benchmark.targetMs * 0.5) {
      grade = 'A' // 优秀：平均响应时间小于目标的一半
    } else if (avg <= benchmark.targetMs) {
      grade = 'B' // 良好：平均响应时间在目标范围内
    } else if (avg <= benchmark.maxAcceptableMs) {
      grade = 'C' // 及格：平均响应时间在可接受范围内
    } else {
      grade = 'F' // 不及格：超过最大可接受时间
    }
    
    return {
      action: benchmark.action,
      targetMs: benchmark.targetMs,
      maxAcceptableMs: benchmark.maxAcceptableMs,
      averageMs: Math.round(avg),
      p95Ms: Math.round(p95),
      p99Ms: Math.round(p99),
      sampleCount: data.count,
      passed,
      grade
    }
  }
  
  /**
   * 获取整体性能评分
   * @returns 0-100 的分数
   */
  getOverallScore(): number {
    const results = this.runAll()
    
    if (results.length === 0) return 0
    
    let totalScore = 0
    for (const result of results) {
      switch (result.grade) {
        case 'A':
          totalScore += 100
          break
        case 'B':
          totalScore += 80
          break
        case 'C':
          totalScore += 60
          break
        case 'F':
          totalScore += 0
          break
      }
    }
    
    return Math.round(totalScore / results.length)
  }
  
  /**
   * 生成性能报告
   * @returns 格式化的报告字符串
   */
  generateReport(): string {
    const results = this.runAll()
    const overallScore = this.getOverallScore()
    
    let report = `
╔══════════════════════════════════════════════════════════════╗
║           按钮性能基准测试报告                              ║
╠══════════════════════════════════════════════════════════════╣
║  整体评分: ${overallScore}/100 ${this.getScoreEmoji(overallScore)}                       ║
║  测试时间: ${new Date().toLocaleString()}                    ║
╠═══════════════╦═════════╦═════════╦═════════╦═══════════════╣
║  动作         ║ 目标(ms) ║ 平均(ms) ║ P95(ms) ║ 等级/状态     ║
╠═══════════════╬═════════╬═════════╬═════════╬═══════════════╣`
    
    for (const result of results) {
      const statusEmoji = result.passed ? '✅' : '❌'
      const gradeEmoji = this.getGradeEmoji(result.grade)
      
      report += `
║  ${result.action.padEnd(13)}║ ${String(result.targetMs).padStart(7)} ║ ${String(result.averageMs).padStart(7)} ║ ${String(result.p95Ms).padStart(7)} ║ ${gradeEmoji}${result.grade} ${statusEmoji}     ║`
    }
    
    report += `
╚═══════════════╩═════════╩═════════╩═════════╩═══════════════╝

${this.getRecommendations(results)}
`
    
    return report
  }
  
  /**
   * 获取优化建议
   */
  private getRecommendations(results: BenchmarkResult[]): string {
    const failures = results.filter(r => !r.passed)
    
    if (failures.length === 0) {
      return '🎉 所有按钮响应时间均达到性能目标！'
    }
    
    let recommendations = '\n⚠️ 优化建议:\n\n'
    
    for (const failure of failures) {
      recommendations += `• ${failure.action}: 当前平均 ${failure.averageMs}ms (目标 <${failure.targetMs}ms)\n`
      
      if (failure.averageMs > failure.maxAcceptableMs * 2) {
        recommendations += '  → 建议检查是否有阻塞主线程的操作\n'
        recommendations += '  → 考虑使用 Web Worker 处理耗时任务\n'
      } else if (failure.averageMs > failure.targetMs * 1.5) {
        recommendations += '  → 建议添加防抖或节流处理\n'
        recommendations += '  → 检查是否可以减少 DOM 操作\n'
      } else {
        recommendations += '  → 微调现有优化参数可能即可达标\n'
      }
    }
    
    return recommendations
  }
  
  /**
   * 获取评分表情符号
   */
  private getScoreEmoji(score: number): string {
    if (score >= 90) return '🏆'
    if (score >= 80) return '✨'
    if (score >= 70) return '👍'
    if (score >= 60) return '😐'
    return '⚠️'
  }
  
  /**
   * 获取等级表情符号
   */
  private getGradeEmoji(grade: string): string {
    switch (grade) {
      case 'A': return '🟢'
      case 'B': return '🔵'
      case 'C': return '🟡'
      case 'F': return '🔴'
      default: return '⚪'
    }
  }
  
  /**
   * 导出为 JSON 格式
   */
  exportJSON(): string {
    const results = this.runAll()
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      overallScore: this.getOverallScore(),
      benchmarks: results
    }, null, 2)
  }
  
  /**
   * 控制台输出详细报告
   */
  logToConsole(): void {
    console.log('%c📊 按钮性能基准测试报告', 'font-size: 16px; font-weight: bold;')
    console.log(this.generateReport())
    console.log('%c详细数据:', 'font-size: 14px; font-weight: bold;')
    console.table(this.runAll())
  }
}

/** 全局基准测试实例 */
export const buttonBenchmark = new ButtonPerformanceBenchmark()

/**
 * 快速检查按钮性能
 * 在开发模式下自动运行
 */
export function checkButtonPerformance(): void {
  if (!import.meta.env.DEV) return
  
  // 延迟执行以确保有足够的数据样本
  setTimeout(() => {
    buttonBenchmark.logToConsole()
  }, 5000)
}
