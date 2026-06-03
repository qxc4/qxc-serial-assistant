import type { ChartChannelConfig } from '../../stores/settings'
import {
  defaultChartConfig,
  defaultSamplingConfig,
  type ChartConfig,
  type ChartType,
  type DataSource,
  type SamplingConfig,
} from '../../types/chart'

export interface ChartWorkspaceConfig {
  chartConfig: ChartConfig
  samplingConfig: SamplingConfig
  channels: ChartChannelConfig[]
}

export interface ChartWorkspaceConfigImportResult {
  success: boolean
  config: ChartWorkspaceConfig | null
  error?: string
}

const CHART_TYPES = new Set<ChartType>(['line', 'bar', 'scatter', 'pie', 'heatmap'])
const DATA_SOURCES = new Set<DataSource>(['serial', 'network', 'manual'])
const BYTE_ORDERS = new Set(['big', 'little'])
const DATA_TYPES = new Set(['uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32', 'float'])
const MAX_CHANNELS = 16

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function normalizeColor(value: unknown, fallback = '#3B82F6'): string {
  const color = readString(value, fallback).trim()
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toUpperCase() : fallback
}

function normalizeChartConfig(value: unknown): ChartConfig {
  const input = isObject(value) ? value : {}
  const type = CHART_TYPES.has(input.type as ChartType) ? input.type as ChartType : defaultChartConfig.type

  return {
    type,
    title: readString(input.title, defaultChartConfig.title),
    showLegend: readBoolean(input.showLegend, defaultChartConfig.showLegend),
    showGrid: readBoolean(input.showGrid, defaultChartConfig.showGrid),
    showTooltip: readBoolean(input.showTooltip, defaultChartConfig.showTooltip),
    animation: readBoolean(input.animation, defaultChartConfig.animation),
  }
}

function normalizeSamplingConfig(value: unknown): SamplingConfig {
  const input = isObject(value) ? value : {}
  const dataSource = DATA_SOURCES.has(input.dataSource as DataSource)
    ? input.dataSource as DataSource
    : defaultSamplingConfig.dataSource

  return {
    frequency: clampInteger(readNumber(input.frequency, defaultSamplingConfig.frequency), 1, 1000),
    maxCacheSize: clampInteger(readNumber(input.maxCacheSize, defaultSamplingConfig.maxCacheSize), 1000, 1_000_000),
    dataSource,
  }
}

function normalizeChannel(value: unknown, index: number): ChartChannelConfig {
  const input = isObject(value) ? value : {}
  const parseRule = isObject(input.parseRule) ? input.parseRule : {}
  const dataSource = DATA_SOURCES.has(input.dataSource as DataSource) ? input.dataSource as DataSource : 'serial'
  const byteOrder = BYTE_ORDERS.has(parseRule.byteOrder as string) ? parseRule.byteOrder as 'big' | 'little' : 'big'
  const dataType = DATA_TYPES.has(parseRule.dataType as string)
    ? parseRule.dataType as ChartChannelConfig['parseRule']['dataType']
    : 'uint16'

  return {
    enabled: readBoolean(input.enabled, true),
    name: readString(input.name, `通道${index + 1}`).trim() || `通道${index + 1}`,
    color: normalizeColor(input.color),
    dataSource,
    parseRule: {
      startByte: clampInteger(readNumber(parseRule.startByte, 0), 0, 1024),
      byteLength: clampInteger(readNumber(parseRule.byteLength, 2), 1, 4),
      byteOrder,
      dataType,
    },
  }
}

function normalizeChannels(value: unknown): ChartChannelConfig[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('配置文件缺少可用通道')
  }
  return value.slice(0, MAX_CHANNELS).map(normalizeChannel)
}

export function exportChartWorkspaceConfig(config: ChartWorkspaceConfig, exportedAt = new Date().toISOString()): string {
  return JSON.stringify({
    version: 1,
    exportedAt,
    chartConfig: config.chartConfig,
    samplingConfig: config.samplingConfig,
    channels: config.channels,
  }, null, 2)
}

export function parseChartWorkspaceConfigImport(raw: string): ChartWorkspaceConfigImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { success: false, config: null, error: '图表配置不是有效 JSON' }
  }

  if (!isObject(parsed)) {
    return { success: false, config: null, error: '图表配置格式错误' }
  }

  try {
    return {
      success: true,
      config: {
        chartConfig: normalizeChartConfig(parsed.chartConfig),
        samplingConfig: normalizeSamplingConfig(parsed.samplingConfig),
        channels: normalizeChannels(parsed.channels),
      },
    }
  } catch (error) {
    return { success: false, config: null, error: error instanceof Error ? error.message : '图表配置导入失败' }
  }
}
