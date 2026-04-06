/**
 * Modbus 协议解析引擎
 * 支持 Modbus RTU 和 Modbus ASCII 模式
 */

import { crc16, crc16Bytes, lrc, hexToBytes, bytesToHex } from './checksum'
import type { ModbusMode, ModbusParseResult, ModbusFunctionCode } from '../types/modbus'

/**
 * Modbus RTU 帧解析器
 */
export class ModbusRtuParser {
  private buffer: number[] = []
  private lastReceiveTime: number = 0
  private t3_5Timeout: number

  /**
   * @param baudRate 波特率，用于计算帧间隔时间
   */
  constructor(baudRate: number = 9600) {
    this.t3_5Timeout = this.calculateT3_5(baudRate)
  }

  /**
   * 计算 3.5 字符时间 (毫秒)
   */
  private calculateT3_5(baudRate: number): number {
    if (baudRate <= 19200) {
      const charTime = (11 * 1000) / baudRate
      return Math.max(1.75, charTime * 3.5)
    }
    return 1.75
  }

  /**
   * 更新波特率
   */
  setBaudRate(baudRate: number): void {
    this.t3_5Timeout = this.calculateT3_5(baudRate)
  }

  /**
   * 添加接收数据
   */
  addData(data: number[]): ModbusParseResult | null {
    const now = Date.now()
    
    if (now - this.lastReceiveTime > this.t3_5Timeout && this.buffer.length > 0) {
      const result = this.parseFrame()
      this.buffer = [...data]
      this.lastReceiveTime = now
      return result
    }
    
    this.buffer.push(...data)
    this.lastReceiveTime = now
    
    return null
  }

  /**
   * 尝试解析当前缓冲区中的帧
   */
  tryParse(): ModbusParseResult | null {
    if (this.buffer.length < 4) return null
    return this.parseFrame()
  }

  /**
   * 清空缓冲区
   */
  clear(): void {
    this.buffer = []
  }

  /**
   * 解析帧
   */
  private parseFrame(): ModbusParseResult {
    const rawBytes = [...this.buffer]
    
    if (rawBytes.length < 4) {
      return {
        success: false,
        mode: 'rtu',
        error: '帧长度不足（最少4字节）',
        rawBytes
      }
    }

    const address = rawBytes[0]
    const functionCode = rawBytes[1]
    
    // 根据功能码计算预期帧长度
    const expectedLength = this.getExpectedFrameLength(rawBytes)
    
    if (expectedLength !== null && rawBytes.length < expectedLength) {
      return {
        success: false,
        mode: 'rtu',
        error: `帧长度不足，期望 ${expectedLength} 字节，实际 ${rawBytes.length} 字节`,
        rawBytes
      }
    }

    const data = rawBytes.slice(2, -2)
    const checksumBytes = rawBytes.slice(-2)
    const receivedCrc = (checksumBytes[1] << 8) | checksumBytes[0]
    const calculatedCrc = crc16(rawBytes.slice(0, -2))

    if (receivedCrc !== calculatedCrc) {
      return {
        success: false,
        mode: 'rtu',
        error: `CRC校验失败: 接收=0x${receivedCrc.toString(16).toUpperCase().padStart(4, '0')}, 计算=0x${calculatedCrc.toString(16).toUpperCase().padStart(4, '0')}`,
        rawBytes
      }
    }

    this.buffer = []

    return {
      success: true,
      mode: 'rtu',
      frame: {
        address,
        functionCode,
        data,
        checksum: checksumBytes
      },
      rawBytes
    }
  }

  /**
   * 根据功能码计算预期帧长度
   * @returns 预期帧长度，null 表示无法确定（需要动态计算）
   */
  private getExpectedFrameLength(bytes: number[]): number | null {
    if (bytes.length < 2) return null
    
    const functionCode = bytes[1]
    
    // 异常响应（功能码最高位为1）
    if (functionCode >= 0x80) {
      return 5 // 地址(1) + 异常功能码(1) + 异常码(1) + CRC(2)
    }
    
    switch (functionCode) {
      case 0x01: // 读线圈
      case 0x02: // 读离散输入
      case 0x03: // 读保持寄存器
      case 0x04: // 读输入寄存器
        // 请求帧固定长度：地址(1) + 功能码(1) + 起始地址(2) + 数量(2) + CRC(2) = 8
        // 响应帧动态长度：地址(1) + 功能码(1) + 字节数(1) + 数据(N) + CRC(2)
        if (bytes.length >= 3) {
          // 如果第3字节是字节数，说明是响应帧
          const byteCount = bytes[2]
          if (byteCount > 0 && byteCount <= 250) {
            return 3 + byteCount + 2 // 地址 + 功能码 + 字节数 + 数据 + CRC
          }
        }
        return 8 // 默认为请求帧长度
      
      case 0x05: // 写单个线圈
      case 0x06: // 写单个寄存器
        // 请求和响应帧长度相同：地址(1) + 功能码(1) + 地址(2) + 值(2) + CRC(2) = 8
        return 8
      
      case 0x0F: // 写多个线圈
      case 0x10: // 写多个寄存器
        // 请求帧：地址(1) + 功能码(1) + 起始地址(2) + 数量(2) + 字节数(1) + 数据(N) + CRC(2)
        // 响应帧：地址(1) + 功能码(1) + 起始地址(2) + 数量(2) + CRC(2) = 8
        if (bytes.length >= 6) {
          const byteCount = bytes[6]
          if (byteCount > 0 && byteCount <= 246) {
            return 7 + byteCount + 2 // 请求帧
          }
        }
        return 8 // 默认为响应帧长度
      
      default:
        return null // 未知功能码，无法确定长度
    }
  }

