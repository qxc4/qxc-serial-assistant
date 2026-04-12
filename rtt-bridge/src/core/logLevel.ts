import type { RttDataPayload } from '../core/adapter.js'

/** 日志级别正则匹配模式（按优先级排序） */
const LOG_LEVEL_PATTERNS: Array<{ pattern: RegExp; level: RttDataPayload['level'] }> = [
  { pattern: /\bERROR\b|\bFATAL\b|\bCRITICAL\b/i, level: 'error' },
  { pattern: /\bWARN\b|\bWARNING\b/i, level: 'warn' },
  { pattern: /\bDEBUG\b|\bDBG\b/i, level: 'debug' },
  { pattern: /\bTRACE\b/i, level: 'trace' },
]

/**
 * 从日志文本中推断日志级别
 * @param text 日志文本
 * @returns 推断的日志级别
 */
export function inferLogLevel(text: string): RttDataPayload['level'] {
  for (const { pattern, level } of LOG_LEVEL_PATTERNS) {
    if (pattern.test(text)) return level
  }
  return 'info'
}
