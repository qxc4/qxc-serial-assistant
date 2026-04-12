# QXC Serial — SWD/JTAG RTT 日志输出集成方案说明

> **文档版本**：v1.0  
> **适用项目**：QXC Serial 超联串口助手（Vue 3 + TypeScript + Vite）  
> **核心技术**：SEGGER Real Time Transfer (RTT) over SWD/JTAG  

---

## 目录

1. [技术背景：RTT 是什么，为什么比 UART 更好](#1-技术背景)
2. [系统架构总览](#2-系统架构总览)
3. [方案 A — J-Link Telnet 桥接](#3-方案-a--j-link-telnet-桥接)
4. [方案 B — OpenOCD RTT TCP 服务](#4-方案-b--openocd-rtt-tcp-服务)
5. [方案 C — probe-rs CLI（推荐主力）](#5-方案-c--probe-rs-cli推荐主力)
6. [方案 D — Black Magic Probe Web Serial 直连](#6-方案-d--black-magic-probe-web-serial-直连)
7. [MCU 目标端固件集成](#7-mcu-目标端固件集成)
8. [Node.js 统一桥接服务实现](#8-nodejs-统一桥接服务实现)
9. [Vue 3 前端集成](#9-vue-3-前端集成)
10. [探针兼容性速查表](#10-探针兼容性速查表)
11. [常见问题排查](#11-常见问题排查)

---

## 1 技术背景

### 1.1 RTT 是什么

SEGGER Real Time Transfer（RTT）是一种基于内存读写的嵌入式日志输出技术，原理是：

- 在 MCU 的 RAM 中建立一个**环形缓冲区**（RTT Control Block），结构体头部有固定的魔法字符串 `"SEGGER RTT"`
- MCU 固件向缓冲区写入日志数据（类似 `printf`，但不阻塞）
- 调试探针（J-Link / ST-Link / DAPLink 等）通过 **SWD 或 JTAG 接口的后台内存访问**，周期性轮询该缓冲区并读出数据
- 主机软件接收数据并展示

### 1.2 RTT vs UART vs SWO 对比

| 特性 | RTT（本方案） | UART 串口 | SWO 单线输出 |
|------|------------|---------|------------|
| 额外引脚需求 | **无**（复用 SWD 2 线） | 需要 TX/RX 2 根线 | 需要 SWO 1 根线 |
| 目标代码阻塞 | **不阻塞**（写满则丢弃） | 阻塞等待发送完成 | 不阻塞 |
| 传输速度 | **最高可达 2 MB/s** | 受限于波特率（通常 <1 Mbit） | 受限于 SWO 时钟 |
| 实时性影响 | **极低**（~500 字节 ROM） | 中等（需要 UART 中断） | 低 |
| Cortex-M0 支持 | **支持** | 支持 | **不支持**（无 SWO） |
| 双向通信 | **支持**（可向 MCU 发命令） | 支持 | 仅单向输出 |

**结论**：RTT 是对调试影响最小、功能最强的日志通道，特别适合实时系统。

### 1.3 SWD/JTAG 在本方案中的角色

RTT 本身**并不是一个独立协议**，它依附于已有的调试连接（SWD 或 JTAG）工作：

```
MCU RAM（RTT Control Block）
        ↑↓ 背景内存访问（不打断 CPU 执行）
调试探针（通过 SWD CLK + SWD IO 两根线，或 JTAG 4 线）
        ↓
USB → 主机
```

因此：
- **只要有任何 SWD/JTAG 调试探针连接到目标**，RTT 就可以工作
- 无需额外配置硬件，也无需修改 MCU 时钟或引脚
- 调试器处于 `attach` 状态时即可实时读取日志，不影响目标运行

---

## 2 系统架构总览

由于浏览器安全限制，**浏览器无法直接访问 USB 调试探针**（Web USB 不支持 HID/bulk 类的 CMSIS-DAP 通信）。因此整体架构是：

```
┌─────────────────────────────────────────────────────────┐
│                       MCU 目标端                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  用户固件 + SEGGER_RTT 库                        │    │
│  │  SEGGER_RTT_printf(0, "[INFO] tick=%d\n", tick) │    │
│  └──────────────────────┬──────────────────────────┘    │
│                         │ RAM 环形缓冲区                  │
└─────────────────────────┼───────────────────────────────┘
                          │ SWD (2线) 或 JTAG (4线)
                    ┌─────┴──────┐
                    │  调试探针   │ J-Link / ST-Link / DAPLink
                    │            │ BMP / FTDI / WCH-Link 等
                    └─────┬──────┘
                          │ USB
┌─────────────────────────┼───────────────────────────────┐
│                    主机（PC）                             │
│                         │                               │
│    ┌────────────────────▼──────────────────────┐        │
│    │  后端进程（任选一种）                       │        │
│    │  A: JLinkExe  → TCP :19021                │        │
│    │  B: openocd   → TCP :9090                 │        │
│    │  C: probe-rs  → stdout pipe               │        │
│    └────────────────────┬──────────────────────┘        │
│                         │                               │
│    ┌────────────────────▼──────────────────────┐        │
│    │  Node.js 桥接服务（rtt-bridge）             │        │
│    │  统一转换为 WebSocket 消息                  │        │
│    └────────────────────┬──────────────────────┘        │
│                         │ ws://localhost:19022           │
│    ┌────────────────────▼──────────────────────┐        │
│    │  QXC Serial 浏览器前端（Vue 3）             │        │
│    │  RTT 日志视图（新增 RttView.vue）           │        │
│    └───────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

> **方案 D（BMP）例外**：BMP 将 RTT 透传为 CDC 串口，前端可用现有 Web Serial API 直连，无需后端桥接。

---

## 3 方案 A — J-Link Telnet 桥接

### 3.1 原理

J-Link 软件运行时会在本机开放 **TCP 端口 19021**，实现了一个简化版 Telnet 协议。只要建立 TCP 连接，就能持续接收 RTT Channel 0 的数据流，也可以向 MCU 发送下行数据。

### 3.2 适用探针

- SEGGER J-Link Base / Plus / Pro / Ultra+
- SEGGER J-Link EDU / EDU Mini（个人开发者免费版）
- 刷入 J-Link OB 固件的第三方开发板（部分 Nordic、NXP 开发板自带）

### 3.3 使用前提

1. 安装 [J-Link Software Pack](https://www.segger.com/downloads/jlink/)
2. 通过以下任一方式建立 J-Link 连接：
   - 运行 J-Link Commander：`JLinkExe -device STM32F407VG -if SWD -speed 4000 -autoconnect 1`
   - 运行 J-Link GDB Server：`JLinkGDBServer -device STM32F407VG -if SWD`
   - 在 IDE（Keil / IAR / VS Code + Cortex-Debug）中开启调试会话

连接建立后，J-Link 软件自动在 `:19021` 开放 RTT Telnet 服务。

### 3.4 桥接代码

```typescript
// rtt-bridge/src/adapters/jlink.ts
import * as net from 'net'
import { EventEmitter } from 'events'

export class JLinkAdapter extends EventEmitter {
  private socket: net.Socket | null = null
  private host: string
  private port: number

  constructor(host = '127.0.0.1', port = 19021) {
    super()
    this.host = host
    this.port = port
  }

  connect() {
    this.socket = new net.Socket()

    this.socket.connect(this.port, this.host, () => {
      this.emit('connected')
      // 可选：100ms 内发送 SEGGER Telnet Config String 切换通道
      // this.socket!.write('$$SEGGER_TELNET_ConfigStr=RTTCh;0$$')
    })

    this.socket.on('data', (data: Buffer) => {
      this.emit('data', {
        source: 'jlink',
        timestamp: Date.now(),
        raw: data,
        text: data.toString('utf8'),
      })
    })

    this.socket.on('close', () => this.emit('disconnected'))
    this.socket.on('error', (err) => this.emit('error', err))
  }

  send(text: string) {
    this.socket?.write(Buffer.from(text))
  }

  disconnect() {
    this.socket?.destroy()
    this.socket = null
  }
}
```

### 3.5 优缺点

| 项目 | 说明 |
|------|------|
| ✅ 速度最高 | J-Link 硬件加速，可达 2 MB/s |
| ✅ 代码量最少 | 纯 TCP 连接，10 行核心代码 |
| ✅ 无需额外工具 | J-Link 软件自带 |
| ❌ 仅限 J-Link | 不支持 ST-Link / CMSIS-DAP |
| ❌ 需要正版/EDU | 商业项目需授权 |

---

## 4 方案 B — OpenOCD RTT TCP 服务

### 4.1 原理

OpenOCD 0.11.0+ 内置了完整的 RTT 支持。通过 TCL 命令 `rtt setup` + `rtt server start`，可以把 RTT 通道映射到本机 TCP 端口，原理与方案 A 类似，但支持的探针范围更广。

### 4.2 适用探针

几乎所有主流探针：J-Link、ST-Link v2/v3、CMSIS-DAP（DAPLink）、FTDI、ESP32 USB-JTAG 等。

### 4.3 启动命令

```bash
# STM32F4 + ST-Link 示例
openocd \
  -f interface/stlink.cfg \
  -f target/stm32f4x.cfg \
  -c "init" \
  -c "reset halt" \
  -c "resume" \
  -c "rtt setup 0x20000000 0x10000 \"SEGGER RTT\"" \
  -c "rtt start" \
  -c "rtt server start 9090 0"

# nRF52840 + DAPLink 示例
openocd \
  -f interface/cmsis-dap.cfg \
  -f target/nrf52.cfg \
  -c "init; reset halt; resume" \
  -c "rtt setup 0x20000000 0x40000 \"SEGGER RTT\"" \
  -c "rtt start; rtt server start 9090 0"
```

> **注意**：`rtt setup` 第一个参数是 RAM 起始地址，第二个是搜索范围大小，需与芯片 RAM 映射对应。

### 4.4 桥接代码

```typescript
// rtt-bridge/src/adapters/openocd.ts
import * as net from 'net'
import { EventEmitter } from 'events'

export class OpenOCDAdapter extends EventEmitter {
  private socket: net.Socket | null = null

  connect(host = '127.0.0.1', port = 9090) {
    this.socket = new net.Socket()
    this.socket.connect(port, host, () => this.emit('connected'))
    this.socket.on('data', (data) => {
      this.emit('data', {
        source: 'openocd',
        timestamp: Date.now(),
        raw: data,
        text: data.toString('utf8'),
      })
    })
    this.socket.on('close', () => this.emit('disconnected'))
    this.socket.on('error', (err) => this.emit('error', err))
  }

  send(text: string) {
    this.socket?.write(Buffer.from(text))
  }

  disconnect() {
    this.socket?.destroy()
  }
}
```

### 4.5 多通道支持

OpenOCD 支持每个 RTT 通道映射到不同端口：

```bash
rtt server start 9090 0   # Channel 0 → :9090（日志输出）
rtt server start 9091 1   # Channel 1 → :9091（自定义二进制通道）
```

### 4.6 优缺点

| 项目 | 说明 |
|------|------|
| ✅ 探针覆盖广 | 支持几乎所有主流探针 |
| ✅ 开源免费 | 无授权限制 |
| ✅ 生态成熟 | 有大量现成 .cfg 脚本 |
| ❌ 配置复杂 | 每种芯片需要对应 .cfg |
| ❌ 有竞态问题 | RTT 需要目标先运行完 Init |
| ❌ 速度中等 | ~200 KB/s |

---

## 5 方案 C — probe-rs CLI（推荐主力）

### 5.1 原理

probe-rs 是用 Rust 编写的现代嵌入式调试工具链，内置完整的 RTT 支持。通过 `probe-rs rtt` 子命令，直接将 RTT 数据输出到 stdout，Node.js 桥接服务通过 `child_process.spawn` 捕获并转发。

### 5.2 适用探针

覆盖最广，包括：

| 探针类型 | 支持情况 |
|----------|--------|
| SEGGER J-Link（全系列） | ✅ 完整支持 |
| ST-Link v2 / v2.1 / v3 | ✅ 完整支持 |
| CMSIS-DAP v1（HID） | ✅ 支持 |
| CMSIS-DAP v2（Bulk） | ✅ 支持，性能更高 |
| DAPLink | ✅ 支持 |
| FTDI MPSSE | ✅ 支持 |
| ESP32 内置 USB-JTAG | ✅ 支持 |
| WCH-Link（CH32 RISC-V） | ✅ 支持 |
| Raspberry Pi Pico 作为 probe | ✅ 支持（picoprobe 固件） |

### 5.3 安装 probe-rs

```bash
# 方式一：官方安装脚本（推荐）
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/probe-rs/probe-rs/releases/latest/download/probe-rs-tools-installer.sh | sh

# 方式二：cargo 安装
cargo install probe-rs-tools

# Windows PowerShell
irm https://github.com/probe-rs/probe-rs/releases/latest/download/probe-rs-tools-installer.ps1 | iex
```

### 5.4 使用方式

```bash
# 列出已连接的探针
probe-rs list

# 查看支持的芯片（模糊搜索）
probe-rs chip list | grep -i stm32f4

# 启动 RTT 监视
probe-rs rtt --chip STM32F407VGTx --protocol Swd

# 指定探针（多探针时）
probe-rs rtt --chip nRF52840_xxAA --probe 0483:374b
```

### 5.5 桥接代码

```typescript
// rtt-bridge/src/adapters/probe_rs.ts
import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

export interface ProbeRsConfig {
  chip: string           // 例如 "STM32F407VGTx"
  protocol?: 'Swd' | 'Jtag'
  probe?: string         // VID:PID 或序列号，多探针时指定
  frequency?: number     // SWD/JTAG 时钟频率（Hz）
  rttScanRange?: string  // 例如 "0x20000000..0x20020000"
}

export class ProbeRsAdapter extends EventEmitter {
  private proc: ChildProcess | null = null
  private buffer = ''

  connect(config: ProbeRsConfig) {
    const args = [
      'rtt',
      '--chip', config.chip,
      '--protocol', config.protocol ?? 'Swd',
    ]
    if (config.probe)      args.push('--probe', config.probe)
    if (config.frequency)  args.push('--speed', String(config.frequency))
    if (config.rttScanRange) args.push('--rtt-scan-range', config.rttScanRange)

    this.proc = spawn('probe-rs', args, { stdio: ['pipe', 'pipe', 'pipe'] })

    this.emit('connected')

    this.proc.stdout?.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8')
      // 按行分割，避免截断半行
      const lines = this.buffer.split('\n')
      this.buffer = lines.pop() ?? ''  // 最后不完整的行留缓冲
      for (const line of lines) {
        if (line.trim()) {
          this.emit('data', {
            source: 'probe-rs',
            timestamp: Date.now(),
            text: line,
          })
        }
      }
    })

    this.proc.stderr?.on('data', (chunk: Buffer) => {
      // probe-rs 进度信息走 stderr，可选转发或过滤
      const msg = chunk.toString()
      if (msg.includes('Error') || msg.includes('error')) {
        this.emit('error', new Error(msg.trim()))
      }
    })

    this.proc.on('exit', (code) => {
      this.emit('disconnected', code)
    })
  }

  send(text: string) {
    // RTT 下行：向 MCU 发送数据
    this.proc?.stdin?.write(text)
  }

  disconnect() {
    this.proc?.kill('SIGTERM')
    this.proc = null
  }
}
```

### 5.6 优缺点

| 项目 | 说明 |
|------|------|
| ✅ 探针覆盖最广 | 支持所有主流探针 |
| ✅ 无需驱动 | Linux/macOS 零配置，Windows 仅需 WinUSB |
| ✅ 高速 | ~1 MB/s，远高于 UART |
| ✅ 开源免费 | Apache 2.0 授权 |
| ✅ 芯片数据库完善 | 内置 STM32 全系列、nRF、RP2040 等 |
| ⚠️ 需要安装 Rust 工具链 | 或下载预编译二进制（推荐） |
| ❌ WCH-Link 支持仍在完善 | 部分型号可能有问题 |

---

## 6 方案 D — Black Magic Probe Web Serial 直连

### 6.1 原理

Black Magic Probe（BMP）是一款开源调试器，它的独特之处在于：**RTT 轮询完全在探针固件内完成**，RTT 数据被透明地转发到探针的第二个 CDC ACM 串口（虚拟串口）。

这意味着对于主机来说，RTT 数据就是普通串口数据，可以直接用 QXC Serial 现有的 **Web Serial API** 读取，**无需任何后端服务**。

### 6.2 BMP 固件要求

BMP 需要编译时启用 RTT 支持（官方发布版通常已包含）：

```bash
# 编译时启用 RTT
make ENABLE_RTT=1
```

### 6.3 连接方式

BMP 连接后在系统中出现两个串口：

| 串口 | 用途 |
|------|------|
| 第 1 个（较小编号） | GDB Remote Serial Protocol |
| **第 2 个（较大编号）** | **RTT 数据输出（即本方案目标）** |

Linux: `/dev/ttyACM0` (GDB) + `/dev/ttyACM1` (RTT)  
Windows: `COM3` (GDB) + `COM4` (RTT)  
macOS: `/dev/cu.usbmodemXXX1` (GDB) + `/dev/cu.usbmodemXXX3` (RTT)

### 6.4 GDB 配置 RTT

需要先通过 GDB 启用 RTT 轮询（只需一次，之后数据持续输出到串口）：

```gdb
target extended-remote /dev/ttyACM0
monitor swdp_scan
attach 1
monitor rtt
run
```

### 6.5 前端集成代码

这是方案 D 的特殊之处——可以直接在现有 `useSerial.ts` 基础上扩展，**完全不需要 Node.js 桥接**：

```typescript
// src/composables/useRttBmp.ts
import { ref } from 'vue'

export function useRttBmp() {
  const connected = ref(false)
  const logs = ref<string[]>([])
  let port: SerialPort | null = null
  let reader: ReadableStreamDefaultReader | null = null

  async function connect() {
    // 用户选择 BMP 的第二个串口
    port = await navigator.serial.requestPort({
      filters: [
        { usbVendorId: 0x1D50 },  // Black Magic Debug VID
      ]
    })
    await port.open({ baudRate: 115200 })

    connected.value = true
    readLoop()
  }

  async function readLoop() {
    const decoder = new TextDecoderStream()
    port!.readable!.pipeTo(decoder.writable)
    reader = decoder.readable.getReader()

    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      logs.value.push(...lines.filter(l => l.trim()))
    }
    connected.value = false
  }

  async function disconnect() {
    await reader?.cancel()
    await port?.close()
    connected.value = false
  }

  return { connected, logs, connect, disconnect }
}
```

### 6.6 优缺点

| 项目 | 说明 |
|------|------|
| ✅ 无需后端 | 直接用 Web Serial API，零额外服务 |
| ✅ 复用现有功能 | QXC Serial 已有 Web Serial 基础设施 |
| ✅ 开源硬件 | BMP 硬件和固件均开源 |
| ✅ 免驱动 | CDC ACM 在所有平台免驱 |
| ❌ 仅限 BMP | 不支持其他探针 |
| ❌ 需要 GDB 初始化 RTT | 连接流程相对繁琐 |
| ❌ 速度较低 | 受 CDC 串口带宽限制 |

---

## 7 MCU 目标端固件集成

无论使用哪种主机方案，MCU 端固件都需要集成 SEGGER RTT 库。

### 7.1 获取 RTT 源码

```bash
# 从官方 GitHub 获取
git clone https://github.com/SEGGERMicro/RTT.git

# 只需要以下文件：
#   RTT/SEGGER_RTT.c
#   RTT/SEGGER_RTT.h
#   RTT/SEGGER_RTT_printf.c      （可选，提供 printf 支持）
#   Config/SEGGER_RTT_Conf.h     （配置文件）
```

### 7.2 CMake 集成（STM32 + CMake 示例）

```cmake
# CMakeLists.txt
add_library(segger_rtt STATIC
    RTT/SEGGER_RTT.c
    RTT/SEGGER_RTT_printf.c
)

target_include_directories(segger_rtt PUBLIC
    RTT/
    Config/
)

# 链接到你的目标
target_link_libraries(your_firmware segger_rtt)
```

### 7.3 基础用法

```c
#include "SEGGER_RTT.h"

int main(void) {
    // 初始化（通常自动调用，但显式调用更安全）
    SEGGER_RTT_Init();
    
    SEGGER_RTT_WriteString(0, "RTT 初始化完成\n");
    
    uint32_t tick = 0;
    while (1) {
        // 带格式化输出
        SEGGER_RTT_printf(0, "[%lu] 系统运行正常，温度: %d°C\n", tick++, readTemp());
        
        HAL_Delay(100);
    }
}
```

### 7.4 重定向 printf 到 RTT（GCC/Newlib）

```c
// 添加此文件到项目，即可让 printf() 输出到 RTT Channel 0
// retarget_rtt.c

#include "SEGGER_RTT.h"
#include <sys/stat.h>

int _write(int fd, char *buf, int len) {
    (void)fd;
    return SEGGER_RTT_Write(0, buf, len);
}

int _read(int fd, char *buf, int len) {
    (void)fd;
    return SEGGER_RTT_Read(0, buf, len);
}
```

### 7.5 多通道分级日志（推荐）

```c
#include "SEGGER_RTT.h"

// 定义多个通道用途
#define RTT_CH_LOG    0   // 普通日志
#define RTT_CH_TRACE  1   // 高频 trace 数据
#define RTT_CH_PROTO  2   // 二进制协议数据

// 通道 1 和 2 需要手动分配缓冲区
static char _rtt_buf_up1[2048];
static char _rtt_buf_up2[512];

void rtt_init_channels(void) {
    SEGGER_RTT_ConfigUpBuffer(RTT_CH_TRACE, "trace",
        _rtt_buf_up1, sizeof(_rtt_buf_up1),
        SEGGER_RTT_MODE_NO_BLOCK_SKIP);   // 缓冲区满则丢弃，不阻塞
    
    SEGGER_RTT_ConfigUpBuffer(RTT_CH_PROTO, "proto",
        _rtt_buf_up2, sizeof(_rtt_buf_up2),
        SEGGER_RTT_MODE_BLOCK_IF_FIFO_FULL);
}

// 使用宏简化日志级别
#define LOG_I(fmt, ...) SEGGER_RTT_printf(RTT_CH_LOG, "[I] " fmt "\n", ##__VA_ARGS__)
#define LOG_W(fmt, ...) SEGGER_RTT_printf(RTT_CH_LOG, "[W] " fmt "\n", ##__VA_ARGS__)
#define LOG_E(fmt, ...) SEGGER_RTT_printf(RTT_CH_LOG, "[E] " fmt "\n", ##__VA_ARGS__)
```

### 7.6 RTOS 注意事项

在 FreeRTOS 等 RTOS 环境下，需要确保线程安全：

```c
// 在 SEGGER_RTT_Conf.h 中配置锁
#define SEGGER_RTT_LOCK()    taskENTER_CRITICAL()
#define SEGGER_RTT_UNLOCK()  taskEXIT_CRITICAL()
```

---

## 8 Node.js 统一桥接服务实现

### 8.1 目录结构

```
rtt-bridge/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # 入口，启动 WebSocket 服务
    ├── adapters/
    │   ├── base.ts           # 基类接口定义
    │   ├── jlink.ts          # 方案 A
    │   ├── openocd.ts        # 方案 B
    │   └── probe_rs.ts       # 方案 C（主力）
    └── ws-server.ts          # WebSocket 服务器
```

### 8.2 package.json

```json
{
  "name": "rtt-bridge",
  "version": "1.0.0",
  "scripts": {
    "dev": "ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "ws": "^8.17.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/ws": "^8.5.10",
    "ts-node": "^10.9.2",
    "typescript": "^5.4.0"
  }
}
```

### 8.3 WebSocket 消息协议

```typescript
// src/types.ts

// 客户端 → 桥接服务
export type ClientMessage =
  | { type: 'connect';    backend: 'jlink' | 'openocd' | 'probe-rs'; config: BackendConfig }
  | { type: 'disconnect' }
  | { type: 'send';       data: string }  // 向 MCU 发送下行数据

// 桥接服务 → 客户端
export type ServerMessage =
  | { type: 'rtt_data';        timestamp: number; text: string; source: string }
  | { type: 'connected';       backend: string }
  | { type: 'disconnected';    reason?: string }
  | { type: 'error';           message: string }
  | { type: 'probe_list';      probes: ProbeInfo[] }

export interface BackendConfig {
  // J-Link / OpenOCD
  host?: string
  port?: number
  // probe-rs
  chip?: string
  protocol?: 'Swd' | 'Jtag'
  probe?: string
}
```

### 8.4 主入口

```typescript
// src/index.ts
import { WebSocketServer, WebSocket } from 'ws'
import { JLinkAdapter }    from './adapters/jlink'
import { OpenOCDAdapter }  from './adapters/openocd'
import { ProbeRsAdapter }  from './adapters/probe_rs'

const WS_PORT = 19022
const wss = new WebSocketServer({ port: WS_PORT })

console.log(`[RTT Bridge] WebSocket 服务启动在 ws://localhost:${WS_PORT}`)

wss.on('connection', (ws: WebSocket) => {
  let adapter: JLinkAdapter | OpenOCDAdapter | ProbeRsAdapter | null = null

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString())

    if (msg.type === 'connect') {
      // 清理旧连接
      adapter?.disconnect?.()

      switch (msg.backend) {
        case 'jlink':
          adapter = new JLinkAdapter(msg.config?.host, msg.config?.port)
          break
        case 'openocd':
          adapter = new OpenOCDAdapter()
          break
        case 'probe-rs':
          adapter = new ProbeRsAdapter()
          break
        default:
          ws.send(JSON.stringify({ type: 'error', message: `未知后端: ${msg.backend}` }))
          return
      }

      adapter.on('connected', () => {
        ws.send(JSON.stringify({ type: 'connected', backend: msg.backend }))
      })
      adapter.on('data', (payload) => {
        ws.send(JSON.stringify({ type: 'rtt_data', ...payload }))
      })
      adapter.on('disconnected', () => {
        ws.send(JSON.stringify({ type: 'disconnected' }))
      })
      adapter.on('error', (err: Error) => {
        ws.send(JSON.stringify({ type: 'error', message: err.message }))
      })

      // 根据后端类型调用不同的 connect 签名
      if (msg.backend === 'probe-rs') {
        (adapter as ProbeRsAdapter).connect(msg.config)
      } else if (msg.backend === 'jlink') {
        (adapter as JLinkAdapter).connect()
      } else {
        (adapter as OpenOCDAdapter).connect(msg.config?.host, msg.config?.port)
      }
    }

    if (msg.type === 'send') {
      adapter?.send?.(msg.data)
    }

    if (msg.type === 'disconnect') {
      adapter?.disconnect?.()
    }
  })

  ws.on('close', () => adapter?.disconnect?.())
})
```

---

## 9 Vue 3 前端集成

### 9.1 新增文件

```
src/
├── composables/
│   └── useRtt.ts          # RTT 状态管理 composable
├── views/
│   └── RttView.vue        # RTT 日志视图
└── types/
    └── rtt.ts             # RTT 相关类型定义
```

### 9.2 useRtt.ts

```typescript
// src/composables/useRtt.ts
import { ref, computed, onUnmounted } from 'vue'

export interface RttLog {
  id:        number
  timestamp: number
  text:      string
  level:     'info' | 'warn' | 'error' | 'debug'
}

export type RttBackend = 'probe-rs' | 'jlink' | 'openocd'

function detectLevel(text: string): RttLog['level'] {
  const t = text.toLowerCase()
  if (t.includes('[e]') || t.includes('error') || t.includes('fault')) return 'error'
  if (t.includes('[w]') || t.includes('warn'))                          return 'warn'
  if (t.includes('[d]') || t.includes('debug'))                         return 'debug'
  return 'info'
}

export function useRtt() {
  const connected  = ref(false)
  const connecting = ref(false)
  const logs       = ref<RttLog[]>([])
  const error      = ref<string | null>(null)
  const backend    = ref<RttBackend>('probe-rs')
  let ws: WebSocket | null = null
  let idCounter = 0

  const errorLogs  = computed(() => logs.value.filter(l => l.level === 'error'))
  const warnLogs   = computed(() => logs.value.filter(l => l.level === 'warn'))

  function connect(config: {
    backend: RttBackend
    chip?: string
    protocol?: 'Swd' | 'Jtag'
    probe?: string
    host?: string
    port?: number
  }) {
    if (ws) ws.close()
    connecting.value = true
    error.value = null
    backend.value = config.backend

    ws = new WebSocket('ws://localhost:19022')

    ws.onopen = () => {
      ws!.send(JSON.stringify({
        type: 'connect',
        backend: config.backend,
        config: {
          chip:     config.chip,
          protocol: config.protocol ?? 'Swd',
          probe:    config.probe,
          host:     config.host ?? '127.0.0.1',
          port:     config.port,
        }
      }))
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)

      if (msg.type === 'connected') {
        connected.value  = true
        connecting.value = false
      }

      if (msg.type === 'rtt_data') {
        logs.value.push({
          id:        idCounter++,
          timestamp: msg.timestamp,
          text:      msg.text,
          level:     detectLevel(msg.text),
        })
        // 保留最近 10000 条
        if (logs.value.length > 10000) {
          logs.value = logs.value.slice(-10000)
        }
      }

      if (msg.type === 'disconnected') {
        connected.value  = false
        connecting.value = false
      }

      if (msg.type === 'error') {
        error.value      = msg.message
        connecting.value = false
      }
    }

    ws.onclose = () => {
      connected.value  = false
      connecting.value = false
    }
  }

  function disconnect() {
    ws?.send(JSON.stringify({ type: 'disconnect' }))
    ws?.close()
    connected.value = false
  }

  function sendToMcu(text: string) {
    ws?.send(JSON.stringify({ type: 'send', data: text }))
  }

  function clearLogs() {
    logs.value = []
  }

  function exportLogs() {
    const content = logs.value
      .map(l => `[${new Date(l.timestamp).toISOString()}][${l.level.toUpperCase()}] ${l.text}`)
      .join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rtt-log-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  onUnmounted(() => ws?.close())

  return {
    connected, connecting, logs, error, backend,
    errorLogs, warnLogs,
    connect, disconnect, sendToMcu, clearLogs, exportLogs,
  }
}
```

### 9.3 路由注册

```typescript
// src/router/index.ts（新增路由）
{
  path: '/rtt',
  name: 'rtt',
  component: () => import('@/views/RttView.vue'),
  meta: { title: 'RTT 日志' }
}
```

---

## 10 探针兼容性速查表

| 探针 | 方案 A | 方案 B | 方案 C | 方案 D | 推荐方案 |
|------|:------:|:------:|:------:|:------:|--------|
| J-Link Base/Plus/Pro | ✅ | ✅ | ✅ | ✗ | **A 或 C** |
| J-Link EDU / EDU Mini | ✅ | ✅ | ✅ | ✗ | **A 或 C** |
| ST-Link v2（含克隆） | ✗ | ✅ | ✅ | ✗ | **C** |
| ST-Link v2.1（Nucleo 板载） | ✗ | ✅ | ✅ | ✗ | **C** |
| ST-Link v3 | ✗ | ✅ | ✅ | ✗ | **C** |
| CMSIS-DAP v1（HID） | ✗ | ✅ | ✅ | ✗ | **C** |
| CMSIS-DAP v2（Bulk/DAPLink） | ✗ | ✅ | ✅ | ✗ | **C** |
| Black Magic Probe | ✗ | ✗ | ✅ | ✅ | **D（无后端）或 C** |
| Raspberry Pi Pico（picoprobe） | ✗ | ✅ | ✅ | ✗ | **C** |
| FTDI FT2232H | ✗ | ✅ | ✅ | ✗ | **C** |
| ESP32 内置 USB-JTAG | ✗ | ✅ | ✅ | ✗ | **C** |
| WCH-Link（CH32 系列） | ✗ | △ | ✅ | ✗ | **C** |
| pyOCD 支持的探针 | ✗ | ✗ | △ | ✗ | **方案 E（pyOCD）** |

> △ = 部分支持，可能有限制

---

## 11 常见问题排查

### Q1: probe-rs 提示 "No connected probes"

```bash
# Linux 需配置 udev 规则
sudo tee /etc/udev/rules.d/69-probe-rs.rules << 'EOF'
# J-Link
SUBSYSTEM=="usb", ATTRS{idVendor}=="1366", MODE="660", GROUP="plugdev"
# ST-Link
SUBSYSTEM=="usb", ATTRS{idVendor}=="0483", MODE="660", GROUP="plugdev"
# CMSIS-DAP
SUBSYSTEM=="usb", ATTRS{idVendor}=="0d28", MODE="660", GROUP="plugdev"
EOF
sudo udevadm control --reload && sudo udevadm trigger
sudo usermod -aG plugdev $USER
# 需要重新登录生效
```

### Q2: RTT Control Block 找不到

**原因**：探针连接时 MCU 还未执行到 RTT 初始化代码。

**解决方案**：

```bash
# probe-rs：指定精确地址（从 map 文件查找 _SEGGER_RTT 符号）
probe-rs rtt --chip STM32F407VGTx --rtt-scan-range 0x20000000..0x20010000

# 或者在固件启动最早期调用
void SystemInit(void) {
    SEGGER_RTT_Init();  // 在 main() 之前初始化
    // ...
}
```

### Q3: J-Link Telnet 连不上 :19021

检查 J-Link 连接是否正常建立：

```bash
# 先确认 J-Link Commander 可以连上目标
JLinkExe -device STM32F407VG -if SWD -speed 4000 -autoconnect 1
# 连上后在命令行中输入：
> RTTRead
# 能看到数据说明 RTT 工作正常
```

### Q4: OpenOCD RTT 竞态问题（rtt start 失败）

```bash
# 确保 resume 在 rtt start 之前执行
openocd -f interface/cmsis-dap.cfg -f target/stm32f4x.cfg \
  -c "init" \
  -c "reset halt" \
  -c "resume" \
  -c "sleep 200" \            # 等待 MCU 执行到 RTT_Init
  -c "rtt setup 0x20000000 0x10000 \"SEGGER RTT\"" \
  -c "rtt start" \
  -c "rtt server start 9090 0"
```

### Q5: RTT 数据出现乱码

**原因**：编码问题，MCU 输出 GBK 但前端以 UTF-8 解码。

**解决方案**：在桥接服务中加编码检测，或在固件中统一使用 UTF-8。

---

## 附录：SWD 物理连接说明

RTT 通过 SWD 的**后台内存访问**功能工作，SWD 接口只需 2 根信号线：

| 引脚 | 功能 | 说明 |
|------|------|------|
| SWDCLK | 时钟 | 通常 1~10 MHz |
| SWDIO | 数据 | 双向 |
| GND | 地 | 必须共地 |
| VCC（可选） | 目标电源检测 | 部分探针用于电平匹配 |
| nRESET（可选） | 复位 | 某些场景需要 |

JTAG 则需要 4 根信号线（TCK、TMS、TDI、TDO），RTT 同样支持，但现代 ARM Cortex-M 更常用 SWD（线数更少、速度更快）。

---

*文档生成时间：2026-04-12 | QXC Serial RTT 集成方案 v1.0*
