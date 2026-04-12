import { RttWsServer } from './ws/wsServer.js'

const DEFAULT_PORT = 19022

const port = parseInt(process.env.RTT_BRIDGE_PORT ?? String(DEFAULT_PORT), 10)

// 打印启动信息
console.log('')
console.log('╔════════════════════════════════════════════════════════════╗')
console.log('║           QXC Serial RTT Bridge v1.0.0                     ║')
console.log('║     WebSocket Bridge for RTT Debug Probes                  ║')
console.log('╠════════════════════════════════════════════════════════════╣')
console.log(`║  WebSocket: ws://127.0.0.1:${port}                          ║`)
console.log('║  支持后端: probe-rs | OpenOCD | J-Link                      ║')
console.log('╠════════════════════════════════════════════════════════════╣')
console.log('║  使用方式:                                                 ║')
console.log('║  1. 访问 QXC Serial Web 应用                               ║')
console.log('║  2. 进入 RTT 调试页面                                       ║')
console.log('║  3. 配置后端参数后点击连接                                  ║')
console.log('╠════════════════════════════════════════════════════════════╣')
console.log('║  按 Ctrl+C 退出                                            ║')
console.log('╚════════════════════════════════════════════════════════════╝')
console.log('')

const server = new RttWsServer(port)

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n[RTT Bridge] 正在关闭...')
  server.close()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n[RTT Bridge] 正在关闭...')
  server.close()
  process.exit(0)
})

process.on('uncaughtException', (err) => {
  console.error('[RTT Bridge] 错误:', err.message)
})

process.on('unhandledRejection', (reason) => {
  console.error('[RTT Bridge] 未处理的错误:', reason)
})
