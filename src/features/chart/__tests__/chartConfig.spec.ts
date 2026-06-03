import { describe, expect, it } from 'vitest'
import { defaultChartConfig, defaultSamplingConfig } from '../../../types/chart'
import type { ChartChannelConfig } from '../../../stores/settings'
import {
  exportChartWorkspaceConfig,
  parseChartWorkspaceConfigImport,
  type ChartWorkspaceConfig,
} from '../chartConfig'

const channels: ChartChannelConfig[] = [
  {
    enabled: true,
    name: '温度',
    color: '#3B82F6',
    dataSource: 'serial',
    parseRule: {
      startByte: 0,
      byteLength: 2,
      byteOrder: 'big',
      dataType: 'uint16',
    },
  },
]

describe('chart workspace config', () => {
  it('exports chart workspace config with metadata', () => {
    const config: ChartWorkspaceConfig = {
      chartConfig: { ...defaultChartConfig, type: 'bar', title: '产线温度' },
      samplingConfig: { ...defaultSamplingConfig, frequency: 20 },
      channels,
    }

    const parsed = JSON.parse(exportChartWorkspaceConfig(config, '2026-06-03T00:00:00.000Z'))

    expect(parsed.version).toBe(1)
    expect(parsed.exportedAt).toBe('2026-06-03T00:00:00.000Z')
    expect(parsed.chartConfig.type).toBe('bar')
    expect(parsed.samplingConfig.frequency).toBe(20)
    expect(parsed.channels[0].name).toBe('温度')
  })

  it('imports and normalizes chart workspace config', () => {
    const result = parseChartWorkspaceConfigImport(JSON.stringify({
      chartConfig: { type: 'heatmap', title: '热区', showLegend: false },
      samplingConfig: { frequency: 5000, maxCacheSize: -1, dataSource: 'bad' },
      channels: [{
        enabled: true,
        name: '压力',
        color: 'bad-color',
        dataSource: 'manual',
        parseRule: {
          startByte: -5,
          byteLength: 9,
          byteOrder: 'wrong',
          dataType: 'float',
        },
      }],
    }))

    expect(result.success).toBe(true)
    expect(result.config?.chartConfig).toMatchObject({
      type: 'heatmap',
      title: '热区',
      showLegend: false,
      showGrid: true,
      showTooltip: true,
    })
    expect(result.config?.samplingConfig).toEqual({
      frequency: 1000,
      maxCacheSize: 1000,
      dataSource: 'serial',
    })
    expect(result.config?.channels[0]).toMatchObject({
      name: '压力',
      color: '#3B82F6',
      dataSource: 'manual',
      parseRule: {
        startByte: 0,
        byteLength: 4,
        byteOrder: 'big',
        dataType: 'float',
      },
    })
  })

  it('rejects invalid chart workspace imports', () => {
    expect(parseChartWorkspaceConfigImport('not json').success).toBe(false)
    expect(parseChartWorkspaceConfigImport(JSON.stringify(null)).success).toBe(false)
    expect(parseChartWorkspaceConfigImport(JSON.stringify({ channels: [] })).success).toBe(false)
  })
})
