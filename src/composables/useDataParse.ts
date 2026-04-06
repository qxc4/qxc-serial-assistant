/**
 * 数据解析 Composable
 * 提供数据解析功能，支持 Modbus RTU/ASCII、自定义协议等多种解析模式
 */

import { ref, computed } from 'vue'
import { ModbusParser } from '../utils/modbus'
import { calculateAllChecksums, sumChecksum, xorChecksum, crc16Bytes } from '../utils/checksum'
import { functionCodeNames } from '../types/modbus'
import type { ModbusParseResult } from '../types/modbus'
import type { ParseMode, CustomProtocolConfig } from '../stores/settings'

/** 解析结果项 */
export interface ParsedDataItem {
  id: string
  timestamp: number
  rawBytes: number[]
  mode: ParseMode
  result?: ModbusParseResult
  customResult?: {
    header: number[]
    data: number[]
    tail: number[]
    checksum: number[]
    valid: boolean
    error?: string
  }
  checksums?: Array<{ type: string; value: string }>
  description?: string
  error?: string
}

/** 解析统计 */
export interface ParseStats {
  totalParsed: number
  successCount: number
  errorCount: number
}

/** 生成唯一 ID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/** Modbus 解析器实例 */
let modbusParser: ModbusParser | null = null

/** 解析结果列表 */
const parsedResults = ref<ParsedDataItem[]>([])

/** 解析统计 */
const parseStats = ref<ParseStats>({
  totalParsed: 0,
  successCount: 0,
  errorCount: 0
})

/** 是否显示解析结果面板 */
const showParsePanel = ref(true)

/** 当前解析模式 */
const currentParseMode = ref<ParseMode>('none')

/** 自定义协议配置 */
const customProtocolConfig = ref<CustomProtocolConfig>({
  frameHeader: 'AA 55',
  frameTail: '',
  lengthField: {
    enabled: true,
    offset: 2,
    size: 1,
    includesHeader: false
  },
  checksum: {
    type: 'sum',
    offset: 0
  },
  dataOffset: 3
})