  /**
   * 构建 Modbus RTU 请求帧
   */
  static buildRequest(
    address: number,
    functionCode: ModbusFunctionCode,
    data: number[]
  ): number[] {
    const frame = [address, functionCode, ...data]
    const crc = crc16Bytes(frame)
    return [...frame, ...crc]
  }

  /**
   * 构建 Modbus RTU 异常响应帧
   */
  static buildExceptionResponse(
    address: number,
    functionCode: ModbusFunctionCode,
    exceptionCode: number
  ): number[] {
    const frame = [address, functionCode | 0x80, exceptionCode]
    const crc = crc16Bytes(frame)
    return [...frame, ...crc]
  }
}

/**
 * Modbus ASCII 帧解析器
 */
export class ModbusAsciiParser {
  private buffer: string = ''
  private static readonly START_CHAR = ':'
  private static readonly END_CHARS = '\r\n'

  /**
   * 添加接收数据
   */
  addData(data: string): ModbusParseResult | null {
    this.buffer += data
    
    const startIdx = this.buffer.indexOf(ModbusAsciiParser.START_CHAR)
    if (startIdx === -1) {
      this.buffer = ''
      return null
    }
    
    if (startIdx > 0) {
      this.buffer = this.buffer.slice(startIdx)
    }
    
    const endIdx = this.buffer.indexOf(ModbusAsciiParser.END_CHARS)
    if (endIdx === -1) {
      if (this.buffer.length > 514) {
        this.buffer = ''
      }
      return null
    }
    
    const frame = this.buffer.slice(0, endIdx)
    this.buffer = this.buffer.slice(endIdx + 2)
    
    return this.parseFrame(frame)
  }

  /**
   * 清空缓冲区
   */
  clear(): void {
    this.buffer = ''
  }

  /**
   * 解析帧
   */
  private parseFrame(frameStr: string): ModbusParseResult {
    const rawBytes = []
    
    if (frameStr.length < 3 || !frameStr.startsWith(':')) {
      return {
        success: false,
        mode: 'ascii',
        error: '帧格式错误',
        rawBytes: []
      }
    }

    const content = frameStr.slice(1)
    
    try {
      const bytes = hexToBytes(content)
      rawBytes.push(...bytes)
      
      if (bytes.length < 3) {
        return {
          success: false,
          mode: 'ascii',
          error: '帧长度不足',
          rawBytes
        }
      }

      const address = bytes[0]
      const functionCode = bytes[1]
      const data = bytes.slice(2, -1)
      const receivedLrc = bytes[bytes.length - 1]
      const calculatedLrc = lrc(bytes.slice(0, -1))

      if (receivedLrc !== calculatedLrc) {
        return {
          success: false,
          mode: 'ascii',
          error: `LRC校验失败: 接收=${receivedLrc.toString(16).toUpperCase()}, 计算=${calculatedLrc.toString(16).toUpperCase()}`,
          rawBytes
        }
      }

      return {
        success: true,
        mode: 'ascii',
        frame: {
          address,
          functionCode,
          data,
          checksum: [receivedLrc]
        },
        rawBytes
      }
    } catch (e) {
      return {
        success: false,
        mode: 'ascii',
        error: '十六进制解析错误',
        rawBytes: []
      }
    }
  }

  /**
   * 构建 Modbus ASCII 请求帧
   */
  static buildRequest(
    address: number,
    functionCode: ModbusFunctionCode,
    data: number[]
  ): string {
    const bytes = [address, functionCode, ...data]
    const lrcValue = lrc(bytes)
    const hexStr = bytesToHex([...bytes, lrcValue], '')
    return `:${hexStr}\r\n`
  }

  /**
   * 构建 Modbus ASCII 异常响应帧
   */
  static buildExceptionResponse(
    address: number,
    functionCode: ModbusFunctionCode,
    exceptionCode: number
  ): string {
    const bytes = [address, functionCode | 0x80, exceptionCode]
    const lrcValue = lrc(bytes)
    const hexStr = bytesToHex([...bytes, lrcValue], '')
    return `:${hexStr}\r\n`
  }
}

/**
 * 统一的 Modbus 解析器
 */
export class ModbusParser {
  private rtuParser: ModbusRtuParser
  private asciiParser: ModbusAsciiParser
  private currentMode: ModbusMode

