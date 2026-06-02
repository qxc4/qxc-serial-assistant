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

const successfulResultCount = computed(() => parseResults.value.filter(item => item.result?.success).length)
const failedResultCount = computed(() => parseResults.value.filter(item => !item.result?.success).length)
const activeParseResult = computed(() => {
  return parseResults.value.find(item => item.id === expandedResult.value) || parseResults.value[0] || null
})

/** 数据类型选项 */
const dataTypeOptions = computed<{ value: DataType; label: string; bytes: number }[]>(() => [
  { value: 'uint16', label: t('modbus.uint16'), bytes: 2 },
  { value: 'int16', label: t('modbus.int16'), bytes: 2 },
  { value: 'uint32', label: t('modbus.uint32'), bytes: 4 },
  { value: 'int32', label: t('modbus.int32'), bytes: 4 },
  { value: 'float32', label: t('modbus.float32'), bytes: 4 }
])

/** 字节序选项 */
const byteOrderOptions = computed<{ value: ByteOrder; label: string }[]>(() => [
  { value: 'ABCD', label: t('modbus.abcd') },
  { value: 'DCBA', label: t('modbus.dcba') },
  { value: 'BADC', label: t('modbus.badc') },
  { value: 'CDAB', label: t('modbus.cdab') }
])

/** 功能码选项 */
const functionCodeOptions = computed(() => [
  { value: 1, label: t('modbus.fc01'), needsQuantity: true },
  { value: 2, label: t('modbus.fc02'), needsQuantity: true },
  { value: 3, label: t('modbus.fc03'), needsQuantity: true },
  { value: 4, label: t('modbus.fc04'), needsQuantity: true },
  { value: 5, label: t('modbus.fc05'), needsValue: true },
  { value: 6, label: t('modbus.fc06'), needsValue: true },
  { value: 15, label: t('modbus.fc15'), needsValue: true },
  { value: 16, label: t('modbus.fc16'), needsValue: true }
])

