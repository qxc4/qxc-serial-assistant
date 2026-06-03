# QXC Serial 功能缺失审计

状态标记：
- `done`：已实现并可在当前 Web 应用中使用。
- `experimental`：已有实现或 UI，但依赖硬件/协议适配，仍需实测扩展。
- `missing`：用户自然会期待，但当前未实现或入口不可用。
- `blocked-by-browser`：浏览器安全模型限制，纯网页首版不能直接实现。
- `needs-hardware`：需要真实设备验收，单元测试不足以确认。

## Serial

| 功能 | 状态 | 备注 |
| --- | --- | --- |
| Web Serial 连接/断开 | done | 使用浏览器原生授权，连接状态跨路由保持。 |
| 自动重连 | done | `useSerial` 内部已有重试状态和次数。 |
| 波特率/数据位/停止位/校验位 | done | 支持常用和高速波特率，自定义波特率已支持。 |
| UTF-8/ASCII/GBK/HEX 收发 | done | 编码配置已持久化。 |
| HEX 发送校验 | done | 非法 HEX 有提示。 |
| 行尾自动追加 | done | 支持 none/rn/r/n/custom hex。 |
| 日志搜索/过滤/自动滚动/导出 | done | 使用虚拟列表承载大日志。 |
| 数据解析面板 | done | 支持 Modbus、HEX/ASCII 显示、自定义帧。 |
| 会话诊断 | done | 顶部显示 TX/RX 条目、静默时间、最近响应状态、平均发送间隔。 |
| 协议模板库 | done | 内置 AT、Modbus RTU、NMEA、STM32 bootloader、自定义帧模板，可追加快捷命令和解析建议。 |
| 会话录制与回放 | done | 支持录制 RX/TX、导出/导入 `.qxc-session.json`、按时间轴 TX 回放和模拟 RX/TX 预览。 |
| 快捷命令 | done | 支持启用、HEX、延迟、批量发送、循环发送。 |
| 指令组/版本/恢复点 | done | 功能完整；指令组右侧 UI 已拆为 `SerialCommandGroupPanel`，页面只保留事件连线。 |
| 快捷键帮助和自定义快捷键 | done | 与设置页联动。 |
| 多串口会话架构 | experimental | 已新增 `SerialSessionController`、Serial 顶部会话栏、独立 `SerialSessionRuntime`、mock transport 和 Web Serial transport；默认主流程仍使用稳定单例连接。 |
| SerialView 架构拆分 | done | 已抽出会话、录制回放、快捷命令、解析面板 composable，并拆出连接抽屉、顶部工具栏、日志、发送区、中间工具栏、快捷命令、指令组和解析结果组件；真实多串口仍按独立架构项跟踪。 |
| 蓝牙串口 | missing | 当前仅显示 coming soon。 |

## Modbus

| 功能 | 状态 | 备注 |
| --- | --- | --- |
| RTU/ASCII 模式 | done | 构帧和解析均支持。 |
| 功能码 01/02/03/04/05/06/15/16 | done | 支持读写常见线圈/寄存器。 |
| CRC/LRC/多校验显示 | done | 校验信息随结果展示。 |
| 寄存器类型解析 | done | uint/int/float 与字节序已抽到 feature 模块测试。 |
| 请求-响应流水线布局 | done | 左请求、中响应、右历史。 |
| Modbus 请求构建器组件化 | done | 请求参数、单帧轮询和多任务队列已拆为 `ModbusRequestPanel`，页面保留发送/监听/调度状态。 |
| 流水线诊断 | done | 显示响应总数、成功率、失败数、异常帧和轮询响应差值。 |
| 历史导出 TXT/CSV | done | CSV 兼容 Excel。 |
| 串口直发 Modbus 帧 | done | Modbus 页可复用当前 Web Serial 连接发送构建帧。 |
| 批量轮询/定时请求 | done | 支持多请求任务列表、串行发送、响应匹配、超时、失败重试、任务导出/导入、覆盖/追加导入、复制任务、清空统计和结果筛选。 |