  constructor(mode: ModbusMode = 'rtu', baudRate: number = 9600) {
    this.currentMode = mode
    this.rtuParser = new ModbusRtuParser(baudRate)
    this.asciiParser = new ModbusAsciiParser()
  }

  /**
   * 设置解析模式
   */
  setMode(mode: ModbusMode): void {
    this.currentMode = mode
  }

  /**
   * 设置波特率 (仅 RTU 模式)
   */
  setBaudRate(baudRate: number): void {
    this.rtuParser.setBaudRate(baudRate)
  }

  /**
   * 解析数据
   */
  parse(data: number[] | string): ModbusParseResult | null {
    if (this.currentMode === 'rtu') {
      if (typeof data === 'string') {
        return this.rtuParser.addData(hexToBytes(data))
      }
      return this.rtuParser.addData(data)
    } else {
      if (Array.isArray(data)) {
        const decoder = new TextDecoder()
        data = decoder.decode(new Uint8Array(data))
      }
      return this.asciiParser.addData(data as string)
    }
  }

  /**
   * 清空缓冲区
   */
  clear(): void {
    this.rtuParser.clear()
    this.asciiParser.clear()
  }

  /**
   * 构建请求帧
   */
  static buildRequest(
    mode: ModbusMode,
    address: number,
    functionCode: ModbusFunctionCode,
    data: number[]
  ): number[] | string {
    if (mode === 'rtu') {
      return ModbusRtuParser.buildRequest(address, functionCode, data)
    }
    return ModbusAsciiParser.buildRequest(address, functionCode, data)
  }
}

/**
 * 解析 Modbus 数据域
 */
export function parseModbusData(functionCode: number, data: number[]): {
  description: string
  parsed: Record<string, number | number[]>
} {
  const result: { description: string; parsed: Record<string, number | number[]> } = {
    description: '',
    parsed: {}
  }

  switch (functionCode) {
    case 0x01:
    case 0x02:
      if (data.length >= 3) {
        result.parsed = {
          byteCount: data[0],
          coilStatus: data.slice(1)
        }
        result.description = `读取 ${data[0]} 字节状态数据`
      }
      break
    
    case 0x03:
    case 0x04:
      if (data.length >= 3) {
        const byteCount = data[0]
        const registerValues: number[] = []
        for (let i = 1; i < data.length; i += 2) {
          registerValues.push((data[i] << 8) | data[i + 1])
        }
        result.parsed = {
          byteCount,
          registerValues
        }
        result.description = `读取 ${registerValues.length} 个寄存器`
      }
      break
    
    case 0x05:
      if (data.length >= 4) {
        const outputValue = (data[2] << 8) | data[3]
        result.parsed = {
          outputAddress: (data[0] << 8) | data[1],
          outputValue: outputValue === 0xFF00 ? 1 : 0
        }
        result.description = `写入线圈地址 ${(data[0] << 8) | data[1]}: ${outputValue === 0xFF00 ? 'ON' : 'OFF'}`
      }
      break
    
    case 0x06:
      if (data.length >= 4) {
        result.parsed = {
          registerAddress: (data[0] << 8) | data[1],
          registerValue: (data[2] << 8) | data[3]
        }
        result.description = `写入寄存器地址 ${(data[0] << 8) | data[1]}: ${(data[2] << 8) | data[3]}`
      }
      break
    
    case 0x0F:
      if (data.length >= 4) {
        result.parsed = {
          startAddress: (data[0] << 8) | data[1],
          quantity: (data[2] << 8) | data[3]
        }
        result.description = `写入 ${(data[2] << 8) | data[3]} 个线圈`
      }
      break
    
    case 0x10:
      if (data.length >= 4) {
        result.parsed = {
          startAddress: (data[0] << 8) | data[1],
          quantity: (data[2] << 8) | data[3]
        }
        result.description = `写入 ${(data[2] << 8) | data[3]} 个寄存器`
      }
      break
    
    default:
      if (functionCode >= 0x80) {
        result.parsed = { exceptionCode: data[0] }
        result.description = `异常响应: 代码 ${data[0]}`
      } else {
        result.description = '未知功能码'
      }
  }

  return result
}

/**
 * 构建 Modbus 帧
 * @param address 从站地址
 * @param functionCode 功能码
 * @param data 数据域
 * @param mode 模式 (rtu 或 ascii)
 * @returns 完整的 Modbus 帧字节数组
 */
export function buildModbusFrame(
  address: number,
  functionCode: number,
  data: number[],
  mode: ModbusMode = 'rtu'
): number[] {
  const bytes = [address, functionCode, ...data]
  
  if (mode === 'rtu') {
    const crc = crc16Bytes(bytes)
    return [...bytes, crc[0], crc[1]]
  } else {
    const lrcValue = lrc(bytes)
    const fullBytes = [...bytes, lrcValue]
    const hexStr = bytesToHex(fullBytes, '')
    const asciiFrame = `:${hexStr}\r\n`
    return Array.from(new TextEncoder().encode(asciiFrame))
  }
}
