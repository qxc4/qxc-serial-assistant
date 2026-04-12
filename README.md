# QXC Serial 超联串口助手

<div align="center">

![QXC Serial](https://img.shields.io/badge/QXC-Serial-1081FF?style=for-the-badge&logo=electron&logoColor=white)
![Vue.js 3](https://img.shields.io/badge/Vue_3-4FC08D?style=for-the-badge&logo=vue.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

### 🔧 基于 Web Serial API 的现代浏览器端串口调试工具

*跨平台支持 | 多编码格式 | 指令组管理 | RTT调试 | 数据可视化*

[![在线体验](https://img.shields.io/badge/-在线体验-1081FF?style=flat&logo=google-chrome&logoColor=white)](#-在线体验)
[![快速开始](https://img.shields.io/badge/-快速开始-10B981?style=flat&logo=git&logoColor=white)](#-快速开始)
[![GitHub Stars](https://img.shields.io/github/stars/qxc4/qxc-serial-assistant?style=social)](https://github.com/qxc4/qxc-serial-assistant)
[![GitHub Forks](https://img.shields.io/github/forks/qxc4/qxc-serial-assistant?style=social)](https://github.com/qxc4/qxc-serial-assistant)

</div>

---

## 📋 目录

- [🌐 在线体验](#-在线体验)
- [✨ 功能特性](#-功能特性)
- [⌨️ 快捷键](#️-快捷键)
- [🚀 快速开始](#-快速开始)
- [📡 RTT 调试](#-rtt-调试)
- [🌐 Web 部署](#-web-部署)
- [💻 系统要求](#-系统要求)
- [🏗️ 项目结构](#️-项目结构)
- [🛠️ 技术栈](#️-技术栈)
- [👨‍💻 开发者](#-开发者)
- [📄 许可证](#-许可证)
- [🙏 感谢](#-感谢)

---

## 🌐 在线体验

| 🔗 主域名 | 🔗 Vercel 镜像 |
|:----------:|:--------------:|
| [qxc-serial.top](https://qxc-serial.top) | [qxc-serial-assistant.vercel.app](https://qxc-serial-assistant.vercel.app) |

---

## ✨ 功能特性

### 🔌 串口通信

| 功能 | 说明 |
|:-----|:-----|
| `Web Serial API` | 浏览器原生支持，Chrome/Edge 89+ |
| `多波特率` | 预设常用波特率 + 自定义输入 |
| `完整配置` | 数据位、停止位、校验位可调 |
| `自动重连` | 断开后自动重连（最多5次） |
| `实时统计` | 收发字节数实时显示 |

### 📊 数据显示

| 功能 | 说明 |
|:-----|:-----|
| `多编码` | UTF-8、ASCII、GBK、HEX |
| `显示模式` | 仅接收 / 仅发送 / 混合 |
| `时间戳` | 可选显示数据时间戳 |
| `自动滚动` | 数据自动滚动到最新 |
| `搜索功能` | 支持数据内容搜索 |

### ⚡ 指令功能

| 功能 | 说明 |
|:-----|:-----|
| `快捷指令` | 快速发送常用指令 |
| `循环发送` | 支持定时循环发送 |
| `指令组` | 创建、保存、加载、另存为 |
| `执行控制` | 开始/暂停/停止执行 |

### 🛠️ 数据工具

| 功能 | 说明 |
|:-----|:-----|
| `数制转换` | 二进制/八进制/十进制/十六进制 |
| `ASCII 表` | 完整 ASCII 字符参考 |
| `Modbus 解析` | RTU/ASCII 协议解析 |
| `数据图表` | 实时数据可视化 |
| `RTT 调试` | 实时传输日志调试 |

### 🎨 用户体验

| 功能 | 说明 |
|:-----|:-----|
| `主题切换` | 亮色/暗色模式 |
| `国际化` | 中英文双语 |
| `快捷键` | 完整的键盘快捷键 |
| `配置持久化` | 自动保存用户设置 |

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
|:-------|:-----|
| `Ctrl + Enter` | 发送数据 |
| `Ctrl + Shift + C` | 连接/断开串口 |
| `Ctrl + Shift + X` | 清空接收数据 |
| `Ctrl + S` | 保存当前指令组 |
| `Space` | 开始/暂停指令组 |
| `Escape` | 停止指令组 / 关闭面板 |
| `?` | 显示/隐藏帮助 |

---

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

### 运行测试

```bash
npm run test
```

---

## 📡 RTT 调试

RTT (Real Time Transfer) 是 SEGGER 提供的高速调试输出技术，本项目支持通过多种后端进行 RTT 调试。

### 支持的后端

| 后端 | 说明 |
|:-----|:-----|
| `probe-rs` | 开源调试工具，支持多种调试探针 |
| `OpenOCD` | 通过 OpenOCD 的 RTT 服务器连接 |
| `J-Link` | 通过 J-Link 调试器的 RTT 功能 |

### 启动 RTT Bridge

```bash
cd rtt-bridge
npm install
npm run dev
```

RTT Bridge 默认监听 `ws://localhost:19022`。

### 使用步骤

1. 启动 RTT Bridge 后端服务
2. 在前端选择 RTT 调试页面
3. 选择后端类型并配置参数
4. 点击连接开始调试

---

## 🌐 Web 部署

### 静态部署

构建后的 `dist` 目录可直接部署到任何静态服务器：

```bash
npm run build
```

### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name qxc-serial.top;
    root /var/www/qxc-serial/dist;
    index index.html;

    # SPA 路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1000;
}
```

### Vercel 部署

项目根目录创建 `vercel.json`：

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Netlify 部署

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
| 浏览器 | Chrome 89+ / Edge 89+ |
| 系统 | Windows 10+ / macOS 11+ / Linux |

---

## 🏗️ 项目结构

```
src/
├── composables/           # 组合式函数
│   ├── useSerial.ts       # 串口通信
│   ├── useChart.ts        # 数据图表
│   ├── useDataParse.ts    # 数据解析
│   ├── useCommandGroup.ts # 指令组
│   ├── useI18n.ts         # 国际化
│   ├── useRtt.ts          # RTT 调试
│   └── useFileSave.ts     # 文件保存
├── views/                 # 页面组件
│   ├── SerialView.vue     # 串口主界面
│   ├── ChartView.vue      # 数据图表
│   ├── ModbusView.vue     # Modbus解析
│   ├── RttView.vue        # RTT调试
│   ├── SettingsView.vue   # 设置页面
│   ├── ProfileView.vue    # 开发者
│   ├── AsciiView.vue      # ASCII表
│   └── NumConverterView.vue # 数制转换
├── components/             # 公共组件
├── stores/                # Pinia 状态
│   ├── settings.ts        # 设置存储
│   └── rtt.ts             # RTT 存储
├── services/              # 服务层
│   └── rttService.ts      # RTT WebSocket 服务
├── types/                 # TypeScript 类型
└── utils/                 # 工具函数

rtt-bridge/                # RTT Bridge 后端
├── src/
│   ├── adapters/          # 调试探针适配器
│   │   ├── probe_rs.ts    # probe-rs 适配器
│   │   ├── openocd.ts     # OpenOCD 适配器
│   │   └── jlink.ts       # J-Link 适配器
│   ├── services/          # 服务
│   │   └── rttManager.ts  # RTT 管理器
│   └── ws/                # WebSocket 服务
│       └── wsServer.ts    # WebSocket 服务器
└── package.json
```

---

## 🛠️ 技术栈

| 技术 | 版本 | 用途 |
|:----:|:----:|:-----|
| Vue.js | 3.5+ | 前端框架 |
| TypeScript | 5.x | 开发语言 |
| Vite | 8.x | 构建工具 |
| Tailwind CSS | 4.x | 样式方案 |
| Pinia | 3.x | 状态管理 |
| ECharts | 6.x | 数据可视化 |
| Lucide | 1.x | 图标库 |
| Node.js | 18+ | RTT Bridge 后端 |

---

## 👨‍💻 开发者

<div align="center">

**乔鑫超**

*全栈开发者 & 硬件极客*

[![GitHub](https://img.shields.io/badge/GitHub-qxc4-181717?style=flat&logo=github)](https://github.com/qxc4)
[![Gitee](https://img.shields.io/badge/Gitee-乔鑫超-C71D23?style=flat&logo=gitee)](https://gitee.com/qiao-xinchao)

</div>

---

## 📄 许可证

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 🙏 感谢

如果这个项目对您有帮助，请给一个 ⭐

---

<div align="center">

*Made with ❤️ by Qiao Xinchao*

</div>
