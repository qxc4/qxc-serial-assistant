import { describe, expect, test } from 'vitest'
import { DEFAULT_LOCALE, locales } from '..'

function translate(locale: keyof typeof locales, key: string, params?: Record<string, string>): string {
  const value = key.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment]
    }
    return undefined
  }, locales[locale])

  if (typeof value !== 'string') return key
  return params ? value.replace(/\{(\w+)\}/g, (_, p) => params[p] || `{${p}}`) : value
}

describe('locales', () => {
  test('keeps default locale and core navigation labels', () => {
    expect(DEFAULT_LOCALE).toBe('zh-CN')
    expect(translate('zh-CN', 'nav.serial')).toBe('串口调试')
    expect(translate('en-US', 'nav.serial')).toBe('Serial')
  })

  test('keeps command palette labels in both locales', () => {
    expect(translate('zh-CN', 'shell.openCommandPalette')).toBe('打开命令面板')
    expect(translate('en-US', 'shell.openCommandPalette')).toBe('Open command palette')
  })

  test('keeps interpolation behavior compatible with useI18n', () => {
    expect(translate('zh-CN', 'chart.queryResult', { count: '3' })).toContain('3')
  })
})
