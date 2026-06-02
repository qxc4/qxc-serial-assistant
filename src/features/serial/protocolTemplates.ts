import type { QuickCommand } from './serialOptions'

export type ProtocolTemplateCategory = 'at' | 'modbus' | 'nmea' | 'bootloader' | 'custom'

export interface ProtocolTemplate {
  id: string
  name: string
  category: ProtocolTemplateCategory
  description: string
  parseHint: string
  quickCommands: Array<Omit<QuickCommand, 'id'>>
}

export interface ProtocolTemplateApplyResult {
  templateId: string
  addedCommands: QuickCommand[]
  parseHint: string
}

export const PROTOCOL_TEMPLATES: ProtocolTemplate[] = [
  {
    id: 'at-basic',
    name: 'AT 基础模块',
    category: 'at',
    description: '适用于 ESP/蓝牙/GPRS 等 AT 指令设备。',
    parseHint: '建议启用 CRLF 行尾，接收编码使用 UTF-8 或 ASCII。',
    quickCommands: [
      { enabled: true, content: 'AT', description: '握手', isHex: false, delay: 300 },
      { enabled: true, content: 'AT+GMR', description: '查询版本', isHex: false, delay: 500 },
      { enabled: true, content: 'AT+RST', description: '复位模块', isHex: false, delay: 1000 },
    ],
  },
  {
    id: 'modbus-rtu-holding',
    name: 'Modbus RTU 保持寄存器',
    category: 'modbus',
    description: '读取 1 号从站保持寄存器 0x0000 起 2 个寄存器。',
    parseHint: '建议切换到 Modbus 页做请求-响应流水线；串口页可启用 Modbus RTU 解析。',
    quickCommands: [
      { enabled: true, content: '01 03 00 00 00 02 C4 0B', description: '读保持寄存器 0x0000 x2', isHex: true, delay: 1000 },
      { enabled: true, content: '01 06 00 00 00 01 48 0A', description: '写单寄存器 0x0000=1', isHex: true, delay: 1000 },
    ],
  },
  {
    id: 'nmea-basic',
    name: 'NMEA GPS',
    category: 'nmea',
    description: 'GPS/NMEA 文本流观察模板。',
    parseHint: '建议启用换行显示，搜索 $GPRMC/$GPGGA/$GNGGA。',
    quickCommands: [
      { enabled: false, content: '$PMTK605*31', description: '查询固件版本示例', isHex: false, delay: 1000 },
      { enabled: false, content: '$PMTK314,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0*28', description: '示例输出配置', isHex: false, delay: 1000 },
    ],
  },
  {
    id: 'stm32-bootloader-basic',
    name: 'STM32 Bootloader',
    category: 'bootloader',
    description: 'STM32 ROM bootloader UART 基础握手命令。',
    parseHint: '使用前确认 BOOT0/复位进入 ROM bootloader，HEX 发送，常见 ACK 为 0x79。',
    quickCommands: [
      { enabled: true, content: '7F', description: '同步握手', isHex: true, delay: 300 },
      { enabled: true, content: '00 FF', description: 'Get 命令', isHex: true, delay: 500 },
      { enabled: true, content: '02 FD', description: 'Get ID 命令', isHex: true, delay: 500 },
    ],
  },
  {
    id: 'custom-frame-aa55',
    name: '自定义 AA55 帧',
    category: 'custom',
    description: 'AA 55 帧头、长度字段、简单 payload 的自定义协议模板。',
    parseHint: '可在左侧数据解析配置中选择自定义帧，帧头填 AA 55，长度偏移 2。',
    quickCommands: [
      { enabled: true, content: 'AA 55 02 01 02', description: '自定义帧示例', isHex: true, delay: 1000 },
      { enabled: false, content: 'AA 55 01 00', description: '空操作示例', isHex: true, delay: 1000 },
    ],
  },
]

export function getProtocolTemplate(id: string): ProtocolTemplate | null {
  return PROTOCOL_TEMPLATES.find(template => template.id === id) ?? null
}

export function applyProtocolTemplate(template: ProtocolTemplate, nextId: () => number): ProtocolTemplateApplyResult {
  return {
    templateId: template.id,
    addedCommands: template.quickCommands.map(command => ({
      ...command,
      id: nextId(),
    })),
    parseHint: template.parseHint,
  }
}
