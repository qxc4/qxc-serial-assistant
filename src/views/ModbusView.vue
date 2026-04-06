<script setup lang="ts">
import { ref, computed } from 'vue'
import { 
  FileCode, 
  Send, 
  Trash2, 
  Download, 
  ChevronDown, 
  ChevronUp,
  CheckCircle2,
  XCircle,
  Copy,
  Cpu,
  Table,
  FileSpreadsheet
} from 'lucide-vue-next'
import { useSettingsStore } from '../stores/settings'
import { useI18n } from '../composables/useI18n'
import { ModbusParser, buildModbusFrame } from '../utils/modbus'
import { calculateAllChecksums } from '../utils/checksum'
import { functionCodeNames } from '../types/modbus'
import type { ModbusParseResult, ModbusMode } from '../types/modbus'

const settingsStore = useSettingsStore()
const { t } = useI18n()

/** 数据类型 */
type DataType = 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32'

/** 字节序 */
type ByteOrder = 'ABCD' | 'DCBA' | 'BADC' | 'CDAB'

/** 当前解析模式 */
const parseMode = ref<ModbusMode>('rtu')

/** 数据类型设置 */
const dataTypeSettings = ref<{
  type: DataType
  byteOrder: ByteOrder
}>({
  type: 'uint16',
  byteOrder: 'ABCD'
})

/** 输入的十六进制数据 */
const inputHex = ref('')

/** 解析结果列表 */
interface RegisterValue {
  address: number
  raw: string
  parsed: string | number
  type: DataType
}

interface ParseResultItem {
  id: string
  timestamp: number
  input: string
  mode: ModbusMode
  result: ModbusParseResult | null
  checksums: Array<{ type: string; value: string }>
  registers: RegisterValue[]
  error?: string
}

const parseResults = ref<ParseResultItem[]>([])

/** 构建设置 */
const buildSettings = ref({
  address: 1,
  functionCode: 3,
  startAddress: 0,
  quantity: 1,
  writeValue: ''
})

/** 构建结果 */
const buildResult = ref('')

/** 展开的解析结果 */
const expandedResult = ref<string | null>(null)

/** Modbus 解析器实例 */
let parser: ModbusParser | null = null

/** 数据类型选项 */
const dataTypeOptions: { value: DataType; label: string; bytes: number }[] = [
  { value: 'uint16', label: 'UINT16 (无符号16位)', bytes: 2 },
  { value: 'int16', label: 'INT16 (有符号16位)', bytes: 2 },
  { value: 'uint32', label: 'UINT32 (无符号32位)', bytes: 4 },
  { value: 'int32', label: 'INT32 (有符号32位)', bytes: 4 },
  { value: 'float32', label: 'FLOAT32 (单精度浮点)', bytes: 4 }
]

/** 字节序选项 */
const byteOrderOptions: { value: ByteOrder; label: string }[] = [
  { value: 'ABCD', label: 'ABCD (大端)' },
  { value: 'DCBA', label: 'DCBA (小端)' },
  { value: 'BADC', label: 'BADC (中大端)' },
  { value: 'CDAB', label: 'CDAB (中小端)' }
]

/** 功能码选项 */
const functionCodeOptions = [
  { value: 1, label: '0x01 - 读线圈', needsQuantity: true },
  { value: 2, label: '0x02 - 读离散输入', needsQuantity: true },
  { value: 3, label: '0x03 - 读保持寄存器', needsQuantity: true },
  { value: 4, label: '0x04 - 读输入寄存器', needsQuantity: true },
  { value: 5, label: '0x05 - 写单个线圈', needsValue: true },
  { value: 6, label: '0x06 - 写单个寄存器', needsValue: true },
  { value: 15, label: '0x0F - 写多个线圈', needsValue: true },
  { value: 16, label: '0x10 - 写多个寄存器', needsValue: true }
]

/** 当前选中的功能码配置 */
const selectedFunctionCode = computed(() => {
  return functionCodeOptions.find(fc => fc.value === buildSettings.value.functionCode)
})

/**
 * 根据字节序重排字节
 */
function reorderBytes(bytes: number[], order: ByteOrder): number[] {
  if (bytes.length === 2) {
    switch (order) {
      case 'DCBA': return [bytes[1], bytes[0]]
      case 'ABCD':
      case 'BADC':
      case 'CDAB':
      default: return bytes
    }
  }
  
  if (bytes.length === 4) {
    switch (order) {
      case 'ABCD': return [bytes[0], bytes[1], bytes[2], bytes[3]]
      case 'DCBA': return [bytes[3], bytes[2], bytes[1], bytes[0]]
      case 'BADC': return [bytes[1], bytes[0], bytes[3], bytes[2]]
      case 'CDAB': return [bytes[2], bytes[3], bytes[0], bytes[1]]
      default: return bytes
    }
  }
  
  return bytes
}

