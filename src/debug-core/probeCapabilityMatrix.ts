import type { WebUsbProbeType } from '../types/rtt'

export type ProbeCapabilityState = 'ok' | 'warn' | 'idle'

export interface ProbeCapabilityItem {
  key: 'usb-detect' | 'rtt' | 'debug' | 'flash'
  label: string
  state: ProbeCapabilityState
  detail: string
}

export interface ProbeCapabilitySummary {
  label: string
  tone: ProbeCapabilityState
  detail: string
}

export interface ProbeCapabilityMatrix {
  summary: ProbeCapabilitySummary
  capabilities: ProbeCapabilityItem[]
  warning: string
}

type SupportedProbeType = WebUsbProbeType | null | undefined

const CAPABILITY_LABELS: Record<ProbeCapabilityItem['key'], string> = {
  'usb-detect': 'USB 授权',
  rtt: 'RTT 日志',
  debug: '调试控制',
  flash: 'Flash 烧录',
}

export function createProbeCapabilityMatrix(probeType: SupportedProbeType): ProbeCapabilityMatrix {
  if (!probeType) {
    return createIdleMatrix()
  }

  if (probeType === 'jlink') {
    return {
      summary: {
        label: 'J-Link',
        tone: 'warn',
        detail: '可被 WebUSB 检测；完整 J-Link RTT/debug 协议尚未启用',
      },
      capabilities: [
        item('usb-detect', 'ok', '可在浏览器授权列表中出现'),
        item('rtt', 'warn', '需要独立 J-Link 协议层，当前未启用'),
        item('debug', 'warn', 'halt/step/register 需要 J-Link 命令适配'),
        item('flash', 'warn', 'SEGGER WebUSB 资料主要覆盖 OB 烧录，未接入通用烧录链'),
      ],
      warning: '检测到 J-Link 时，当前不是设备故障；这是纯网页工作台尚未实现完整 J-Link 协议层。',
    }
  }

  if (probeType === 'stlink-v2' || probeType === 'stlink-v3') {
    return {
      summary: {
        label: probeType === 'stlink-v3' ? 'ST-Link V3' : 'ST-Link V2',
        tone: 'ok',
        detail: '当前 WebUSB 路径支持 RTT / 调试 / 内存访问，Flash 按芯片族逐步覆盖',
      },
      capabilities: [
        item('usb-detect', 'ok', '已纳入 WebUSB 探针过滤器'),
        item('rtt', 'ok', '通过目标内存扫描 RTT Control Block'),
        item('debug', 'ok', '支持基础 halt/resume/step/register/memory'),
        item('flash', 'warn', '可用性取决于芯片族和 Flash algorithm'),
      ],
      warning: '',
    }
  }

  if (probeType === 'cmsis-dap' || probeType === 'daplink' || probeType === 'picoprobe') {
    return {
      summary: {
        label: 'CMSIS-DAP',
        tone: 'ok',
        detail: '推荐路径：RTT / 调试 / 内存访问可走纯网页内核',
      },
      capabilities: [
        item('usb-detect', 'ok', 'DAPLink / PicoProbe / CMSIS-DAP 兼容探针'),
        item('rtt', 'ok', '通过 DAP 内存访问读取 RTT ring buffer'),
        item('debug', 'ok', 'CMSIS-DAP 可覆盖 Cortex-M 基础调试'),
        item('flash', 'warn', '烧录能力按 DAPLink 或芯片族能力逐步覆盖'),
      ],
      warning: '',
    }
  }

  return {
    summary: {
      label: '未知探针',
      tone: 'warn',
      detail: '可尝试授权，但能力无法预判',
    },
    capabilities: [
      item('usb-detect', 'warn', '设备不在已知探针矩阵内'),
      item('rtt', 'warn', '需要先验证内存访问能力'),
      item('debug', 'warn', '需要确认协议兼容性'),
      item('flash', 'warn', '不建议直接烧录'),
    ],
    warning: '未知探针可能出现在授权列表中，但不代表 RTT/debug 已支持。',
  }
}

function createIdleMatrix(): ProbeCapabilityMatrix {
  return {
    summary: {
      label: '未选择探针',
      tone: 'idle',
      detail: '选择 USB 探针后显示能力矩阵',
    },
    capabilities: [
      item('usb-detect', 'idle', '等待授权'),
      item('rtt', 'idle', '等待探针'),
      item('debug', 'idle', '等待探针'),
      item('flash', 'idle', '等待探针'),
    ],
    warning: '',
  }
}

function item(
  key: ProbeCapabilityItem['key'],
  state: ProbeCapabilityState,
  detail: string,
): ProbeCapabilityItem {
  return {
    key,
    label: CAPABILITY_LABELS[key],
    state,
    detail,
  }
}