/** 当前选中的功能码配置 */
const selectedFunctionCode = computed(() => {
  return functionCodeOptions.value.find(fc => fc.value === buildSettings.value.functionCode)
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
    expandedResult.value = item.id
    
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

function useBuildResultAsResponseInput() {
  if (!buildResult.value) return
  inputHex.value = buildResult.value
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
  <div class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 text-sm text-slate-800 transition-colors dark:bg-slate-900 dark:text-slate-200">
    <div class="h-14 shrink-0 border-b border-slate-200 bg-white/90 px-4 dark:border-slate-800 dark:bg-slate-900/90">
      <div class="flex h-full items-center justify-between gap-3">
        <div class="min-w-0">
          <h2 class="flex items-center gap-2 truncate text-sm font-semibold">
            <Cpu class="h-4 w-4 text-blue-500" />
            {{ t('modbus.title') }}
          </h2>
          <p class="truncate text-[11px] text-slate-500 dark:text-slate-400">{{ t('modbus.desc') }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <button 
            @click="parseMode = 'rtu'"
            class="rounded-lg border px-3 py-1.5 text-xs transition-colors"
            :class="parseMode === 'rtu' ? 'border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'"
          >
            {{ t('modbus.rtuMode') }}
          </button>
          <button 
            @click="parseMode = 'ascii'"
            class="rounded-lg border px-3 py-1.5 text-xs transition-colors"
            :class="parseMode === 'ascii' ? 'border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'"
          >
            {{ t('modbus.asciiMode') }}
          </button>
        </div>
      </div>
    </div>

    <div class="grid flex-1 min-h-0 grid-cols-[320px_minmax(0,1fr)_340px] overflow-hidden">
      <!-- 请求构建 -->
      <section class="flex min-h-0 flex-col border-r border-slate-200 bg-white/95 dark:border-slate-800 dark:bg-slate-900/95">
        <div class="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">{{ t('modbus.frameBuild') }}</h3>
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">Request</span>
          </div>
        </div>

        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.slaveAddress') }}</label>
              <input v-model.number="buildSettings.address" type="number" min="1" max="247" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.functionCode') }}</label>
              <select v-model.number="buildSettings.functionCode" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800">
                <option v-for="fc in functionCodeOptions" :key="fc.value" :value="fc.value">{{ fc.label }}</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.startAddress') }}</label>
              <input v-model.number="buildSettings.startAddress" type="number" min="0" max="65535" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.quantityValue') }}</label>
              <input v-model.number="buildSettings.quantity" type="number" min="1" max="125" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
            </div>
          </div>

          <div v-if="selectedFunctionCode?.needsValue" class="flex flex-col gap-1">
            <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('modbus.writeValue') }}</label>
            <input v-model="buildSettings.writeValue" type="text" :placeholder="t('modbus.writeValuePlaceholder')" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
          </div>

          <button @click="handleBuild" class="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 dark:bg-blue-600 dark:hover:bg-blue-500">
            <Send class="h-4 w-4" />
            {{ t('modbus.buildFrame') }}
          </button>

          <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
            <div class="mb-2 flex items-center justify-between gap-2">
              <span class="text-xs font-medium text-slate-500">{{ t('modbus.buildResult') }}</span>
              <div class="flex items-center gap-1">
                <button @click="useBuildResultAsResponseInput" :disabled="!buildResult" class="rounded px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-800">填入响应</button>
                <button @click="copyToClipboard(buildResult)" :disabled="!buildResult" class="rounded p-1 hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-800">
                  <Copy class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div class="min-h-16 break-all font-mono text-xs text-blue-600 dark:text-blue-400">
              {{ buildResult || '—' }}
            </div>
          </div>

          <div class="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <h4 class="mb-2 text-xs font-medium text-slate-500">{{ t('modbus.dataParseSettings') }}</h4>
            <div class="grid grid-cols-2 gap-2">
              <select v-model="dataTypeSettings.type" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800">
                <option v-for="dt in dataTypeOptions" :key="dt.value" :value="dt.value">{{ dt.label }}</option>
              </select>
              <select v-model="dataTypeSettings.byteOrder" class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800">
                <option v-for="bo in byteOrderOptions" :key="bo.value" :value="bo.value">{{ bo.label }}</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <!-- 响应解析 -->
      <section class="flex min-h-0 flex-col bg-white dark:bg-slate-900">
        <div class="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div class="flex items-center justify-between gap-3">
            <h3 class="flex items-center gap-2 text-sm font-semibold">
              <FileCode class="h-4 w-4 text-blue-500" />
              {{ t('modbus.dataParse') }}
            </h3>
            <div class="flex items-center gap-2 text-[10px] text-slate-500">
              <span class="rounded-full bg-green-50 px-2 py-0.5 text-green-600 dark:bg-green-950/40 dark:text-green-300">{{ successfulResultCount }} 成功</span>
              <span class="rounded-full bg-red-50 px-2 py-0.5 text-red-600 dark:bg-red-950/40 dark:text-red-300">{{ failedResultCount }} 失败</span>
            </div>
          </div>
        </div>

        <div class="border-b border-slate-200 p-4 dark:border-slate-800">
          <textarea v-model="inputHex" :placeholder="t('modbus.inputPlaceholder')" class="h-24 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950/60"></textarea>
          <div class="mt-2 flex items-center justify-end gap-2">
            <button @click="inputHex = ''" class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">{{ t('serial.clear') }}</button>
            <button @click="handleParse" class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
              <FileCode class="h-3.5 w-3.5" />
              {{ t('modbus.parseData') }}
            </button>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <div v-if="!activeParseResult" class="flex h-full items-center justify-center text-slate-400">
            <div class="text-center">
              <Table class="mx-auto mb-3 h-12 w-12 opacity-30" />
              <p class="text-sm">{{ t('modbus.noResults') }}</p>
              <p class="mt-1 text-xs">{{ t('modbus.noResultsHint') }}</p>
            </div>
          </div>

          <div v-else class="space-y-3">
            <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
              <div class="mb-2 flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <component :is="activeParseResult.result?.success ? CheckCircle2 : XCircle" class="h-4 w-4" :class="activeParseResult.result?.success ? 'text-green-500' : 'text-red-500'" />
                  <span class="text-xs text-slate-500">{{ formatTimestamp(activeParseResult.timestamp) }}</span>
                  <span class="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] dark:bg-slate-800">{{ activeParseResult.mode.toUpperCase() }}</span>
                </div>
                <button @click="copyToClipboard(activeParseResult.input)" class="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-800">
                  <Copy class="h-3.5 w-3.5" />
                </button>
              </div>
              <div class="break-all font-mono text-xs text-blue-600 dark:text-blue-400">{{ activeParseResult.input }}</div>
            </div>

            <div v-if="activeParseResult.result?.success && activeParseResult.result.frame" class="space-y-3">
              <div class="grid grid-cols-2 gap-3 text-xs">
                <div class="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                  <div class="text-slate-500">{{ t('modbus.slaveAddress') }}</div>
                  <div class="mt-1 font-mono text-lg font-semibold">{{ activeParseResult.result.frame.address }}</div>
                </div>
                <div class="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                  <div class="text-slate-500">{{ t('modbus.functionCode') }}</div>
                  <div class="mt-1 font-mono text-lg font-semibold">0x{{ activeParseResult.result.frame.functionCode.toString(16).toUpperCase().padStart(2, '0') }}</div>
                  <div class="truncate text-[10px] text-slate-400">{{ functionCodeNames[activeParseResult.result.frame.functionCode] || t('modbus.unknown') }}</div>
                </div>
              </div>

              <div v-if="activeParseResult.result.frame.data.length > 0" class="rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                <span class="text-slate-500">{{ t('modbus.rawData') }}</span>
                <div class="mt-1 break-all font-mono text-green-600 dark:text-green-400">
                  {{ activeParseResult.result.frame.data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ') }}
                </div>
              </div>

              <div v-if="activeParseResult.registers.length > 0" class="rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                <div class="mb-2 flex items-center justify-between">
                  <span class="text-slate-500">{{ t('modbus.registerParse') }}</span>
                  <span class="text-[10px] text-slate-400">{{ dataTypeSettings.type }} / {{ dataTypeSettings.byteOrder }}</span>
                </div>
                <div class="overflow-x-auto">
                  <table class="w-full text-xs">
                    <thead>
                      <tr class="border-b border-slate-200 dark:border-slate-800">
                        <th class="px-2 py-1 text-left font-normal text-slate-500">{{ t('modbus.registerAddress') }}</th>
                        <th class="px-2 py-1 text-left font-normal text-slate-500">HEX</th>
                        <th class="px-2 py-1 text-right font-normal text-slate-500">{{ t('modbus.parsedValue') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="reg in activeParseResult.registers" :key="reg.address" class="border-b border-slate-100 last:border-0 dark:border-slate-800">
                        <td class="px-2 py-1 font-mono">{{ reg.address }}</td>
                        <td class="px-2 py-1 font-mono text-slate-500">{{ reg.raw }}</td>
                        <td class="px-2 py-1 text-right font-mono font-semibold text-blue-600 dark:text-blue-400">{{ reg.parsed }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div class="rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                <span class="text-slate-500">校验码</span>
                <span class="ml-2 font-mono text-purple-600 dark:text-purple-400">{{ activeParseResult.result.frame.checksum.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ') }}</span>
                <span class="ml-1 text-slate-400">({{ activeParseResult.mode === 'rtu' ? 'CRC16' : 'LRC' }})</span>
              </div>
            </div>

            <div v-else class="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {{ activeParseResult.error || '解析失败' }}
            </div>

            <div class="rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
              <span class="text-slate-500">所有校验</span>
              <div class="mt-2 flex flex-wrap gap-2">
                <span v-for="cs in activeParseResult.checksums" :key="cs.type" class="rounded bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                  {{ cs.type }}: <span class="font-mono text-purple-600 dark:text-purple-400">{{ cs.value }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 流水线历史 -->
      <section class="flex min-h-0 flex-col border-l border-slate-200 bg-slate-50/95 dark:border-slate-800 dark:bg-slate-950/80">
        <div class="border-b border-slate-200 px-3 py-3 dark:border-slate-800">
          <div class="flex items-center justify-between gap-2">
            <h3 class="flex items-center gap-2 text-sm font-semibold">
              <Table class="h-4 w-4" />
              {{ t('modbus.parseResults') }}
              <span class="text-xs font-normal text-slate-500">({{ parseResults.length }})</span>
            </h3>
            <div class="flex items-center gap-1">
              <button @click="handleExportExcel" :disabled="parseResults.length === 0" class="rounded p-1.5 hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-800" :title="t('modbus.exportExcel')">
                <FileSpreadsheet class="h-4 w-4" />
              </button>
              <button @click="handleExportTxt" :disabled="parseResults.length === 0" class="rounded p-1.5 hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-800" :title="t('modbus.exportTxt')">
                <Download class="h-4 w-4" />
              </button>
              <button @click="handleClear" :disabled="parseResults.length === 0" class="rounded p-1.5 hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-800" :title="t('modbus.clearResults')">
                <Trash2 class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          <div v-if="parseResults.length === 0" class="flex h-full items-center justify-center text-center text-slate-400">
            <div>
              <FileCode class="mx-auto mb-3 h-10 w-10 opacity-30" />
              <p class="text-sm">{{ t('modbus.noResults') }}</p>
            </div>
          </div>

          <div v-else class="space-y-2">
            <button
              v-for="item in parseResults"
              :key="item.id"
              @click="toggleResultExpand(item.id)"
              class="w-full rounded-lg border p-3 text-left transition-colors"
              :class="expandedResult === item.id
                ? 'border-blue-300 bg-white shadow-sm dark:border-blue-900/60 dark:bg-slate-900'
                : 'border-slate-200 bg-white/70 hover:bg-white dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-900'"
            >
              <div class="flex items-center gap-2">
                <component :is="item.result?.success ? CheckCircle2 : XCircle" class="h-4 w-4 shrink-0" :class="item.result?.success ? 'text-green-500' : 'text-red-500'" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] text-slate-500">{{ formatTimestamp(item.timestamp) }}</span>
                    <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] dark:bg-slate-800">{{ item.mode.toUpperCase() }}</span>
                  </div>
                  <div class="mt-1 truncate font-mono text-xs text-blue-600 dark:text-blue-400">{{ item.input }}</div>
                </div>
                <component :is="expandedResult === item.id ? ChevronDown : ChevronUp" class="h-3.5 w-3.5 text-slate-400" />
              </div>
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