## RTT / Debug

| 功能 | 状态 | 备注 |
| --- | --- | --- |
| WebUSB 探针授权 | experimental | Chrome/Edge 桌面端目标。 |
| ST-Link 识别/基础访问 | experimental | 需要硬件回归确认。 |
| CMSIS-DAP / DAPLink / PicoProbe | experimental | 已引入 dapjs 路线，仍需硬件矩阵验收。 |
| J-Link 能力矩阵与实验诊断 | done | 明确提示完整 J-Link 协议未启用，新增资源页路线说明和 `docs/jlink-research.md`，避免误判设备故障。 |
| RTT Control Block 扫描 | experimental | 纯 Web 内存扫描链路已有实现。 |
| RTT Up/Down 通道 | experimental | 需要目标固件和探针实测。 |
| RTT 硬件验收向导 | done | 支持真实自检和 Mock 预演，覆盖浏览器、探针、目标识别、RAM 读写、RTT 通道和报告导出；真实结果仍需硬件。 |
| 多通道过滤/导出/暂停 | done | UI 和日志存储已支持。 |
| SEGGER RTT 源码下载 | done | 支持常用 `SEGGER_RTT.c/h` 等文件下载。 |
| halt/resume/reset/step | experimental | UI 和内核链路已有，依赖探针适配。 |
| 寄存器/内存查看 | experimental | 增加寄存器批量刷新状态；需要目标连接后验证。 |
| 断点 | experimental | Cortex-M FPB 路线已有基础，增加槽位诊断；需硬件验收。 |
| 变量查看 | experimental | ELF symbol 基础支持，新增 PC 函数定位、primitive/best-effort 摘要和复合变量标注；完整 DWARF 复杂变量仍 best-effort。 |
| Flash dry-run/erase/program/verify | experimental | STM32F1/F4 可执行路径保留；G0/G4/H7 已补 profile、dry-run 范围规划和 unsupported 诊断，真实擦除算法需硬件扩展。 |
| GDB-RSP 内核 | experimental | 内置命令核心，不暴露 TCP server。 |
| 硬件 mock 集成测试 | done | 已提供 mock probe/memory/flash 基座，覆盖 RTT 扫描、Up/Down、RAM 读写和 Flash verify。 |
| RTT 工作台组件化 | experimental | 顶部状态/配置栏已拆为 `RttWorkbenchHeader`；右侧 tabs、日志区和硬件自检仍需继续拆分。 |
| 桌面 GDB 直连 | blocked-by-browser | 浏览器不能监听本地 TCP；需要未来极小 relay 才能实现。 |

## Shell / Chart / Tools

| 功能 | 状态 | 备注 |
| --- | --- | --- |
| Shell 命令输入/历史/补全 | done | 面向串口设备的交互终端。 |
| Shell 危险命令确认 | done | 设置项可控。 |
| Shell 环境变量 | done | 支持命令引用。 |
| Chart 实时数据采集 | done | ECharts 按需导入。 |
| Chart 通道配置/回放 | done | 功能较完整，后续可拆 feature 模块。 |
| ASCII 表 | done | 工具页可用。 |
| 数制转换 | done | 工具页可用。 |

## Settings / Profile / Global

| 功能 | 状态 | 备注 |
| --- | --- | --- |
| 主题/语言 | done | 支持系统/浅色/深色，中英文。 |
| 串口默认值 | done | 持久化到 `qxc-serial-settings`。 |
| 快捷键配置 | done | 可编辑和重置。 |
| 配置导入/导出 | done | 白名单导入，保持默认值补全。 |
| 全局命令面板 | done | Ctrl/Cmd+K 搜索页面和操作。 |
| 开发者信息/反馈/打赏 | done | 入口完整。 |
| 自动发布兼容 | done | GitHub Pages base path 构建已作为验收命令。 |

## 发布阻塞项