export function useDataParse() {
  /** 解析结果数量 */
  const resultCount = computed(() => parsedResults.value.length)

  /**
   * 初始化解析器
   */
  function initParser(mode: ParseMode, baudRate?: number): void {
    currentParseMode.value = mode
    
    if (mode === 'modbus-rtu') {
      modbusParser = new ModbusParser('rtu', baudRate || 9600)
    } else if (mode === 'modbus-ascii') {
      modbusParser = new ModbusParser('ascii')
    } else {
      modbusParser = null
    }
  }

  /**
   * 解析十六进制字符串为字节数组
   */
  function hexStringToBytes(hexStr: string): number[] {
    const cleanHex = hexStr.replace(/\s+/g, '').toUpperCase()
    
    if (cleanHex.length === 0) return []
    
    const paddedHex = cleanHex.length % 2 === 1 ? '0' + cleanHex : cleanHex
    const bytes: number[] = []
    
    for (let i = 0; i < paddedHex.length; i += 2) {
      const byte = parseInt(paddedHex.substring(i, i + 2), 16)
      if (!isNaN(byte)) {
        bytes.push(byte)
      }
    }
    return bytes
  }

  /**
   * 解析自定义协议帧
   */
  function parseCustomFrame(bytes: number[], config: CustomProtocolConfig): ParsedDataItem['customResult'] {
    const result: ParsedDataItem['customResult'] = {
      header: [],
      data: [],
      tail: [],
      checksum: [],
      valid: false
    }

    // 解析帧头
    const headerBytes = hexStringToBytes(config.frameHeader)
    if (headerBytes.length > 0) {
      if (bytes.length < headerBytes.length) {
        result.error = '帧长度不足'
        return result
      }
      
      for (let i = 0; i < headerBytes.length; i++) {
        if (bytes[i] !== headerBytes[i]) {
          result.error = `帧头不匹配: 期望 ${headerBytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`
          return result
        }
      }
      result.header = bytes.slice(0, headerBytes.length)
    }

    // 解析帧尾
    const tailBytes = hexStringToBytes(config.frameTail)
    if (tailBytes.length > 0) {
      if (bytes.length < headerBytes.length + tailBytes.length) {
        result.error = '帧长度不足（缺少帧尾）'
        return result
      }
      
      const tailStart = bytes.length - tailBytes.length
      for (let i = 0; i < tailBytes.length; i++) {
        if (bytes[tailStart + i] !== tailBytes[i]) {
          result.error = '帧尾不匹配'
          return result
        }
      }
      result.tail = bytes.slice(tailStart)
    }

    // 计算数据区域
    const dataStart = config.dataOffset
    let dataEnd = bytes.length - tailBytes.length
    
    // 如果有校验码，调整数据结束位置
    if (config.checksum.type !== 'none') {
      dataEnd -= config.checksum.type === 'crc16' || config.checksum.type === 'crc16-modbus' ? 2 : 1
    }

    if (dataStart >= dataEnd) {
      result.error = '数据区域无效'
      return result
    }

    result.data = bytes.slice(dataStart, dataEnd)

    // 验证校验码
    if (config.checksum.type !== 'none') {
      const checksumStart = dataEnd
      let calculatedChecksum: number[]
      let receivedChecksum: number[]

      if (config.checksum.type === 'crc16' || config.checksum.type === 'crc16-modbus') {
        calculatedChecksum = crc16Bytes(bytes.slice(0, checksumStart))
        receivedChecksum = [bytes[checksumStart], bytes[checksumStart + 1]]
        
        if (receivedChecksum[0] !== calculatedChecksum[0] || receivedChecksum[1] !== calculatedChecksum[1]) {
          result.error = `CRC校验失败`
          return result
        }
      } else {
        let calcValue: number
        if (config.checksum.type === 'sum') {
          calcValue = sumChecksum(bytes.slice(0, checksumStart))
        } else {
          calcValue = xorChecksum(bytes.slice(0, checksumStart))
        }
        
        calculatedChecksum = [calcValue]
        receivedChecksum = [bytes[checksumStart]]
        
        if (receivedChecksum[0] !== calculatedChecksum[0]) {
          result.error = `校验失败: 期望 0x${calcValue.toString(16).toUpperCase().padStart(2, '0')}, 接收 0x${receivedChecksum[0].toString(16).toUpperCase().padStart(2, '0')}`
          return result
        }
      }
      
      result.checksum = receivedChecksum
    }

    result.valid = true
    return result
  }

  /**
   * 解析数据
   */
  function parseData(data: Uint8Array | number[]): ParsedDataItem | null {
    if (currentParseMode.value === 'none') {
      return null
    }

    const bytes = data instanceof Uint8Array ? Array.from(data) : data
    const item: ParsedDataItem = {
      id: generateId(),
      timestamp: Date.now(),
      rawBytes: bytes,
      mode: currentParseMode.value
    }

    item.checksums = calculateAllChecksums(bytes)

    switch (currentParseMode.value) {
      case 'modbus-rtu':
      case 'modbus-ascii':
        if (!modbusParser) {
          initParser(currentParseMode.value)
        }

        if (modbusParser) {
          const result = modbusParser.parse(bytes)
          if (result) {
            item.result = result
            
            if (result.success && result.frame) {
              item.description = formatModbusDescription(result)
              parseStats.value.successCount++
            } else {
              item.error = result.error || '解析失败'
              parseStats.value.errorCount++
            }
          }
        }
        break

      case 'hex-display':
        // 纯十六进制显示，不做协议解析
        item.description = `HEX: ${bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`
        parseStats.value.successCount++
        break

      case 'ascii-display':
        // ASCII 文本显示
        try {
          const decoder = new TextDecoder('utf-8', { fatal: false })
          const text = decoder.decode(new Uint8Array(bytes))
          item.description = `ASCII: ${text.replace(/[\x00-\x1F\x7F-\x9F]/g, '.')} `
          item.description += `\nHEX: ${bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`
          parseStats.value.successCount++
        } catch {
          item.error = '文本解码失败'
          parseStats.value.errorCount++
        }
        break

      case 'custom-frame':
        const customResult = parseCustomFrame(bytes, customProtocolConfig.value)
        item.customResult = customResult
        
        if (customResult && customResult.valid) {
          const dataHex = customResult.data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
          item.description = `自定义帧解析成功\n数据: ${dataHex}`
          parseStats.value.successCount++
        } else if (customResult) {
          item.error = customResult.error || '自定义帧解析失败'
          parseStats.value.errorCount++
        }
        break
    }

    parseStats.value.totalParsed++
    parsedResults.value.push(item)

    if (parsedResults.value.length > 1000) {
      parsedResults.value = parsedResults.value.slice(-1000)
    }

    return item
  }

  /**
   * 格式化 Modbus 描述
   */
  function formatModbusDescription(result: ModbusParseResult): string {
    if (!result.frame) return ''
    
    const { address, functionCode, data } = result.frame
    const fcName = functionCodeNames[functionCode] || '未知功能码'
    
    let desc = `地址: ${address}, 功能码: 0x${functionCode.toString(16).toUpperCase().padStart(2, '0')} (${fcName})`
    
    if (data.length > 0) {
      const dataHex = data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
      desc += `, 数据: ${dataHex}`
    }
    
    return desc
  }

  /**
   * 清除解析结果
   */
  function clearResults(): void {
    parsedResults.value = []
    parseStats.value = {
      totalParsed: 0,
      successCount: 0,
      errorCount: 0
    }
  }

  /**
   * 重置解析器
   */
  function resetParser(): void {
    if (modbusParser) {
      modbusParser.clear()
    }
  }

  /**
   * 设置解析模式
   */
  function setParseMode(mode: ParseMode, baudRate?: number): void {
    initParser(mode, baudRate)
    clearResults()
  }

  /**
   * 设置自定义协议配置
   */
  function setCustomProtocolConfig(config: CustomProtocolConfig): void {
    customProtocolConfig.value = { ...config }
  }

  /**
   * 导出解析结果
   */
  function exportResults(format: 'json' | 'csv' | 'txt'): string {
    if (format === 'json') {
      return JSON.stringify(parsedResults.value, null, 2)
    }
    
    if (format === 'csv') {
      const headers = ['时间', '原始数据', '模式', '描述', '错误']
      const rows = parsedResults.value.map(item => [
        new Date(item.timestamp).toISOString(),
        item.rawBytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
        item.mode,
        item.description || '',
        item.error || ''
      ])
      return [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    }
    
    return parsedResults.value.map(item => {
      const time = new Date(item.timestamp).toLocaleString()
      const raw = item.rawBytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
      if (item.error) {
        return `[${time}] 错误: ${item.error}\n原始数据: ${raw}`
      }
      return `[${time}] ${item.description || ''}\n原始数据: ${raw}`
    }).join('\n\n')
  }

  return {
    parsedResults,
    parseStats,
    showParsePanel,
    currentParseMode,
    customProtocolConfig,
    resultCount,
    initParser,
    parseData,
    clearResults,
    resetParser,
    setParseMode,
    setCustomProtocolConfig,
    exportResults
  }
}
