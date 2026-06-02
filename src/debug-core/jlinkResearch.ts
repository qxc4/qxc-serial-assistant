export type JLinkRouteStatus = 'blocked' | 'available-with-local-service' | 'requires-license' | 'research'

export interface JLinkSupportRoute {
  key: 'pure-web-protocol' | 'segger-gdb-server' | 'local-relay' | 'sdk-integration'
  title: string
  status: JLinkRouteStatus
  detail: string
  action: string
}

export interface JLinkDiagnosticReport {
  title: string
  summary: string
  detected: boolean
  routes: JLinkSupportRoute[]
  warnings: string[]
}

export const JLINK_SUPPORT_ROUTES: JLinkSupportRoute[] = [
  {
    key: 'pure-web-protocol',
    title: '纯 Web J-Link 协议',
    status: 'research',
    detail: '需要独立 J-Link USB 命令层和目标访问适配；当前不做逆向式承诺。',
    action: '保留实验诊断，优先完成 ST-Link/CMSIS-DAP 可发布路径。',
  },
  {
    key: 'segger-gdb-server',
    title: 'SEGGER GDB Server',
    status: 'available-with-local-service',
    detail: '官方桌面工具可提供 GDB/RTT 能力，但浏览器不能直接监听本地 TCP。',
    action: '未来若必须桌面 gdb 直连，应使用极小本地 relay，而不是恢复旧 RTT Bridge 产品线。',
  },
  {
    key: 'local-relay',
    title: '极小本地 relay',
    status: 'available-with-local-service',
    detail: '可把本地 SEGGER 工具或 GDB Server 转为浏览器可访问接口，但会打破纯 Web 首版边界。',
    action: '仅作为未来可选路线，当前 UI 只做说明，不新增服务依赖。',
  },
  {
    key: 'sdk-integration',
    title: 'J-Link SDK 授权集成',
    status: 'requires-license',
    detail: 'SEGGER SDK 需要授权和分发许可，不能直接打包进纯浏览器开源前端。',
    action: '如需商业集成，先确认授权条款和可分发形态。',
  },
]

export function createJLinkDiagnosticReport(detected: boolean): JLinkDiagnosticReport {
  return {
    title: detected ? '已检测到 J-Link' : 'J-Link 支持状态',
    summary: detected
      ? '设备可被识别不代表当前纯 Web RTT/debug 已支持；这是协议路线边界，不是探针故障。'
      : '当前工作台展示 J-Link 可行路线，但首版不启用完整 J-Link RTT/debug。',
    detected,
    routes: JLINK_SUPPORT_ROUTES,
    warnings: [
      '首版不恢复 RTT Bridge，也不把桌面 GDB 直连作为纯 Web 功能承诺。',
      '未授权 SDK 或逆向协议不会被包装成已完成能力。',
    ],
  }
}
