# QXC Serial 超联串口助手

<div align="center">

![QXC Serial](https://img.shields.io/badge/QXC-Serial-blue?style=for-the-badge)
![Vue 3](https://img.shields.io/badge/Vue-3.x-4FC08D?style=for-the-badge&logo=vue.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?style=for-the-badge&logo=vite)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

**基于 Web Serial API 的现代浏览器端串口调试工具**

支持多编码格式、指令组管理、数据导出等功能

[在线体验](#-在线体验) · [功能特性](#-功能特性) · [快速开始](#-快速开始) · [技术栈](#-技术栈)

</div>

---

## 🌐 在线体验

| 域名 | 地址 | 说明 |
|:----:|:----:|:----:|
| 🔗 主域名 | [qxc-serial.top](https://qxc-serial.top) | 官方主站 |
| 🔗 www | [www.qxc-serial.top](https://www.qxc-serial.top) | www 子域名 |
| 🔗 Vercel | [qxc-serial-assistant.vercel.app](https://qxc-serial-assistant.vercel.app) | Vercel 部署 |

---

## 📖 项目简介

QXC Serial 超联串口助手是一个基于 Vue 3 + TypeScript + Vite 构建的现代化串口调试工具，利用浏览器原生的 Web Serial API 实现串口通信功能，无需安装任何驱动程序或插件。

---

## ✨ 功能特性

### 🔧 核心功能

| 功能 | 描述 |
|:----:|:-----|
| 🔌 **Web Serial API** | 使用浏览器原生串口 API，支持 Chrome/Edge 浏览器 |
| 🚀 **现代技术栈** | 基于 Vue 3 + TypeScript + Vite 构建 |
| 🎨 **现代化 UI** | 采用 Tailwind CSS 设计，支持亮色/暗色主题切换 |
| 🌐 **国际化** | 支持中英文双语界面 |

### 📡 串口通信

- � **多波特率支持** - 预设常用波特率 + 自定义输入
- ⚙️ **完整串口配置** - 数据位、停止位、校验位可配置
- 🔄 **自动重连** - 断开后自动尝试重连（最多5次）
- 📊 **实时统计** - 收发字节数实时显示

### 📝 数据显示

- 🈳 **多编码格式** - 支持 UTF-8、ASCII、GBK、HEX 编码
- 🎛️ **显示模式** - 仅接收、仅发送、混合显示三种模式
- ⏱️ **时间戳** - 可选显示数据时间戳
- 📜 **自动滚动** - 数据自动滚动到最新位置
- 🔍 **搜索功能** - 支持数据内容搜索

### ⚡ 指令功能

- 🚀 **快捷指令** - 快速发送常用指令，支持循环发送
- 📋 **指令组管理**
  - 创建、保存、加载指令组
  - 另存为功能
  - 版本历史与恢复
  - 执行状态实时显示
  - 失败策略配置（停止全部/跳过继续/跳过依赖项）
  - 超时与延迟设置

### 💾 数据管理

- � **配置持久化** - 自动保存串口配置和用户设置
- 📁 **数据导出**
  - 保存到桌面并打开
  - 导出指令组配置
  - 导出串口日志
  - 完整数据备份
- 🔢 **数制转换器** - 二进制、八进制、十进制、十六进制互转
- 📖 **ASCII 对照表** - 完整 ASCII 字符参考（标准 + 扩展）

### 🎯 用户体验

#### ⌨️ 快捷键支持

| 快捷键 | 功能 |
|:------:|:-----|
| `Ctrl + Enter` | 发送数据 |
| `Ctrl + Shift + C` | 连接/断开串口 |
| `Ctrl + Shift + X` | 清空接收数据 |
| `Ctrl + S` | 保存当前指令组 |
| `Space` | 开始/暂停指令组执行 |
| `Escape` | 停止指令组执行 / 关闭帮助 |
| `?` | 显示/隐藏快捷键帮助 |

#### 💝 其他功能

- � **打赏功能** - 支持开发者
- 📧 **意见反馈** - 快速提交优化建议

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

### 预览生产版本

```bash
npm run preview
```

---

## 💻 系统要求

| 要求 | 说明 |
|:----:|:-----|
| 🌐 浏览器 | Chrome 89+ 或 Edge 89+ |
| 🖥️ 操作系统 | Windows 10+, macOS 11+, Linux |

---

## 📁 项目结构

```
src/
├── composables/          # 组合式函数
│   ├── useSerial.ts      # 串口通信逻辑
│   ├── useCommandGroup.ts # 指令组管理
│   ├── useI18n.ts        # 国际化
│   └── useFileSave.ts    # 文件保存
├── views/                # 页面组件
│   ├── SerialView.vue    # 串口主界面
│   ├── SettingsView.vue  # 设置页面
│   ├── ProfileView.vue   # 开发者信息
│   ├── AsciiView.vue     # ASCII对照表
│   └── NumConverterView.vue # 数制转换
├── components/           # 公共组件
├── stores/               # Pinia 状态管理
├── data/                 # 静态数据
└── types/                # TypeScript 类型定义
```

---

## 🛠️ 技术栈

| 技术 | 说明 |
|:----:|:-----|
| ![Vue](https://img.shields.io/badge/Vue-3.x-4FC08D?logo=vue.js) | 前端框架 (Composition API) |
| ![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript) | 开发语言 |
| ![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite) | 构建工具 |
| ![Tailwind](https://img.shields.io/badge/Tailwind-4.x-06B6D4?logo=tailwindcss) | 样式方案 |
| ![Pinia](https://img.shields.io/badge/Pinia-3.x-yellow) | 状态管理 |
| ![Lucide](https://img.shields.io/badge/Lucide-Icons-F5705A) | 图标库 |

---

## 👨‍💻 开发者

<div align="center">

**乔鑫超**

*全栈开发者 & 硬件极客*

专注于跨平台桌面应用、物联网和嵌入式系统开发

致力于构建现代、高效、对开发者友好的工具软件

[![GitHub](https://img.shields.io/badge/GitHub-qxc4-181717?style=for-the-badge&logo=github)](https://github.com/qxc4)
[![Gitee](https://img.shields.io/badge/Gitee-乔鑫超-C71D23?style=for-the-badge&logo=gitee)](https://gitee.com/qiao-xinchao)

</div>

---

## 📄 许可证

本项目采用 [MIT](LICENSE) 许可证

---

## 🔗 相关项目

| 项目 | 描述 |
|:----:|:-----|
| [Bike Safety Turn System](https://gitee.com/qiao-xinchao/bike-safety-turn-system) | 智能自行车转向灯系统 |

---

<div align="center">

**⭐ 如果这个项目对您有帮助，请给一个 Star ⭐**

Made with ❤️ by Qiao Xinchao

</div>
