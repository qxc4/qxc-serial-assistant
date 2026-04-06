/**
 * 数据图表 Composable
 * 提供数据采集、图表渲染、历史数据管理等功能
 */

import { ref, computed, onUnmounted } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart, BarChart, ScatterChart, PieChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  DataZoomComponent,
  LegendComponent,
  ToolboxComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import type { 
  ChartType, 
  DataPoint, 
  DataChannel,
  ChartConfig,
  SamplingConfig,
  PlaybackState,
  ExportFormat
} from '../types/chart'
import { defaultChartConfig, defaultSamplingConfig, defaultPlaybackState } from '../types/chart'

echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  PieChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  DataZoomComponent,
  LegendComponent,
  ToolboxComponent,
  CanvasRenderer
])

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 数据图表 Composable
 */
export function useChart() {
  /** 图表配置 */
  const chartConfig = ref<ChartConfig>({ ...defaultChartConfig })
  
  /** 采样配置 */
  const samplingConfig = ref<SamplingConfig>({ ...defaultSamplingConfig })
  
  /** 数据通道 */
  const channels = ref<DataChannel[]>([
    { id: '1', name: '通道1', color: '#3B82F6', enabled: true, unit: '' },
    { id: '2', name: '通道2', color: '#10B981', enabled: true, unit: '' },
    { id: '3', name: '通道3', color: '#F59E0B', enabled: true, unit: '' }
  ])

  /** 数据点缓存 */
  const dataPoints = ref<DataPoint[]>([])

  /** 回放状态 */
  const playback = ref<PlaybackState>({ ...defaultPlaybackState })

  /** 是否正在采集 */
  const isCollecting = ref(false)

  /** ECharts 实例 */
  let chartInstance: echarts.EChartsType | null = null

  /** 采样计时器 */
  let samplingTimer: number | null = null

  /** 回放计时器 */
  let playbackTimer: number | null = null

  /** 数据点计数器 */
  let dataPointCounter = 0

  /** 图表类型 */
  const chartType = computed(() => chartConfig.value.type)

  /** 数据点数量 */
  const dataPointCount = computed(() => dataPoints.value.length)

  /** 是否正在回放 */
  const isPlaying = computed(() => playback.value.isPlaying)

  /**
   * 初始化图表
   */
  function initChart(container: HTMLElement): void {
    if (chartInstance) {
      chartInstance.dispose()
    }
    
    chartInstance = echarts.init(container, undefined, {
      renderer: 'canvas'
    })
    
    updateChart()
    
    window.addEventListener('resize', handleResize)
  }

  /**
   * 处理窗口大小变化
   */
  function handleResize(): void {
    chartInstance?.resize()
  }

  /**
   * 更新图表
   */
  function updateChart(): void {
    if (!chartInstance) return

    const option = buildChartOption()
    chartInstance.setOption(option, { notMerge: true })
  }

  /**
   * 构建图表配置项
   */
  function buildChartOption(): EChartsOption {
    const enabledChannels = channels.value.filter(c => c.enabled)
    const recentPoints = dataPoints.value.slice(-samplingConfig.value.maxCacheSize)

    const baseOption: EChartsOption = {
      title: {
        text: chartConfig.value.title,
        left: 'center',
        textStyle: {
          fontSize: 14,
          color: '#64748B'
        }
      },
      tooltip: {
        show: chartConfig.value.showTooltip,
        trigger: 'axis',
        axisPointer: {
          type: 'cross'
        }
      },
      legend: {
        show: chartConfig.value.showLegend,
        data: enabledChannels.map(c => c.name),
        bottom: 0
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: '10%',
        containLabel: true
      },
      toolbox: {
        feature: {
          dataZoom: {
            yAxisIndex: 'none'
          },
          restore: {},
          saveAsImage: {}
        }
      },
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100
        },
        {
          start: 0,
          end: 100
        }
      ],
      xAxis: {
        type: 'category',
        boundaryGap: chartType.value === 'bar',
        data: recentPoints.map(p => new Date(p.timestamp).toLocaleTimeString()),
        axisLabel: {
          fontSize: 10
        }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 10
        }
      },
      animation: chartConfig.value.animation
    }

    switch (chartType.value) {
      case 'line':
        return {
          ...baseOption,
          series: enabledChannels.map((channel) => ({
            name: channel.name,
            type: 'line',
            smooth: true,
            symbol: 'none',
            sampling: 'lttb',
            lineStyle: {
              width: 2,
              color: channel.color
            },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: channel.color + '40' },
                { offset: 1, color: channel.color + '00' }
              ])
            },
            data: recentPoints
              .filter(p => p.channel === channel.id)
              .map(p => p.value)
          }))
        }

      case 'bar':
        return {
          ...baseOption,
          series: enabledChannels.map((channel) => ({
            name: channel.name,
            type: 'bar',
            itemStyle: {
              color: channel.color
            },
            data: recentPoints
              .filter(p => p.channel === channel.id)
              .map(p => p.value)
          }))
        }

      case 'scatter':
        return {
          ...baseOption,
          series: enabledChannels.map((channel) => ({
            name: channel.name,
            type: 'scatter',
            symbolSize: 8,
            itemStyle: {
              color: channel.color
            },
            data: recentPoints
              .filter(p => p.channel === channel.id)
              .map(p => [new Date(p.timestamp).getTime(), p.value])
          }))
        }

      case 'pie':
        const pieData = enabledChannels.map(channel => ({
          name: channel.name,
          value: recentPoints
            .filter(p => p.channel === channel.id)
            .reduce((sum, p) => sum + p.value, 0)
        }))
        return {
          title: {
            text: chartConfig.value.title,
            left: 'center'
          },
          tooltip: {
            trigger: 'item',
            formatter: '{b}: {c} ({d}%)'
          },
          legend: {
            orient: 'vertical',
            left: 'left'
          },
          series: [{
            name: '数据分布',
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: false,
            itemStyle: {
              borderRadius: 10,
              borderColor: '#fff',
              borderWidth: 2
            },
            label: {
              show: false,
              position: 'center'
            },
            emphasis: {
              label: {
                show: true,
                fontSize: 16,
                fontWeight: 'bold'
              }
            },
            labelLine: {
              show: false
            },
            data: pieData.map((item, index) => ({
              ...item,
              itemStyle: {
                color: enabledChannels[index]?.color || '#3B82F6'
              }
            }))
          }]
        }

      case 'heatmap':
        return {
          ...baseOption,
          visualMap: {
            min: Math.min(...recentPoints.map(p => p.value)),
            max: Math.max(...recentPoints.map(p => p.value)),
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: '5%'
          },
          series: [{
            type: 'heatmap',
            data: recentPoints.map((p, index) => [
              index % enabledChannels.length,
              Math.floor(index / enabledChannels.length),
              p.value
            ]),
            label: {
              show: false
            },
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            }
          }]
        }

      default:
        return baseOption
    }
  }

  /**
   * 添加数据点
   */
  function addDataPoint(value: number, channelId?: string): void {
    const point: DataPoint = {
      id: generateId(),
      timestamp: Date.now(),
      value,
      channel: channelId || channels.value[0]?.id
    }
    
    dataPoints.value.push(point)
    dataPointCounter++
    
    if (dataPoints.value.length > samplingConfig.value.maxCacheSize) {
      dataPoints.value = dataPoints.value.slice(-samplingConfig.value.maxCacheSize)
    }
    
    if (isCollecting.value) {
      updateChart()
    }
  }

  /**
   * 批量添加数据点
   */
  function addDataPoints(points: Array<{ value: number; channel?: string }>): void {
    const timestamp = Date.now()
    
    points.forEach((p, index) => {
      const point: DataPoint = {
        id: generateId(),
        timestamp: timestamp + index,
        value: p.value,
        channel: p.channel || channels.value[0]?.id
      }
      dataPoints.value.push(point)
    })
    
    if (dataPoints.value.length > samplingConfig.value.maxCacheSize) {
      dataPoints.value = dataPoints.value.slice(-samplingConfig.value.maxCacheSize)
    }
    
    updateChart()
  }

  /**
   * 从原始字节数据解析并添加数据点
   * @param bytes 原始字节数据
   * @param channelConfigs 通道配置列表
   */
  function parseAndAddDataPoints(
    bytes: Uint8Array | number[],
    channelConfigs: Array<{
      id: string
      startByte: number
      byteLength: number
      byteOrder: 'big' | 'little'
      dataType: 'uint8' | 'int8' | 'uint16' | 'int16' | 'uint32' | 'int32' | 'float'
    }>
  ): void {
    const data = bytes instanceof Uint8Array ? Array.from(bytes) : bytes
    const timestamp = Date.now()
    
    for (const config of channelConfigs) {
      const { startByte, byteLength, byteOrder, dataType, id } = config
      
      if (startByte < 0 || startByte >= data.length) continue
      if (startByte + byteLength > data.length) continue
      if (byteLength < 1 || byteLength > 4) continue
      
      const bytesSlice = data.slice(startByte, startByte + byteLength)
      if (bytesSlice.length < byteLength) continue
      
      let value = 0
      
      try {
        switch (dataType) {
          case 'uint8':
            value = bytesSlice[0]
            break
          case 'int8':
            value = bytesSlice[0] > 127 ? bytesSlice[0] - 256 : bytesSlice[0]
            break
          case 'uint16':
            if (bytesSlice.length >= 2) {
              if (byteOrder === 'big') {
                value = (bytesSlice[0] << 8) | bytesSlice[1]
              } else {
                value = (bytesSlice[1] << 8) | bytesSlice[0]
              }
            }
            break
          case 'int16':
            if (bytesSlice.length >= 2) {
              if (byteOrder === 'big') {
                value = (bytesSlice[0] << 8) | bytesSlice[1]
              } else {
                value = (bytesSlice[1] << 8) | bytesSlice[0]
              }
              if (value > 32767) value -= 65536
            }
            break
          case 'uint32':
            if (bytesSlice.length >= 4) {
              if (byteOrder === 'big') {
                value = (bytesSlice[0] << 24) | (bytesSlice[1] << 16) | (bytesSlice[2] << 8) | bytesSlice[3]
              } else {
                value = (bytesSlice[3] << 24) | (bytesSlice[2] << 16) | (bytesSlice[1] << 8) | bytesSlice[0]
              }
              value = value >>> 0
            }
            break
          case 'int32':
            if (bytesSlice.length >= 4) {
              if (byteOrder === 'big') {
                value = (bytesSlice[0] << 24) | (bytesSlice[1] << 16) | (bytesSlice[2] << 8) | bytesSlice[3]
              } else {
                value = (bytesSlice[3] << 24) | (bytesSlice[2] << 16) | (bytesSlice[1] << 8) | bytesSlice[0]
              }
            }
            break
          case 'float':
            if (bytesSlice.length >= 4) {
              const buffer = new ArrayBuffer(4)
              const view = new DataView(buffer)
              if (byteOrder === 'big') {
                view.setUint8(0, bytesSlice[0])
                view.setUint8(1, bytesSlice[1])
                view.setUint8(2, bytesSlice[2])
                view.setUint8(3, bytesSlice[3])
              } else {
                view.setUint8(0, bytesSlice[3])
                view.setUint8(1, bytesSlice[2])
                view.setUint8(2, bytesSlice[1])
                view.setUint8(3, bytesSlice[0])
              }
              value = view.getFloat32(0, byteOrder === 'little')
            }
            break
        }
      } catch (e) {
        console.warn('解析数据点失败:', e)
        continue
      }
      
      const point: DataPoint = {
        id: generateId(),
        timestamp,
        value,
        channel: id
      }
      dataPoints.value.push(point)
    }
    
    if (dataPoints.value.length > samplingConfig.value.maxCacheSize) {
      dataPoints.value = dataPoints.value.slice(-samplingConfig.value.maxCacheSize)
    }
    
    if (isCollecting.value) {
      updateChart()
    }
  }

  /**
   * 开始采集
   */
  function startCollection(): void {
    if (isCollecting.value) return
    
    isCollecting.value = true
    
    // 如果数据源是手动输入，使用模拟数据
    if (samplingConfig.value.dataSource === 'manual') {
      const interval = 1000 / samplingConfig.value.frequency
      let counter = 0
      
      samplingTimer = window.setInterval(() => {
        const value = Math.sin(counter * 0.1) * 50 + 50 + Math.random() * 10
        addDataPoint(value)
        counter++
      }, interval)
    }
    // 对于串口和网络数据源，数据将通过 parseAndAddDataPoints 方法从外部添加
  }

  /**
   * 停止采集
   */
  function stopCollection(): void {
    isCollecting.value = false
    
    if (samplingTimer) {
      clearInterval(samplingTimer)
      samplingTimer = null
    }
  }

  /**
   * 清除数据
   */
  function clearData(): void {
    dataPoints.value = []
    dataPointCounter = 0
    updateChart()
  }

  /**
   * 开始回放
   */
  function startPlayback(speed: number = 1): void {
    if (playback.value.isPlaying || dataPoints.value.length === 0) return
    
    playback.value.isPlaying = true
    playback.value.speed = speed
    playback.value.currentIndex = 0
    playback.value.totalPoints = dataPoints.value.length
    
    const interval = 100 / speed
    
    playbackTimer = window.setInterval(() => {
      if (playback.value.currentIndex >= playback.value.totalPoints - 1) {
        stopPlayback()
        return
      }
      
      playback.value.currentIndex++
      const visiblePoints = dataPoints.value.slice(0, playback.value.currentIndex + 1)
      if (chartInstance) {
        const xAxisData = visiblePoints.map(p => 
          new Date(p.timestamp).toLocaleTimeString()
        )
        chartInstance.setOption({
          xAxis: { data: xAxisData }
        })
      }
    }, interval)
  }

  /**
   * 停止回放
   */
  function stopPlayback(): void {
    playback.value.isPlaying = false
    
    if (playbackTimer) {
      clearInterval(playbackTimer)
      playbackTimer = null
    }
  }

  /**
   * 暂停回放
   */
  function pausePlayback(): void {
    if (!playback.value.isPlaying) return
    
    playback.value.isPlaying = false
    
    if (playbackTimer) {
      clearInterval(playbackTimer)
      playbackTimer = null
    }
  }

  /**
   * 设置图表类型
   */
  function setChartType(type: ChartType): void {
    chartConfig.value.type = type
    updateChart()
  }

  /**
   * 设置采样频率
   */
  function setSamplingFrequency(frequency: number): void {
    samplingConfig.value.frequency = frequency
    
    if (isCollecting.value) {
      stopCollection()
      startCollection()
    }
  }

  /**
   * 查询历史数据
   */
  function queryHistory(startTime: number, endTime: number): DataPoint[] {
    return dataPoints.value.filter(p => 
      p.timestamp >= startTime && p.timestamp <= endTime
    )
  }

  /**
   * 导出数据
   */
  function exportData(format: ExportFormat): string {
    const headers = ['时间', '通道', '值']
    const rows = dataPoints.value.map(p => [
      new Date(p.timestamp).toISOString(),
      channels.value.find(c => c.id === p.channel)?.name || p.channel || '',
      p.value.toString()
    ])

    switch (format) {
      case 'csv':
        return [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      
      case 'txt':
        return rows.map(r => `[${r[0]}] ${r[1]}: ${r[2]}`).join('\n')
      
      case 'excel':
        return [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n')
      
      case 'pdf':
        return rows.map(r => r.join(' | ')).join('\n')
      
      default:
        return ''
    }
  }

  /**
   * 下载导出文件
   */
  function downloadExport(format: ExportFormat): void {
    const content = exportData(format)
    const mimeTypes: Record<ExportFormat, string> = {
      csv: 'text/csv',
      txt: 'text/plain',
      pdf: 'application/pdf',
      excel: 'application/vnd.ms-excel'
    }
    
    const blob = new Blob([content], { type: mimeTypes[format] + ';charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chart-data-${Date.now()}.${format === 'excel' ? 'xls' : format}`
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * 销毁图表
   */
  /**
   * 销毁图表实例并清理所有资源
   */
  function destroyChart(): void {
    stopCollection()
    stopPlayback()
    
    /** 防御性清理：确保所有定时器都被清除 */
    if (samplingTimer) {
      clearInterval(samplingTimer)
      samplingTimer = null
    }
    
    if (playbackTimer) {
      clearInterval(playbackTimer)
      playbackTimer = null
    }
    
    if (chartInstance) {
      chartInstance.dispose()
      chartInstance = null
    }
    
    window.removeEventListener('resize', handleResize)
  }

  onUnmounted(() => {
    destroyChart()
  })

  return {
    chartConfig,
    samplingConfig,
    channels,
    dataPoints,
    playback,
    isCollecting,
    chartType,
    dataPointCount,
    isPlaying,
    initChart,
    updateChart,
    addDataPoint,
    addDataPoints,
    parseAndAddDataPoints,
    startCollection,
    stopCollection,
    clearData,
    startPlayback,
    stopPlayback,
    pausePlayback,
    setChartType,
    setSamplingFrequency,
    queryHistory,
    exportData,
    downloadExport,
    destroyChart
  }
}
