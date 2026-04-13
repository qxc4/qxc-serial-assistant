<div align="center">

<br>

# QXC Serial

### 超联串口助手

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

### 📡 RTT 实时调试
支持 probe-rs / OpenOCD / J-Link 多后端，实时读取嵌入式设备 RTT 日志，双向通信，多通道支持。

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
| | 实时统计 | 收发字节数实时显示，掌握通信状态 |
| 📊 **数据显示** | 多编码格式 | UTF-8、ASCII、GBK、HEX 自由切换 |
| | 显示模式 | 仅接收 / 仅发送 / 混合模式 |
| | 时间戳 & 搜索 | 可选时间戳显示，支持内容搜索过滤 |
| ⚡ **指令系统** | 快捷指令 | 一键发送常用指令，支持循环定时发送 |
| | 指令组管理 | 创建、保存、加载、另存为，版本控制 |
| | 执行控制 | 开始 / 暂停 / 停止，灵活控制指令执行 |
| 🛠️ **数据工具** | 数制转换 | 二进制 / 八进制 / 十进制 / 十六进制互转 |
| | ASCII 表 | 完整 ASCII 字符参考表 |
| | Modbus 解析 | RTU / ASCII 协议实时解析 |
| | 数据图表 | 基于 ECharts 的实时数据可视化 |
| 📡 **RTT 调试** | 多后端支持 | probe-rs / OpenOCD / J-Link |
| | 高性能日志 | 虚拟滚动，5 万条日志流畅显示 |
| | 日志过滤 | 按级别 / 通道 / 关键词多维度过滤 |
| | 双向通信 | 向 MCU 发送命令，多通道支持 |
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

RTT (Real Time Transfer) 是 SEGGER 提供的高速调试输出技术，本项目支持通过多种后端进行 RTT 调试。

### 架构设计

```
┌─────────────────┐
│  Frontend (Vue)  │  浏览器端
└────────┬────────┘
         │ WebSocket (ws://localhost:19022)
┌────────▼────────┐
│  RTT Bridge      │  Node.js 后端
│  (适配器模式)    │
└──┬─────┬──────┬─┘
   │     │      │
   ▼     ▼      ▼
probe-rs OpenOCD J-Link   调试探针适配器
   │     │      │
   └─────┼──────┘
         │ SWD / JTAG
┌────────▼────────┐
│  MCU Target      │  STM32 / nRF / ESP32...
└─────────────────┘
```

### 支持的后端

| 后端 | 说明 | 连接方式 |
|:----:|:-----|:---------|
| `probe-rs` | 开源调试工具，支持多种探针 | 本地子进程 |
| `OpenOCD` | 通过 OpenOCD 的 RTT 服务器连接 | TCP (默认 9090) |
| `J-Link` | 通过 J-Link 调试器的 RTT 功能 | TCP (默认 19021) |

### 启动 RTT Bridge

```bash
cd rtt-bridge
npm install
npm run dev    # 开发模式
# 或
npm run build && npm start  # 生产模式
```

### 使用步骤

1. 安装 [probe-rs](https://probe.rs/) 工具链（如使用 probe-rs 后端）
2. 连接调试探针（ST-Link / J-Link / CMSIS-DAP）
3. 启动 RTT Bridge 后端服务
4. 在前端选择 RTT 调试页面
5. 选择后端类型并配置芯片型号
6. 点击「刷新探针」检测连接的探针
7. 点击「连接」开始调试

### RTT Bridge 消息协议

**客户端 → 服务端**

| 类型 | 说明 |
|:----:|:-----|
| `connect` | 建立 RTT 连接 |
| `disconnect` | 断开 RTT 连接 |
| `send` | 发送数据到 MCU |
| `list_probes` | 获取可用探针列表 |

**服务端 → 客户端**

| 类型 | 说明 |
|:----:|:-----|
| `connected` | RTT 连接成功 |
| `disconnected` | RTT 连接断开 |
| `rtt_data` | RTT 日志数据 |
| `error` | 错误信息 |
| `probe_list` | 探针列表 |
| `channels` | RTT 通道列表 |

### 打包 RTT Bridge

```bash
npm run pkg        # 打包当前平台
npm run pkg:win    # 仅 Windows
npm run pkg:all    # 全平台 (Windows / macOS / Linux)
```

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
| Node.js | 18+（仅 RTT Bridge 需要） |

---

## 🏗️ 项目结构

```
src/
├── composables/              # 组合式函数
│   ├── useSerial.ts          #   串口通信核心（单例模式）
│   ├── useChart.ts           #   ECharts 数据图表
│   ├── useDataParse.ts       #   数据协议解析
│   ├── useCommandGroup.ts    #   指令组管理 & 执行引擎
│   ├── useI18n.ts            #   国际化 (中/英)
│   ├── useRtt.ts             #   RTT 调试
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
├── components/               # 公共组件
│   ├── VirtualList.vue       #   虚拟滚动列表
│   ├── DonateModal.vue       #   赞助弹窗
│   └── SaveStatusToast.vue   #   保存状态提示
├── stores/                   # Pinia 状态管理
│   ├── settings.ts           #   全局设置 (localStorage 持久化)
│   └── rtt.ts                #   RTT 日志存储 (批量缓冲)
├── services/                 # 服务层
│   └── rttService.ts         #   RTT WebSocket 客户端
├── types/                    # TypeScript 类型定义
├── utils/                    # 工具函数
├── data/                     # 静态数据
└── router/                   # 路由配置

rtt-bridge/                   # RTT Bridge 后端 (独立子项目)
├── src/
│   ├── core/adapter.ts       #   适配器抽象基类
│   ├── adapters/             #   探针适配器
│   │   ├── probe_rs.ts       #     probe-rs
│   │   ├── openocd.ts        #     OpenOCD
│   │   └── jlink.ts          #     J-Link
│   ├── services/rttManager.ts#   RTT 连接管理
│   ├── ws/wsServer.ts        #   WebSocket 服务器
│   └── index.ts              #   入口文件
├── package.json
└── tsconfig.json
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

### 后端 (RTT Bridge)

| 技术 | 版本 | 用途 |
|:----:|:----:|:-----|
| [Node.js](https://nodejs.org/) | 18+ | 运行时环境 |
| [TypeScript](https://www.typescriptlang.org/) | 5.x | 类型安全 |
| [ws](https://github.com/websockets/ws) | 8.x | WebSocket 服务器 |

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
