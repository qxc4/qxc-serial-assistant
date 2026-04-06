# QXC Serial 超联串口助手

<div align="center">

![QXC Serial](https://img.shields.io/badge/QXC-Serial-1081FF?style=for-the-badge&logo=electron&logoColor=white)
![Vue.js 3](https://img.shields.io/badge/Vue_3-4FC08D?style=for-the-badge&logo=vue.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

### 🔧 基于 Web Serial API 的现代浏览器端串口调试工具

*跨平台支持 | 多编码格式 | 指令组管理 | 数据可视化*

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
│   └── useFileSave.ts     # 文件保存
├── views/                 # 页面组件
│   ├── SerialView.vue     # 串口主界面
│   ├── ChartView.vue      # 数据图表
│   ├── ModbusView.vue     # Modbus解析
│   ├── SettingsView.vue   # 设置页面
│   ├── ProfileView.vue    # 开发者
│   ├── AsciiView.vue      # ASCII表
│   └── NumConverterView.vue # 数制转换
├── components/             # 公共组件
├── stores/                # Pinia 状态
├── types/                 # TypeScript 类型
└── utils/                 # 工具函数
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
