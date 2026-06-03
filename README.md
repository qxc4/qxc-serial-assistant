<div align="center">

<br>

# QXC Serial

### 超联串口助手2.0预览版

**基于 Web Serial API 的下一代浏览器端串口调试工具**

无需安装桌面软件，打开浏览器即可调试串口

<br>

[![QXC Serial](https://img.shields.io/badge/QXC_Serial-v2.0-1081FF?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0yMCAyMGgtLTJhMiAyIDAgMCAxLTItMnYtNGEyIDIgMCAwIDEgMi0yaDR2LTRINmEyIDIgMCAwIDAtLTIgMnYxNmEyIDIgMCAwIDAgMiAyaDE0Ii8+PC9zdmc+&logoColor=white)](#)
![Vue.js 3](https://img.shields.io/badge/Vue_3-4FC08D?style=for-the-badge&logo=vue.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)

<br>

[![在线体验](https://img.shields.io/badge/-🚀_在线体验-1081FF?style=flat-square&logo=google-chrome&logoColor=white)](https://qxc-serial.top)
[![Vercel 镜像](https://img.shields.io/badge/-Vercel_镜像-000?style=flat-square&logo=vercel&logoColor=white)](https://qxc-serial-assistant.vercel.app)
[![快速开始](https://img.shields.io/badge/-快速开始-10B981?style=flat-square&logo=git&logoColor=white)](#-快速开始)
[![GitHub Stars](https://img.shields.io/github/stars/qxc4/qxc-serial-assistant?style=social)](https://github.com/qxc4/qxc-serial-assistant)
[![GitHub Forks](https://img.shields.io/github/forks/qxc4/qxc-serial-assistant?style=social)](https://github.com/qxc4/qxc-serial-assistant)

<br>

</div>

---

## 当前发布状态

QXC Serial 目前是纯浏览器单页应用，核心路线为 Web Serial + WebUSB：

| 模块 | 当前状态 |
|:----:|:-----|
| Serial | 已完成高密度工作台 UI、连接抽屉、虚拟日志、快捷命令、指令组、协议模板、会话录制与回放，并支持最多 4 个真实 Web Serial 会话 |
| Modbus | 已形成“构建请求 → 当前串口发送 → 接收响应 → 自动解析 → 历史导出”的闭环，并支持多请求轮询任务 |
| RTT / Debug | 纯 WebUSB 调试工作台，包含 RTT 日志、硬件自检、J-Link 能力诊断、SEGGER RTT 文件下载、变量/Flash/调试实验能力 |
| 工程结构 | 已按 feature/domain 拆分 Serial、Modbus、RTT 主要面板，保留 `debug-core` 作为浏览器端调试内核 |

> 本项目不再维护本地 RTT Bridge 路线。J-Link 完整 debug/RTT 直连目前显示为实验诊断能力，不会误标为已完全支持。

---

## 为什么选择 QXC Serial？

<table>
<tr>
<td width="50%">

### 🌐 零安装 · 纯浏览器
基于 Web Serial API，无需安装任何桌面软件或驱动程序。打开 Chrome / Edge 浏览器，插上串口设备，即可开始调试。

</td>
<td width="50%">

### ⚡ 极致性能
虚拟滚动列表支持 5 万条数据无卡顿，按钮响应 &lt;100ms，批量 DOM 更新 + RAF 节流，带来原生般的操作体验。

</td>
</tr>
<tr>
<td width="50%">

### 🔧 专业级功能
多编码支持 (UTF-8/ASCII/GBK/HEX)、Modbus 协议解析、指令组管理与版本控制、实时数据图表，满足专业调试需求。

</td>
<td width="50%">

### 📡 RTT 调试工作台
通过 WebUSB 直连调试探针，提供 RTT 日志、寄存器、内存、断点和 Flash 烧录实验能力。

</td>
</tr>
</table>

---

## ✨ 功能总览

<br>

<div align="center">

| 模块 | 核心功能 | 描述 |
|:----:|:--------:|:-----|
| 🔌 **串口通信** | Web Serial API | 浏览器原生串口支持，Chrome/Edge 89+ |
| | 完整配置 | 波特率、数据位、停止位、校验位全可调 |
| | 自动重连 | 断开后自动重连（最多 5 次），不丢失数据 |
| | 多端口会话 | 最多 4 个真实 Web Serial 会话，支持独立连接、日志、发送、清空和导出 |
| | 实时统计 | 收发字节数实时显示，掌握通信状态 |
| 📊 **数据显示** | 多编码格式 | UTF-8、ASCII、GBK、HEX 自由切换 |
| | 显示模式 | 仅接收 / 仅发送 / 混合模式 |
| | 时间戳 & 搜索 | 可选时间戳显示，支持内容搜索过滤 |
| ⚡ **指令系统** | 快捷指令 | 一键发送常用指令，支持循环定时发送 |
| | 协议模板 | AT、Modbus RTU、NMEA、STM32 Bootloader、自定义帧模板 |
| | 会话录制 | 录制 TX/RX 和串口配置，支持导出、导入和回放 |
| | 指令组管理 | 创建、保存、加载、另存为，版本控制 |
| | 执行控制 | 开始 / 暂停 / 停止，灵活控制指令执行 |
| 🛠️ **数据工具** | 数制转换 | 二进制 / 八进制 / 十进制 / 十六进制互转 |
| | ASCII 表 | 完整 ASCII 字符参考表 |
| | Modbus 工作台 | RTU / ASCII 构帧、当前串口直发、响应解析、多任务轮询 |
| | 数据图表 | 基于 ECharts 的实时数据可视化 |
| 📡 **RTT 调试** | WebUSB 直连 | RTT 日志 / 调试控制 / Flash 烧录实验能力 |
| | 高性能日志 | 虚拟滚动，5 万条日志流畅显示 |
| | 日志过滤 | 按级别 / 通道 / 关键词多维度过滤 |
| | 双向通信 | 向 MCU 发送命令，多通道支持 |
| | 硬件诊断 | 探针能力矩阵、硬件自检向导、J-Link 实验状态说明 |
| 🎨 **用户体验** | 主题切换 | 亮色 / 暗色 / 跟随系统 |
| | 国际化 | 中文 / English 双语支持 |
| | 快捷键 | 完整的键盘快捷键体系 |
| | 配置持久化 | 所有设置自动保存至本地 |

</div>

---

## 🚀 快速开始

### 在线使用

无需下载，直接访问：

> **[qxc-serial.top](https://qxc-serial.top)** — 主站
>
> **[qxc-serial-assistant.vercel.app](https://qxc-serial-assistant.vercel.app)** — Vercel 镜像

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/qxc4/qxc-serial-assistant.git
cd qxc-serial-assistant

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

### 运行测试

```bash
npm run test           # 运行测试
npm run test:coverage  # 生成覆盖率报告
```

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
|:------:|:-----|
| `Ctrl + Enter` | 发送数据 |
| `Ctrl + Shift + C` | 连接 / 断开串口 |
| `Ctrl + Shift + X` | 清空接收数据 |
| `Ctrl + S` | 保存当前指令组 |
| `Space` | 开始 / 暂停指令组执行 |
| `Escape` | 停止指令组 / 关闭面板 |
| `?` | 显示 / 隐藏帮助 |

---

## 📡 RTT 调试

RTT (Real Time Transfer) 是 SEGGER 提供的高速调试输出技术。本项目的 `/rtt` 页面已升级为纯浏览器调试工作台，首版通过 WebUSB 直连调试探针，不需要本地 Bridge 服务。

### 架构设计

```
┌─────────────────┐
│  Frontend (Vue)  │  浏览器端
└────────┬────────┘
         │ WebUSB
┌────────▼────────┐
│  Debug Probe     │  ST-Link / CMSIS-DAP*
└────────┬────────┘
         │ SWD
┌────────▼────────┐
│  Cortex-M Target │  RTT / Memory / Flash
└─────────────────┘
```

`*` CMSIS-DAP 支持按浏览器 WebUSB 能力和探针固件逐步完善。

### 使用步骤

1. 使用 Chrome/Edge 桌面版打开页面
2. 连接调试探针和目标板，确认目标程序已集成 SEGGER RTT
3. 在前端进入 RTT 调试页面
4. 点击「选择设备」并授权 WebUSB 访问
5. 配置 SWD 频率、RTT 扫描范围和 Flash 区域
6. 点击「连接」开始读取 RTT，可继续使用寄存器、内存、断点和烧录功能

### 调试工作台能力

| 能力 | 状态 |
|:----:|:-----|
| RTT Control Block 扫描 | 已支持 |
| RTT Up/Down 通道 | 已支持 |
| SEGGER RTT 源文件下载 | 已支持 |
| 硬件自检向导 | 已支持，含 Mock 预演和 JSON 诊断报告 |
| 探针能力矩阵 | 已支持，区分 ST-Link / CMSIS-DAP / J-Link 可用路线 |
| J-Link 诊断 | 已支持实验状态说明；完整纯 Web J-Link debug 尚未启用 |
| 寄存器批量刷新 | 已支持 |
| 内存 Hex 预览 | 已支持 |
| 硬件断点状态诊断 | 已支持 |
| Flash dry-run / erase / program / verify | 实验支持 |
| GDB-RSP 内核 | 内置命令核心，暂不暴露本地 TCP Server |

### 探针支持边界

| 探针 | 状态 | 说明 |
|:----:|:-----|:-----|
| ST-Link | 实验支持 | 纯 WebUSB 路线，RTT/debug/Flash 需要真实硬件验收 |
| CMSIS-DAP / DAPLink / PicoProbe | 实验支持 | 依赖浏览器 WebUSB 能力和探针固件兼容性 |
| J-Link | 诊断支持 | 当前提供能力矩阵和可行路线说明；完整协议层需要 SEGGER SDK/本地 GDB Server/relay 路线 |

---

## 🌐 部署

### Nginx

```nginx
server {
    listen 80;
    server_name qxc-serial.top;
    root /var/www/qxc-serial/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1000;
}
```

### Vercel

项目根目录创建 `vercel.json`：

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Netlify

项目根目录创建 `netlify.toml`：

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

## 💻 系统要求

| 要求 | 说明 |
|:----:|:-----|
| 浏览器 | Chrome 89+ / Edge 89+（需支持 Web Serial API） |
| 操作系统 | Windows 10+ / macOS 11+ / Linux |
| Node.js | 18+（仅本地开发和构建需要） |

---

## 🏗️ 项目结构

```
src/
├── features/                 # feature/domain 分层模块
│   ├── serial/               #   串口会话、协议模板、回放、快捷命令、指令组模型
│   ├── modbus/               #   Modbus 构帧/解析、轮询调度、流水线诊断
│   └── rtt/                  #   RTT 显示选项、调试诊断 UI 辅助
├── composables/              # 组合式函数
│   ├── useSerial.ts          #   串口通信核心（单例模式）
│   ├── useChart.ts           #   ECharts 数据图表
│   ├── useDataParse.ts       #   数据协议解析
│   ├── useCommandGroup.ts    #   指令组 Vue 适配层 & 执行控制
│   ├── useI18n.ts            #   国际化 (中/英)
│   ├── useWebUsbRtt.ts       #   WebUSB RTT / 调试探针
│   ├── useRttDebugWorkbench.ts # 调试工作台状态
│   ├── useFileSave.ts        #   文件保存
│   ├── useButtonOptimizer.ts #   按钮性能优化
│   └── usePerformanceMonitor.ts  # 性能监控
├── views/                    # 页面组件
│   ├── SerialView.vue        #   串口主界面
│   ├── ChartView.vue         #   数据图表
│   ├── ModbusView.vue        #   Modbus 解析
│   ├── RttView.vue           #   RTT 调试
│   ├── SettingsView.vue      #   设置
│   ├── AsciiView.vue         #   ASCII 表
│   ├── NumConverterView.vue  #   数制转换
│   └── ProfileView.vue       #   关于
├── components/               # 公共与页面组件
│   ├── VirtualList.vue       #   虚拟滚动列表
│   ├── serial/               #   Serial 连接抽屉、日志、发送、快捷命令、指令组面板
│   ├── modbus/               #   Modbus 请求构建/轮询面板
│   ├── rtt/                  #   RTT 顶部状态、右侧 tabs、过滤、资源、调试、Flash、J-Link 诊断面板
│   ├── DonateModal.vue       #   赞助弹窗
│   └── SaveStatusToast.vue   #   保存状态提示
├── locales/                  # 自研 i18n 语言包
│   ├── zh-CN.ts
│   └── en-US.ts
├── stores/                   # Pinia 状态管理
│   └── settings.ts           #   全局设置 (localStorage 持久化)
├── debug-core/               # 浏览器端调试内核
│   ├── cortexMDebugTarget.ts #   Cortex-M 控制、寄存器、断点
│   ├── rttCore.ts            #   RTT 控制块和 ring buffer
│   ├── flashPlanner.ts       #   Flash dry-run / range planner
│   ├── flashProgrammer.ts    #   擦除、写入、校验编排
│   └── gdbRspCore.ts         #   GDB-RSP 兼容命令内核
├── types/                    # TypeScript 类型定义
├── utils/                    # 工具函数
├── data/                     # 静态数据
└── router/                   # 路由配置
```

---

## 🛠️ 技术栈

### 前端

| 技术 | 版本 | 用途 |
|:----:|:----:|:-----|
| [Vue.js](https://vuejs.org/) | 3.5+ | 渐进式前端框架 |
| [TypeScript](https://www.typescriptlang.org/) | 5.9+ | 类型安全 |
| [Vite](https://vite.dev/) | 8.x | 下一代构建工具 |
| [Tailwind CSS](https://tailwindcss.com/) | 4.x | 原子化 CSS 框架 |
| [Pinia](https://pinia.vuejs.org/) | 3.x | 状态管理 |
| [ECharts](https://echarts.apache.org/) | 6.x | 数据可视化 |
| [Lucide](https://lucide.dev/) | 1.x | 图标库 |
| [VueUse](https://vueuse.org/) | 14.x | 组合式工具集 |

### 性能优化策略

| 策略 | 说明 |
|:----:|:-----|
| 虚拟滚动 | 大数据量列表仅渲染可视区域 |
| ECharts Tree-shaking | 按需导入图表组件，减小包体积 |
| RAF 节流 | requestAnimationFrame 级别的操作节流 |
| 批量 DOM 更新 | BatchDOMUpdater 合并多次 DOM 操作 |
| Vite 分包 | vue-vendor / ui-vendor / echarts-vendor 独立 chunk |
| Keep-alive | 路由级组件缓存，避免重复渲染 |

---

## 👨‍💻 开发者

<div align="center">

**乔鑫超**

*全栈开发者 & 嵌入式爱好者*

[![GitHub](https://img.shields.io/badge/GitHub-qxc4-181717?style=flat-square&logo=github)](https://github.com/qxc4)
[![Gitee](https://img.shields.io/badge/Gitee-乔鑫超-C71D23?style=flat-square&logo=gitee)](https://gitee.com/qiao-xinchao)

</div>

---

## 📄 许可证

本项目基于 [MIT](LICENSE) 协议开源。

---

<div align="center">

**如果这个项目对您有帮助，请给一个 ⭐ Star 支持一下！**

[![Star History Chart](https://api.star-history.com/svg?repos=qxc4/qxc-serial-assistant&type=Date)](https://star-history.com/#qxc4/qxc-serial-assistant&Date)

<br>

*Made with ❤️ by Qiao Xinchao*

</div>
