/**
 * 数据图表模块类型定义
 */

/** 图表类型 */
export type ChartType = 'line' | 'bar' | 'scatter' | 'pie' | 'heatmap'

/** 数据源类型 */
export type DataSource = 'serial' | 'network' | 'manual'

/** 采样配置 */
export interface SamplingConfig {
  frequency: number
  maxCacheSize: number
  dataSource: DataSource
}

/** 数据点 */
export interface DataPoint {
  id: string
  timestamp: number
  value: number
  channel?: string
}

/** 数据通道 */
export interface DataChannel {
  id: string
  name: string
  color: string
  enabled: boolean
  unit?: string
  minValue?: number
  maxValue?: number
}

/** 历史数据查询参数 */
export interface HistoryQuery {
  startTime: number
  endTime: number
  channels?: string[]
  interval?: number
}

/** 回放状态 */
export interface PlaybackState {
  isPlaying: boolean
  speed: number
  currentIndex: number
  totalPoints: number
}

/** 导出格式 */
export type ExportFormat = 'csv' | 'txt' | 'pdf' | 'excel'

/** 图表配置 */
export interface ChartConfig {
  type: ChartType
  title: string
  showLegend: boolean
  showGrid: boolean
  showTooltip: boolean
  animation: boolean
}

/** 图表状态 */
export interface ChartState {
  config: ChartConfig
  sampling: SamplingConfig
  channels: DataChannel[]
  dataPoints: DataPoint[]
  playback: PlaybackState
  isCollecting: boolean
}

/** 默认采样配置 */
export const defaultSamplingConfig: SamplingConfig = {
  frequency: 100,
  maxCacheSize: 100000,
  dataSource: 'serial'
}

/** 默认图表配置 */
export const defaultChartConfig: ChartConfig = {
  type: 'line',
  title: '',
  showLegend: true,
  showGrid: true,
  showTooltip: true,
  animation: true
}

/** 默认回放状态 */
export const defaultPlaybackState: PlaybackState = {
  isPlaying: false,
  speed: 1,
  currentIndex: 0,
  totalPoints: 0
}

/** 预设采样频率选项 (Hz) */
export const samplingFrequencyOptions = [
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1000
]

/** 回放速度选项 */
export const playbackSpeedOptions = [0.5, 1, 2, 5, 10]
