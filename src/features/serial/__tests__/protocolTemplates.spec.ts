import { describe, expect, test } from 'vitest'
import { applyProtocolTemplate, getProtocolTemplate, PROTOCOL_TEMPLATES } from '../protocolTemplates'

describe('protocolTemplates', () => {
  test('includes required first-version protocol families', () => {
    expect(PROTOCOL_TEMPLATES.map(template => template.category)).toEqual([
      'at',
      'modbus',
      'nmea',
      'bootloader',
      'custom',
    ])
  })

  test('finds templates by id', () => {
    expect(getProtocolTemplate('at-basic')?.name).toBe('AT 基础模块')
    expect(getProtocolTemplate('missing')).toBeNull()
  })

  test('applies templates into quick commands with generated ids', () => {
    const template = getProtocolTemplate('stm32-bootloader-basic')
    let id = 10
    const result = applyProtocolTemplate(template!, () => id++)

    expect(result.templateId).toBe('stm32-bootloader-basic')
    expect(result.addedCommands.map(command => command.id)).toEqual([10, 11, 12])
    expect(result.addedCommands.every(command => command.isHex)).toBe(true)
    expect(result.parseHint).toContain('ACK')
  })
})
