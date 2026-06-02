import { describe, expect, test } from 'vitest'
import {
  baudRatePresets,
  createDefaultQuickCommands,
  previewLineEndingValue,
  resolveLineEndingValue,
} from '../serialOptions'

describe('serialOptions', () => {
  test('keeps common and high speed baud rate presets', () => {
    expect(baudRatePresets).toContain(9600)
    expect(baudRatePresets).toContain(115200)
    expect(baudRatePresets).toContain(3000000)
  })

  test('keeps default quick commands compatible with SerialView', () => {
    const commands = createDefaultQuickCommands()
    expect(commands).toHaveLength(4)
    expect(commands[0]).toMatchObject({ content: 'AT+RST', enabled: true, isHex: false })
    expect(commands[3]).toMatchObject({ content: '01 02 03 04', enabled: false, isHex: true })
  })

  test('resolves built-in line endings', () => {
    expect(resolveLineEndingValue({ enabled: true, type: 'rn', customValue: '' })).toBe('\r\n')
    expect(resolveLineEndingValue({ enabled: true, type: 'r', customValue: '' })).toBe('\r')
    expect(resolveLineEndingValue({ enabled: true, type: 'n', customValue: '' })).toBe('\n')
    expect(resolveLineEndingValue({ enabled: false, type: 'rn', customValue: '' })).toBe('')
  })

  test('resolves custom hex line endings like the previous inline implementation', () => {
    expect(resolveLineEndingValue({ enabled: true, type: 'custom', customValue: '0D 0A' })).toBe('\r\n')
    expect(previewLineEndingValue('\r\n')).toBe('\\r\\n')
  })
})