/**
 * 解析寄存器数据
 */
function parseRegisterData(data: number[], startAddress: number, type: DataType, byteOrder: ByteOrder): RegisterValue[] {
  const registers: RegisterValue[] = []
  const bytesPerValue = type === 'uint16' || type === 'int16' ? 2 : 4
  
  for (let i = 0; i < data.length; i += bytesPerValue) {
    if (i + bytesPerValue > data.length) break
    
    const rawBytes = data.slice(i, i + bytesPerValue)
    const reordered = reorderBytes(rawBytes, byteOrder)
    const rawHex = rawBytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
    
    let parsedValue: string | number
    
    switch (type) {
      case 'uint16': {
        parsedValue = (reordered[0] << 8) | reordered[1]
        break
      }
      case 'int16': {
        const val = (reordered[0] << 8) | reordered[1]
        parsedValue = val > 0x7FFF ? val - 0x10000 : val
        break
      }
      case 'uint32': {
        parsedValue = (reordered[0] << 24) | (reordered[1] << 16) | (reordered[2] << 8) | reordered[3]
        break
      }
      case 'int32': {
        const val = (reordered[0] << 24) | (reordered[1] << 16) | (reordered[2] << 8) | reordered[3]
        parsedValue = val > 0x7FFFFFFF ? val - 0x100000000 : val
        break
      }
      case 'float32': {
        const buffer = new ArrayBuffer(4)
        const view = new DataView(buffer)
        reordered.forEach((b, idx) => view.setUint8(idx, b))
        parsedValue = view.getFloat32(0, false).toFixed(6)
        break
      }
      default:
        parsedValue = rawHex
    }
    
    registers.push({
      address: startAddress + Math.floor(i / 2),
      raw: rawHex,
      parsed: parsedValue,
      type
    })
  }
  
  return registers
}

/**
 * 解析输入数据
 */
function handleParse() {
  const hex = inputHex.value.trim().replace(/\s/g, '')
  if (!hex) return
  
  if (!/^[0-9A-Fa-f]+$/.test(hex)) {
    settingsStore.showToast(t('modbus.invalidHex'))
    return
  }
  
  const paddedHex = hex.length % 2 === 1 ? '0' + hex : hex
  const bytes: number[] = []
  
  for (let i = 0; i < paddedHex.length; i += 2) {
    const byteStr = paddedHex.substring(i, i + 2)
    const byte = parseInt(byteStr, 16)
    if (!isNaN(byte)) {
      bytes.push(byte)
    }
  }
  
  if (bytes.length === 0) {
    settingsStore.showToast(t('modbus.invalidHex'))
    return
  }
  
  try {
    parser = new ModbusParser(parseMode.value)
    
    const result = parser.parse(bytes)
    const checksums = calculateAllChecksums(bytes)
    
    const item: ParseResultItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      input: inputHex.value.trim(),
      mode: parseMode.value,
      result,
      checksums,
      registers: []
    }
    
    if (result && !result.success) {
      item.error = result.error
    }
    
    if (result?.success && result.frame) {
      const fc = result.frame.functionCode
      if ([0x03, 0x04].includes(fc) && result.frame.data.length > 1) {
        const byteCount = result.frame.data[0]
        const registerData = result.frame.data.slice(1, 1 + byteCount)
        const startAddr = 0
        item.registers = parseRegisterData(
          registerData, 
          startAddr, 
          dataTypeSettings.value.type, 
          dataTypeSettings.value.byteOrder
        )
      }
    }
    
    parseResults.value.unshift(item)
    
    if (parseResults.value.length > 100) {
      parseResults.value = parseResults.value.slice(0, 100)
    }
  } catch (e) {
    settingsStore.showToast(t('modbus.buildFailed'))
    console.error('解析失败:', e)
  }
}

/**
 * 构建 Modbus 帧
 */
