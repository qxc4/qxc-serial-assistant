# J-Link 纯 Web RTT/debug 研究诊断

## 当前结论

当前纯 Web 调试工作台可以识别 J-Link 设备，但不把完整 J-Link RTT/debug 包装为已完成能力。首版继续优先 ST-Link 和 CMSIS-DAP 路线。

## 路线判断

| 路线 | 状态 | 说明 |
| --- | --- | --- |
| 纯 Web J-Link 协议 | research | 需要独立 USB 命令层、内存访问、调试控制和 RTT 适配；当前不做逆向式承诺。 |
| SEGGER GDB Server | available-with-local-service | 官方桌面工具可提供 GDB/RTT 能力，但浏览器不能直接监听本地 TCP。 |
| 极小本地 relay | available-with-local-service | 可桥接本地 SEGGER 工具到浏览器接口，但会打破纯 Web 首版边界。 |
| J-Link SDK 授权集成 | requires-license | SDK 分发与集成需要 SEGGER 授权，不能直接打包进纯前端。 |

## 产品边界

- 检测到 J-Link 不代表设备故障。
- 当前不恢复 RTT Bridge 产品路线。
- 若未来必须支持桌面 gdb 直连，应新增极小 relay，而不是把旧 Bridge 路线并回主产品。
- 未授权 SDK 或逆向协议不会被标记为 `done`。