- `missing` 但非阻塞：蓝牙串口。
- `experimental` 需硬件验收：纯 Web RTT、调试控制、变量查看、Flash 烧录、ST-Link/CMSIS-DAP 适配。
- `blocked-by-browser` 明确边界：桌面 GDB 直连不可作为纯 Web 首版承诺。

## 最近发布证据

- `1d88ac5`：Modbus 构建帧可通过当前串口连接直发，串口 RX 自动进入响应解析流水线。
- `260f6bb`：Modbus 当前帧轮询控制，支持间隔、次数、无限轮询和失败停止。
- `04ddea8`：Modbus 流水线诊断摘要，覆盖成功率、异常帧和轮询响应差值。
- `280a406`：RTT 调试控件增加寄存器刷新状态和断点槽位诊断。
- `18b7e18`：Serial 顶部会话诊断，覆盖 TX/RX、静默时间、最近响应和平均发送间隔。
- 当前轮次：Modbus 多请求轮询任务，覆盖任务列表、串行调度、响应匹配、超时重试和任务导出。
- 当前轮次：RTT 硬件验收向导，覆盖固定步骤、Mock 预演、真实自检入口和 JSON 报告导出。
- 当前轮次：硬件 mock 集成测试基座，覆盖 ProbeDriver、MemoryAccess、RTT session 和 Flash backend。
- 当前轮次：Serial 协议模板库，覆盖 AT、Modbus、NMEA、STM32 bootloader 和自定义帧快捷命令生成。
- 当前轮次：Serial 会话录制与回放，覆盖 `.qxc-session.json` 导入导出、TX 原始字节回放和模拟日志时间线。
- 当前轮次：RTT 变量查看增强，覆盖 ELF 函数/对象符号摘要、PC 所在函数定位和复合变量 best-effort 标注。
- 当前轮次：Flash 芯片族扩展，覆盖 STM32G0/G4/H7 profile、识别关键字、默认范围、dry-run 规划和未支持擦除算法诊断。
- 当前轮次：J-Link 研究诊断，覆盖纯 Web 协议、SEGGER GDB Server、本地 relay、SDK 授权集成四条路线说明。
- 当前轮次：Serial 架构拆分完成主要 UI 收敛，`SerialView.vue` 降至约 34KB，连接抽屉、快捷命令、指令组、日志、发送区和解析结果均已组件化。
- 当前轮次：多串口架构 groundwork，新增 SerialSessionController，覆盖默认会话兼容、最多 4 会话、激活/重命名/删除和统计隔离。
- 当前轮次：Serial 多会话 UI 接入，顶部会话栏显示默认真实连接和占位会话槽，默认会话统计跟随当前 Web Serial 单例。
- 当前轮次：`useCommandGroup` 抽出纯模型 helper，覆盖空组/空指令、旧数据 version 归一化、执行统计和进度计算。
- 当前轮次：Modbus 请求构建器拆为 `ModbusRequestPanel`，保留构帧、当前串口发送、单帧轮询、多任务队列和响应流水线闭环。
- 当前轮次：Modbus 多请求轮询补齐任务导入，支持读取导出的 JSON、字段归一化、重置运行统计和非法文件诊断。
- 当前轮次：Modbus 高级调度体验增强，支持覆盖/追加导入策略、复制任务、单任务统计清零和轮询历史状态/关键字筛选。
- 当前轮次：RTT 顶部工作台拆为 `RttWorkbenchHeader`，保留纯 WebUSB 路线、J-Link 诊断、SEGGER RTT 下载、硬件自检和 Flash dry-run/verify 能力。
- 当前轮次：RTT 硬件验收报告增强，支持失败原因分组和一键复制诊断摘要，方便远程定位 WebUSB/探针/RTT 扫描问题。
- 当前轮次：Serial 多串口预研推进到运行时层，新增独立会话 runtime、mock transport、Web Serial transport 和最多 4 会话 manager 测试。
- 当前轮次：项目清理移除重复 agent 指南 `CLAUDE.md`、本地工具目录 `.claude/`，并清理本地产物 `dist/`、`coverage/`、`.superpowers/`。