function handleBuild() {
  const { address, functionCode, startAddress, quantity, writeValue } = buildSettings.value
  
  if (address < 0 || address > 247) {
    settingsStore.showToast('从站地址必须在 0-247 范围内')
    return
  }
  
  if (startAddress < 0 || startAddress > 65535) {
    settingsStore.showToast('起始地址必须在 0-65535 范围内')
    return
  }
  
  if (quantity < 1 || quantity > 125) {
    settingsStore.showToast('数量必须在 1-125 范围内')
    return
  }
  
  try {
    let data: number[] = []
    
    switch (functionCode) {
      case 1:
      case 2:
      case 3:
      case 4:
        data = [
          (startAddress >> 8) & 0xFF,
          startAddress & 0xFF,
          (quantity >> 8) & 0xFF,
          quantity & 0xFF
        ]
        break
      
      case 5: {
        const coilValue = writeValue === '1' || writeValue.toUpperCase() === 'ON' ? 0xFF00 : 0x0000
        data = [
          (startAddress >> 8) & 0xFF,
          startAddress & 0xFF,
          (coilValue >> 8) & 0xFF,
          coilValue & 0xFF
        ]
        break
      }
      
      case 6: {
        const regValue = parseInt(writeValue, 10) || 0
        if (regValue < 0 || regValue > 65535) {
          settingsStore.showToast('写入值必须在 0-65535 范围内')
          return
        }
        data = [
          (startAddress >> 8) & 0xFF,
          startAddress & 0xFF,
          (regValue >> 8) & 0xFF,
          regValue & 0xFF
        ]
        break
      }
      
      case 15:
      case 16: {
        const values = writeValue.split(',').map(v => parseInt(v.trim(), 10) || 0)
        if (values.length === 0 || values.length > 123) {
          settingsStore.showToast('写入值数量必须在 1-123 范围内')
          return
        }
        const byteCount = functionCode === 15 ? Math.ceil(values.length / 8) : values.length * 2
        data = [
          (startAddress >> 8) & 0xFF,
          startAddress & 0xFF,
          (values.length >> 8) & 0xFF,
          values.length & 0xFF,
          byteCount,
          ...values.flatMap(v => functionCode === 16 ? [(v >> 8) & 0xFF, v & 0xFF] : [v])
        ]
        break
      }
    }
    
    const frame = buildModbusFrame(address, functionCode, data, parseMode.value)
    buildResult.value = frame.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
  } catch (e) {
    settingsStore.showToast(t('modbus.buildFailed') + '：' + (e instanceof Error ? e.message : String(e)))
  }
}

/**
 * 复制到剪贴板
 */
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    settingsStore.showToast(t('serial.copied'))
  } catch {
    settingsStore.showToast(t('modbus.copyFailed'))
  }
}

/**
 * 清除解析结果
 */
function handleClear() {
  parseResults.value = []
}

/**
 * 导出解析结果为 TXT
 */
function handleExportTxt() {
  const content = parseResults.value.map(item => {
    const time = new Date(item.timestamp).toLocaleString()
    const lines = [`[${time}] 模式: ${item.mode.toUpperCase()}`]
    lines.push(`输入: ${item.input}`)
    
    if (item.result?.success && item.result.frame) {
      const { address, functionCode, data } = item.result.frame
      lines.push(`地址: ${address}`)
      lines.push(`功能码: 0x${functionCode.toString(16).toUpperCase().padStart(2, '0')} (${functionCodeNames[functionCode] || '未知'})`)
      if (data.length > 0) {
        lines.push(`数据: ${data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`)
      }
      if (item.registers.length > 0) {
        lines.push(`寄存器解析 (${dataTypeSettings.value.type} / ${dataTypeSettings.value.byteOrder}):`)
        item.registers.forEach(reg => {
          lines.push(`  地址 ${reg.address}: ${reg.raw} = ${reg.parsed}`)
        })
      }
    } else if (item.error) {
      lines.push(`错误: ${item.error}`)
    }
    
    return lines.join('\n')
  }).join('\n\n')
  
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `modbus_parse_${new Date().getTime()}.txt`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  settingsStore.showToast(t('serial.exportSuccess'))
}

/**
 * 导出解析结果为 CSV (Excel 兼容)
 */
