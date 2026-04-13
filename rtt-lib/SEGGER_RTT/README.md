# SEGGER RTT 使用说明

## 文件列表

本目录包含 SEGGER RTT (Real-Time Transfer) 的核心文件：

- `SEGGER_RTT.h` - RTT 头文件
- `SEGGER_RTT.c` - RTT 实现文件
- `SEGGER_RTT_Conf.h` - RTT 配置文件
- `SEGGER_RTT_printf.c` - printf 格式化输出支持

## Keil 工程集成步骤

### 1. 添加文件到工程

1. 将本目录下的所有文件复制到你的 Keil 工程目录
2. 在 Keil 中右键工程 → Add Existing Files
3. 添加以下文件：
   - `SEGGER_RTT.c`
   - `SEGGER_RTT_printf.c`

### 2. 添加头文件路径

1. 点击工程选项 (魔术棒图标)
2. C/C++ 标签页
3. Include Paths 中添加本目录路径

### 3. 在代码中使用

```c
#include "SEGGER_RTT.h"

int main(void) {
    // 系统初始化
    SystemInit();

    // 初始化 RTT
    SEGGER_RTT_Init();

    // 输出欢迎信息
    SEGGER_RTT_printf(0, "System Started!\r\n");
    SEGGER_RTT_printf(0, "MCU: STM32F407\r\n");

    while (1) {
        // 你的应用代码
        static uint32_t counter = 0;
        SEGGER_RTT_printf(0, "Counter: %d\r\n", counter++);
        HAL_Delay(1000);
    }
}
```

### 4. 配置缓冲区大小 (可选)

编辑 `SEGGER_RTT_Conf.h` 文件：

```c
// 上行缓冲区大小 (MCU → 主机)
#define BUFFER_SIZE_UP    (1024)

// 下行缓冲区大小 (主机 → MCU)
#define BUFFER_SIZE_DOWN  (16)

// 上行通道数量
#define SEGGER_RTT_MAX_NUM_UP_BUFFERS   (3)

// 下行通道数量
#define SEGGER_RTT_MAX_NUM_DOWN_BUFFERS (3)
```

## RTT 输出函数

### 基本输出

```c
// 输出字符串
SEGGER_RTT_WriteString(0, "Hello RTT!\r\n");

// 格式化输出
SEGGER_RTT_printf(0, "Value: %d, Hex: 0x%08X\r\n", value, value);

// 输出单个字符
SEGGER_RTT_PutChar(0, 'A');
```

### 多通道输出

```c
// 通道 0: 普通日志
SEGGER_RTT_printf(0, "[INFO] System running\r\n");

// 通道 1: 错误日志
SEGGER_RTT_printf(1, "[ERROR] Something wrong\r\n");

// 通道 2: 调试数据
SEGGER_RTT_printf(2, "ADC: %d\r\n", adc_value);
```

## 使用 QXC Serial 连接 RTT

### 方法 1: WebUSB 直连 (推荐)

1. 编译并下载程序到 MCU
2. 确保 MCU 正在运行 (不复位)
3. 打开 QXC Serial → RTT 页面
4. 选择「WebUSB (直连)」后端
5. 点击「选择设备」→ 选择 ST-Link → 授权
6. 点击「连接」

### 方法 2: probe-rs 后端

1. 安装 probe-rs 工具
2. 启动 RTT Bridge 服务
3. 选择「probe-rs」后端
4. 填写 ELF 文件路径和芯片型号
5. 点击「连接」

## 常见问题

### Q: 找不到 RTT 控制块？

A: 确保：
1. 代码中调用了 `SEGGER_RTT_Init()`
2. MCU 正在运行程序
3. RTT 缓冲区在 RAM 中 (默认 0x20000000 - 0x20040000)

### Q: 输出乱码？

A: 检查：
1. 波特率不适用于 RTT (RTT 不使用波特率)
2. 确保没有其他调试器同时连接

### Q: 连接超时？

A: 确保：
1. ST-Link 已正确连接到 MCU
2. MCU 已供电
3. SWD/SWDIO/SWCLK 引脚连接正确

## RTT 优势

- ✅ 超高速传输 (可达 2MB/s)
- ✅ 几乎零开销 (不影响实时性能)
- ✅ 无需额外引脚 (使用调试接口)
- ✅ 支持多通道
- ✅ 双向通信 (可接收主机数据)
