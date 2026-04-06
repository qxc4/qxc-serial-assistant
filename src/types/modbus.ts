/**
 * Modbus 协议类型定义
 */

/** Modbus 传输模式 */
export type ModbusMode = 'rtu' | 'ascii'

/** Modbus 功能码 */
export type ModbusFunctionCode = 
  | 0x01
  | 0x02
  | 0x03
  | 0x04
  | 0x05
  | 0x06
  | 0x0F
  | 0x10

/** Modbus 异常码 */
export type ModbusExceptionCode = 
  | 0x01
  | 0x02
  | 0x03
  | 0x04
  | 0x05
  | 0x06
  | 0x08
  | 0x0B

/** Modbus 寄存器类型 */
export type RegisterType = 'coil' | 'discrete-input' | 'holding-register' | 'input-register'

/** Modbus 请求帧 */
export interface ModbusRequest {
  address: number
  functionCode: ModbusFunctionCode
  data: number[]
}

/** Modbus 响应帧 */
export interface ModbusResponse {
  address: number
  functionCode: ModbusFunctionCode
  data: number[]
  isException: boolean
  exceptionCode?: ModbusExceptionCode
}

/** Modbus 解析结果 */
export interface ModbusParseResult {
  success: boolean
  mode: ModbusMode
  frame?: {
    address: number
    functionCode: number
    data: number[]
    checksum: number[]
  }
  error?: string
  rawBytes: number[]
}

/** Modbus 配置 */
export interface ModbusConfig {
  mode: ModbusMode
  addressRange: {
    start: number
    end: number
  }
  timeout: number
}

/** 功能码名称映射 */
export const functionCodeNames: Record<number, string> = {
  0x01: '读线圈',
  0x02: '读离散输入',
  0x03: '读保持寄存器',
  0x04: '读输入寄存器',
  0x05: '写单个线圈',
  0x06: '写单个寄存器',
  0x0F: '写多个线圈',
  0x10: '写多个寄存器'
}

/** 异常码名称映射 */
export const exceptionCodeNames: Record<number, string> = {
  0x01: '非法功能码',
  0x02: '非法数据地址',
  0x03: '非法数据值',
  0x04: '从站设备故障',
  0x05: '确认',
  0x06: '从站设备忙',
  0x08: '存储奇偶性差错',
  0x0B: '网关路径不可用'
}

/** 默认 Modbus 配置 */
export const defaultModbusConfig: ModbusConfig = {
  mode: 'rtu',
  addressRange: {
    start: 1,
    end: 247
  },
  timeout: 1000
}
