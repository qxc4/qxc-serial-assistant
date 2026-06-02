import type { Component } from 'vue'

export interface LineEndingOption {
  value: 'none' | 'rn' | 'r' | 'n' | 'custom'
  label: string
  preview: string
}

export interface QuickCommand {
  id: number
  content: string
  description: string
  isHex: boolean
  enabled: boolean
  delay: number
}

export interface CommandStatusInfo {
  icon: Component
  color: string
  labelKey: string
}

export const baudRatePresets = [
  300, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 38400, 57600, 76800,
  115200, 230400, 256000, 460800, 500000, 576000, 921600, 1000000,
  1152000, 1500000, 2000000, 2500000, 3000000,
]

export function createDefaultQuickCommands(): QuickCommand[] {
  return [
    { id: 1, enabled: true, content: 'AT+RST', description: '重启模块', isHex: false, delay: 1000 },
    { id: 2, enabled: true, content: 'AT+GMR', description: '查询版本信息', isHex: false, delay: 1000 },
    { id: 3, enabled: true, content: 'AT+CWLAP', description: '扫描WIFI热点', isHex: false, delay: 1000 },
    { id: 4, enabled: false, content: '01 02 03 04', description: 'HEX测试数据', isHex: true, delay: 1000 },
  ]
}

export function createLineEndingOptions(t: (key: string) => string): LineEndingOption[] {
  return [
    { value: 'none', label: t('serial.lineEndingNone'), preview: '' },
    { value: 'rn', label: '\\r\\n (CRLF)', preview: '\\r\\n' },
    { value: 'r', label: '\\r (CR)', preview: '\\r' },
    { value: 'n', label: '\\n (LF)', preview: '\\n' },
    { value: 'custom', label: t('serial.lineEndingCustom'), preview: '' },
  ]
}

export function resolveLineEndingValue(config: {
  enabled: boolean
  type: LineEndingOption['value']
  customValue: string
}): string {
  if (!config.enabled) return ''

  switch (config.type) {
    case 'rn':
      return '\r\n'
    case 'r':
      return '\r'
    case 'n':
      return '\n'
    case 'custom':
      if (!config.customValue.trim()) return ''
      return (config.customValue.replace(/\s/g, '').match(/.{1,2}/g) ?? [])
        .reduce((result, byte) => {
          const value = parseInt(byte, 16)
          return Number.isNaN(value) ? result : result + String.fromCharCode(value)
        }, '')
    case 'none':
    default:
      return ''
  }
}

export function previewLineEndingValue(value: string): string {
  return value
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
}