function handleExportExcel() {
  const headers = ['时间', '模式', '输入数据', '从站地址', '功能码', '功能名称', '寄存器地址', '原始HEX', '解析值', '数据类型', '字节序', '状态', '错误信息']
  const rows: string[][] = [headers]
  
  parseResults.value.forEach(item => {
    const time = new Date(item.timestamp).toLocaleString()
    const baseRow = [
      time,
      item.mode.toUpperCase(),
      item.input,
      item.result?.frame?.address?.toString() || '',
      item.result?.frame ? `0x${item.result.frame.functionCode.toString(16).toUpperCase().padStart(2, '0')}` : '',
      item.result?.frame ? (functionCodeNames[item.result.frame.functionCode] || '') : '',
      '',
      '',
      '',
      dataTypeSettings.value.type,
      dataTypeSettings.value.byteOrder,
      item.result?.success ? '成功' : '失败',
      item.error || ''
    ]
    
    if (item.registers.length > 0) {
      item.registers.forEach((reg) => {
        rows.push([
          time,
          item.mode.toUpperCase(),
          item.input,
          item.result?.frame?.address?.toString() || '',
          item.result?.frame ? `0x${item.result.frame.functionCode.toString(16).toUpperCase().padStart(2, '0')}` : '',
          item.result?.frame ? (functionCodeNames[item.result.frame.functionCode] || '') : '',
          reg.address.toString(),
          reg.raw,
          reg.parsed.toString(),
          dataTypeSettings.value.type,
          dataTypeSettings.value.byteOrder,
          '成功',
          ''
        ])
      })
    } else {
      rows.push(baseRow)
    }
  })
  
  const BOM = '\uFEFF'
  const csvContent = BOM + rows.map(row => 
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n')
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `modbus_data_${new Date().getTime()}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  settingsStore.showToast(t('modbus.exportSuccess'))
}

/**
 * 切换结果展开状态
 */
function toggleResultExpand(id: string) {
  expandedResult.value = expandedResult.value === id ? null : id
}

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString()
}
</script>

<template>
  <div class="flex flex-col h-full w-full bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans text-sm transition-colors">
    <div class="flex flex-1 overflow-hidden">
      <!-- 左侧面板 -->
      <div class="w-80 shrink-0 bg-white dark:bg-slate-800 border-r dark:border-slate-700 flex flex-col">
        <div class="p-4 border-b dark:border-slate-700">
          <h2 class="font-bold text-base mb-1 flex items-center gap-2">
            <Cpu class="w-5 h-5" />
            {{ t('modbus.title') }}
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            {{ t('modbus.desc') }}
          </p>
        </div>

        <!-- 解析模式选择 -->
        <div class="p-4 border-b dark:border-slate-700">
          <h3 class="font-semibold text-sm mb-3">{{ t('modbus.parseMode') }}</h3>
          <div class="flex gap-2">
            <button 
              @click="parseMode = 'rtu'"
              class="flex-1 py-2 rounded border dark:border-slate-700 text-sm transition-colors"
              :class="parseMode === 'rtu' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-300' : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'"
            >
              {{ t('modbus.rtuMode') }}
            </button>
            <button 
              @click="parseMode = 'ascii'"
              class="flex-1 py-2 rounded border dark:border-slate-700 text-sm transition-colors"
              :class="parseMode === 'ascii' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-300' : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'"
            >
              {{ t('modbus.asciiMode') }}
            </button>
          </div>
        </div>

        <!-- 数据类型设置 -->
        <div class="p-4 border-b dark:border-slate-700">
          <h3 class="font-semibold text-sm mb-3">{{ t('modbus.dataParseSettings') }}</h3>
          <div class="flex flex-col gap-2">
            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.dataType') }}</label>
              <select 
                v-model="dataTypeSettings.type"
                class="border dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm"
              >
                <option v-for="dt in dataTypeOptions" :key="dt.value" :value="dt.value">
                  {{ dt.label }}
                </option>
              </select>
            </div>
            
            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.byteOrder') }}</label>
              <select 
                v-model="dataTypeSettings.byteOrder"
                class="border dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm"
              >
                <option v-for="bo in byteOrderOptions" :key="bo.value" :value="bo.value">
                  {{ bo.label }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <!-- 数据解析 -->
        <div class="p-4 border-b dark:border-slate-700">
          <h3 class="font-semibold text-sm mb-3">{{ t('modbus.dataParse') }}</h3>
          <div class="flex flex-col gap-2">
            <textarea 
              v-model="inputHex"
              :placeholder="t('modbus.inputPlaceholder')"
              class="border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm font-mono h-20 resize-none"
            ></textarea>
            <button 
              @click="handleParse"
              class="w-full py-2 rounded bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors flex items-center justify-center gap-2"
            >
              <FileCode class="w-4 h-4" />
              {{ t('modbus.parseData') }}
            </button>
          </div>
        </div>

        <!-- 帧构建 -->
        <div class="p-4 flex-1 overflow-y-auto">
          <h3 class="font-semibold text-sm mb-3">{{ t('modbus.frameBuild') }}</h3>
          <div class="flex flex-col gap-3">
            <div class="flex gap-2">
              <div class="flex-1 flex flex-col gap-1">
                <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.slaveAddress') }}</label>
                <input 
                  v-model.number="buildSettings.address"
                  type="number"
                  min="1"
                  max="247"
                  class="border dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm"
                />
              </div>
              <div class="flex-1 flex flex-col gap-1">
                <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.functionCode') }}</label>
                <select 
                  v-model.number="buildSettings.functionCode"
                  class="border dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm"
                >
                  <option v-for="fc in functionCodeOptions" :key="fc.value" :value="fc.value">
                    {{ fc.label }}
                  </option>
                </select>
              </div>
            </div>

            <div class="flex gap-2">
              <div class="flex-1 flex flex-col gap-1">
                <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.startAddress') }}</label>
                <input 
                  v-model.number="buildSettings.startAddress"
                  type="number"
                  min="0"
                  max="65535"
                  class="border dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm"
                />
              </div>
              <div class="flex-1 flex flex-col gap-1">
                <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.quantityValue') }}</label>
                <input 
                  v-model.number="buildSettings.quantity"
                  type="number"
                  min="1"
                  max="125"
                  class="border dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm"
                />
              </div>
            </div>

            <div v-if="selectedFunctionCode?.needsValue" class="flex flex-col gap-1">
              <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.writeValue') }}</label>
              <input 
                v-model="buildSettings.writeValue"
                type="text"
                :placeholder="t('modbus.writeValuePlaceholder')"
                class="border dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm"
              />
            </div>

            <button 
              @click="handleBuild"
              class="w-full py-2 rounded bg-green-500 hover:bg-green-600 text-white font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Send class="w-4 h-4" />
              {{ t('modbus.buildFrame') }}
            </button>

            <div v-if="buildResult" class="p-2 bg-slate-100 dark:bg-slate-900 rounded font-mono text-xs break-all">
              <div class="flex items-center justify-between mb-1">
                <span class="text-slate-500">{{ t('modbus.buildResult') }}:</span>
                <button @click="copyToClipboard(buildResult)" class="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded">
                  <Copy class="w-3 h-3" />
                </button>
              </div>
              <span class="text-blue-600 dark:text-blue-400">{{ buildResult }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧面板: 解析结果 -->
      <div class="flex-1 flex flex-col bg-white dark:bg-slate-800 min-w-0">
        <!-- 工具栏 -->
        <div class="h-12 border-b dark:border-slate-700 flex items-center justify-between px-4 bg-slate-50 dark:bg-slate-900 shrink-0">
          <h3 class="font-semibold text-sm flex items-center gap-2">
            <Table class="w-4 h-4" />
            {{ t('modbus.parseResults') }}
            <span class="text-xs font-normal text-slate-500">({{ parseResults.length }} {{ t('modbus.records') }})</span>
          </h3>
          <div class="flex items-center gap-2">
            <button 
              @click="handleExportExcel"
              :disabled="parseResults.length === 0"
              class="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1"
              :title="t('modbus.exportExcel')"
            >
              <FileSpreadsheet class="w-4 h-4" />
              <span class="text-xs">Excel</span>
            </button>
            <button 
              @click="handleExportTxt"
              :disabled="parseResults.length === 0"
              class="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
              :title="t('modbus.exportTxt')"
            >
              <Download class="w-4 h-4" />
            </button>
            <button 
              @click="handleClear"
              :disabled="parseResults.length === 0"
              class="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
              :title="t('modbus.clearResults')"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- 结果列表 -->
        <div class="flex-1 overflow-y-auto p-4">
          <div v-if="parseResults.length === 0" class="h-full flex items-center justify-center text-slate-400">
            <div class="text-center">
              <FileCode class="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p class="text-base mb-2">{{ t('modbus.noResults') }}</p>
              <p class="text-xs">{{ t('modbus.noResultsHint') }}</p>
            </div>
          </div>

          <div v-else class="space-y-3">
            <div 
              v-for="item in parseResults" 
              :key="item.id"
              class="bg-slate-50 dark:bg-slate-900 rounded-lg border dark:border-slate-700 overflow-hidden"
            >
              <div 
                class="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                @click="toggleResultExpand(item.id)"
              >
                <component 
                  :is="expandedResult === item.id ? ChevronDown : ChevronUp" 
                  class="w-4 h-4 text-slate-400"
                />
                <component 
                  :is="item.result?.success ? CheckCircle2 : XCircle"
                  class="w-5 h-5"
                  :class="item.result?.success ? 'text-green-500' : 'text-red-500'"
                />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-slate-500">{{ formatTimestamp(item.timestamp) }}</span>
                    <span class="text-xs px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700">
                      {{ item.mode.toUpperCase() }}
                    </span>
                  </div>
                  <div class="font-mono text-xs text-blue-600 dark:text-blue-400 truncate mt-1">
                    {{ item.input }}
                  </div>
                </div>
                <button 
                  @click.stop="copyToClipboard(item.input)"
                  class="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                  :title="t('modbus.copy')"
                >
                  <Copy class="w-3.5 h-3.5" />
                </button>
              </div>

              <div v-if="expandedResult === item.id" class="px-4 py-3 border-t dark:border-slate-700 space-y-3">
                <!-- 解析成功 -->
                <div v-if="item.result?.success && item.result.frame" class="space-y-2">
                  <div class="grid grid-cols-2 gap-2 text-xs">
                    <div class="bg-white dark:bg-slate-800 p-2 rounded">
                      <span class="text-slate-500">{{ t('modbus.slaveAddress') }}:</span>
                      <span class="ml-2 font-mono font-semibold">{{ item.result.frame.address }}</span>
                    </div>
                    <div class="bg-white dark:bg-slate-800 p-2 rounded">
                      <span class="text-slate-500">{{ t('modbus.functionCode') }}:</span>
                      <span class="ml-2 font-mono font-semibold">0x{{ item.result.frame.functionCode.toString(16).toUpperCase().padStart(2, '0') }}</span>
                      <span class="ml-1 text-slate-400">({{ functionCodeNames[item.result.frame.functionCode] || t('modbus.unknown') }})</span>
                    </div>
                  </div>
                  
                  <div v-if="item.result.frame.data.length > 0" class="bg-white dark:bg-slate-800 p-2 rounded text-xs">
                    <span class="text-slate-500">{{ t('modbus.rawData') }}:</span>
                    <div class="font-mono text-green-600 dark:text-green-400 mt-1 break-all">
                      {{ item.result.frame.data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ') }}
                    </div>
                  </div>

                  <!-- 寄存器解析结果 -->
                  <div v-if="item.registers.length > 0" class="bg-white dark:bg-slate-800 p-2 rounded text-xs">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-slate-500">{{ t('modbus.registerParse') }}</span>
                      <span class="text-xs text-slate-400">{{ dataTypeSettings.type }} / {{ dataTypeSettings.byteOrder }}</span>
                    </div>
                    <div class="overflow-x-auto">
                      <table class="w-full text-xs">
                        <thead>
                          <tr class="border-b dark:border-slate-700">
                            <th class="text-left py-1 px-2 text-slate-500 font-normal">{{ t('modbus.registerAddress') }}</th>
                            <th class="text-left py-1 px-2 text-slate-500 font-normal">HEX</th>
                            <th class="text-right py-1 px-2 text-slate-500 font-normal">{{ t('modbus.parsedValue') }}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="reg in item.registers" :key="reg.address" class="border-b dark:border-slate-700 last:border-0">
                            <td class="py-1 px-2 font-mono">{{ reg.address }}</td>
                            <td class="py-1 px-2 font-mono text-slate-500">{{ reg.raw }}</td>
                            <td class="py-1 px-2 text-right font-mono text-blue-600 dark:text-blue-400 font-semibold">{{ reg.parsed }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div class="bg-white dark:bg-slate-800 p-2 rounded text-xs">
                    <span class="text-slate-500">校验码:</span>
                    <span class="ml-2 font-mono text-purple-600 dark:text-purple-400">
                      {{ item.result.frame.checksum.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ') }}
                    </span>
                    <span class="ml-1 text-slate-400">({{ item.mode === 'rtu' ? 'CRC16' : 'LRC' }})</span>
                  </div>
                </div>

                <!-- 解析失败 -->
                <div v-else class="bg-red-50 dark:bg-red-900/20 p-2 rounded text-xs text-red-600 dark:text-red-400">
                  {{ item.error || '解析失败' }}
                </div>

                <!-- 所有校验码 -->
                <div class="bg-white dark:bg-slate-800 p-2 rounded text-xs">
                  <span class="text-slate-500">所有校验:</span>
                  <div class="flex flex-wrap gap-2 mt-1">
                    <span v-for="cs in item.checksums" :key="cs.type" class="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded">
                      {{ cs.type }}: <span class="font-mono text-purple-600 dark:text-purple-400">{{ cs.value }}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
