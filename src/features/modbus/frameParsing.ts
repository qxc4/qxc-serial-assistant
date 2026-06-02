import { ModbusAsciiParser, ModbusRtuParser } from '../../utils/modbus'
import type { ModbusMode, ModbusParseResult } from '../../types/modbus'

export function bytesToHexInput(bytes: number[] | Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ')
}

export function parseCompleteModbusFrame(
  data: number[] | Uint8Array,
  mode: ModbusMode,
  baudRate = 9600,
): ModbusParseResult | null {
  const bytes = Array.from(data)

  if (mode === 'rtu') {
    const parser = new ModbusRtuParser(baudRate)
    parser.addData(bytes)
    return parser.tryParse()
  }

  const parser = new ModbusAsciiParser()
  return parser.addData(new TextDecoder().decode(new Uint8Array(bytes)))
}

