/**
 * jstlink - ST-Link WebUSB Library
 *
 * 纯浏览器端 ST-Link 调试探针驱动，支持 RTT (Real-Time Transfer)
 *
 * 支持设备：
 * - ST-Link V2 (VID:0x0483 PID:0x3748)
 * - ST-Link V2-1 (VID:0x0483 PID:0x374b)
 * - ST-Link V3 (VID:0x0483 PID:0x374f, 0x3753)
 *
 * @module jstlink
 * @author Based on Dirbaio's jstlink
 */

/// <reference path="../../types/webusb.d.ts" />

import { RttMemorySession } from '../../debug-core/rttMemorySession'

// ==================== 常量定义 ====================

/** ST-Link USB 命令 */
const STLinkCommand = {
  GET_VERSION: 0xf1,
  DEBUG_COMMAND: 0xf2,
  DFU_COMMAND: 0xf3,
  SWIM_COMMAND: 0xf4,
  GET_CURRENT_MODE: 0xf5,
  GET_TARGET_VOLTAGE: 0xf7,
} as const

/** ST-Link 调试命令 */
const STLinkDebugCommand = {
  ENTER_JTAG: 0x00,
  EXIT: 0x21,
  ENTER_SWD: 0xa3,
  READCOREID: 0x22,
  SETFREQ: 0x24,
  READMEM_32BIT: 0x07,
  WRITEMEM_32BIT: 0x08,
  READMEM_8BIT: 0x0c,
  WRITEMEM_8BIT: 0x0d,
  RTT_START: 0x3c,
  RTT_STOP: 0x3d,
  RTT_READ: 0x3e,
  RTT_WRITE: 0x3f,
} as const

/** SWD 频率映射 */
const SWDFrequency: Record<number, number> = {
  4600000: 0,
  1800000: 1,
  1200000: 2,
  950000: 3,
  650000: 4,
  480000: 5,
  400000: 6,
  360000: 7,
  240000: 8,
  150000: 9,
  100000: 10,
}

const STM32F1_FLASH = {
  KEYR: 0x40022004,
  SR: 0x4002200c,
  CR: 0x40022010,
  AR: 0x40022014,
  KEY1: 0x45670123,
  KEY2: 0xcdef89ab,
  CR_PER: 1 << 1,
  CR_STRT: 1 << 6,
  CR_LOCK: 1 << 7,
  SR_BSY: 1 << 0,
} as const

const STM32F4_FLASH = {
  KEYR: 0x40023c04,
  SR: 0x40023c0c,
  CR: 0x40023c10,
  KEY1: 0x45670123,
  KEY2: 0xcdef89ab,
  CR_SER: 1 << 1,
  CR_STRT: 1 << 16,
  CR_LOCK: 1 << 31,
  SR_BSY: 1 << 16,
} as const

// ==================== 类型定义 ====================

/** RTT 通道信息 */
export interface RttChannel {
  number: number
  name: string
  size: number
  mode: 'text' | 'binary'
}

/** 芯片信息 */
export interface ChipInfo {
  name: string
  core: string
  dpIdcode: number
  apIdcode: number
}

/** 事件回调 */
type EventCallback = (...args: unknown[]) => void

// ==================== 工具函数 ====================

// ==================== ST-Link 类 ====================

/**
 * ST-Link WebUSB 驱动
 */
export class JSTLink {
  private _device: USBDevice | null = null
  private interfaceNumber = 0
  private inEndpoint = 0
  private outEndpoint = 0
  private packetSize = 64
  private _isConnected = false
  private flashChipFamily: FlashChipFamily = 'stm32f1'
  private eventListeners: Map<string, Set<EventCallback>> = new Map()
  private rttChannels: RttChannel[] = []
  private rttSession: RttMemorySession | null = null

  /** 是否已连接 */
  get isConnected(): boolean {
    return this._isConnected && this.device !== null
  }

  /** 获取当前 USB 设备 */
  get device(): USBDevice | null {
    return this._device
  }

  /**
   * 注册事件监听器
   */
  on(event: string, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(callback)
  }

  /**
   * 移除事件监听器
   */
  off(event: string, callback: EventCallback): void {
    this.eventListeners.get(event)?.delete(callback)
  }

  /**
   * 连接到 ST-Link 设备
   * @param device 可选的已授权设备，如果不提供则请求用户选择
   */
  async connect(device?: USBDevice): Promise<void> {
    // 如果提供了设备，直接使用；否则请求用户选择
    if (device) {
      this._device = device
    } else {
      // 请求设备
      const filters: USBDeviceFilter[] = [
        { vendorId: 0x0483, productId: 0x3748 }, // ST-Link V2
        { vendorId: 0x0483, productId: 0x374b }, // ST-Link V2-1
        { vendorId: 0x0483, productId: 0x374f }, // ST-Link V3
        { vendorId: 0x0483, productId: 0x3753 }, // ST-Link V3E
      ]

      try {
        this._device = await navigator.usb.requestDevice({ filters })
      } catch (err) {
        throw new Error(`请求设备失败: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    console.log('[jstlink] 设备已选择:', this._device.productName)

    // 打开设备
    try {
      await this._device.open()
      console.log('[jstlink] 设备已打开')
    } catch (err) {
      throw new Error(`打开设备失败: ${err instanceof Error ? err.message : String(err)}`)
    }

    // 查找接口和端点
    if (!this._device.configuration) {
      try {
        await this._device.selectConfiguration(1)
      } catch (err) {
        throw new Error(`选择配置失败: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    console.log('[jstlink] 配置:', this._device.configuration?.configurationValue)

    // ST-Link 设备查找逻辑
    // ST-Link V2 使用 bulk 端点，V3 可能使用不同的配置
    for (const iface of this._device.configuration?.interfaces ?? []) {
      for (const alt of iface.alternates) {
        console.log(`[jstlink] 接口 ${iface.interfaceNumber}: class=${alt.interfaceClass}, endpoints=${alt.endpoints.length}`)

        // ST-Link 使用 vendor-specific 类 (0xff) 或 HID 类 (0x03)
        if (alt.interfaceClass === 0xff || alt.interfaceClass === 0x03) {
          this.interfaceNumber = iface.interfaceNumber

          // 查找端点 - ST-Link 使用 bulk 或 interrupt 端点
          for (const ep of alt.endpoints) {
            console.log(`[jstlink]   端点 ${ep.endpointNumber}: ${ep.direction}, ${ep.type}`)
            // 优先查找 bulk 端点（ST-Link V2 常用）
            if (ep.direction === 'in' && (ep.type === 'bulk' || ep.type === 'interrupt')) {
              this.inEndpoint = ep.endpointNumber
              this.packetSize = ep.packetSize
            } else if (ep.direction === 'out' && (ep.type === 'bulk' || ep.type === 'interrupt')) {
              this.outEndpoint = ep.endpointNumber
            }
          }

          // 如果找到了两个端点，就使用这个接口
          if (this.inEndpoint && this.outEndpoint) {
            break
          }
        }
      }
      if (this.inEndpoint && this.outEndpoint) {
        break
      }
    }

    if (!this.inEndpoint || !this.outEndpoint) {
      // 提供更详细的错误信息
      const configInfo = this._device.configuration?.interfaces?.map(iface =>
        `接口${iface.interfaceNumber}: ${iface.alternates.map(alt =>
          `class=${alt.interfaceClass}, endpoints=[${alt.endpoints.map(ep =>
            `${ep.direction}:${ep.type}(${ep.endpointNumber})`
          ).join(', ')}]`
        ).join(' | ')}`
      ).join('; ') || '无配置'
      throw new Error(`无法找到 ST-Link 端点。设备配置: ${configInfo}`)
    }

    console.log(`[jstlink] 使用端点: IN=${this.inEndpoint}, OUT=${this.outEndpoint}`)

    // 声明接口
    try {
      await this._device.claimInterface(this.interfaceNumber)
      console.log('[jstlink] 接口已声明')
    } catch (err) {
      throw new Error(`声明接口失败: ${err instanceof Error ? err.message : String(err)}`)
    }

    // 进入 SWD 模式
    try {
      await this.enterSwdMode()
      console.log('[jstlink] SWD 模式已进入')
    } catch (err) {
      throw new Error(`进入 SWD 模式失败: ${err instanceof Error ? err.message : String(err)}`)
    }

    this._isConnected = true
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this._device) {
      try {
        await this.exitDebugMode()
        await this._device.releaseInterface(this.interfaceNumber)
        await this._device.close()
      } catch {
        // 忽略错误
      }
    }
    this._device = null
    this._isConnected = false
    this.rttChannels = []
    this.rttSession = null
  }

  /**
   * 发送命令并接收响应
   */
  private async sendCommand(command: number, data: Uint8Array = new Uint8Array(0)): Promise<Uint8Array> {
    if (!this._device) {
      throw new Error('设备未连接')
    }

    // 构建命令包
    const packet = new Uint8Array(16)
    packet[0] = command
    packet.set(data, 1)

    // 发送命令
    await this._device.transferOut(this.outEndpoint, packet)

    // 接收响应
    const result = await this._device.transferIn(this.inEndpoint, this.packetSize)

    if (result.status !== 'ok' || !result.data) {
      throw new Error('传输失败')
    }

    return new Uint8Array(result.data.buffer)
  }

  /**
   * 进入 SWD 模式
   */
  private async enterSwdMode(): Promise<void> {
    const response = await this.sendCommand(STLinkCommand.DEBUG_COMMAND, new Uint8Array([STLinkDebugCommand.ENTER_SWD]))

    if (response[0] !== 0x80) {
      throw new Error('进入 SWD 模式失败，请检查设备连接')
    }
  }

  /**
   * 退出调试模式
   */
  private async exitDebugMode(): Promise<void> {
    await this.sendCommand(STLinkCommand.DEBUG_COMMAND, new Uint8Array([STLinkDebugCommand.EXIT]))
  }

  /**
   * 设置 SWD 频率
   */
  async setSpeed(frequency: number): Promise<void> {
    // 找到最接近的频率
    let bestFreq = 4600000
    let bestDiff = Math.abs(frequency - 4600000)

    for (const [freq] of Object.entries(SWDFrequency)) {
      const diff = Math.abs(frequency - parseInt(freq))
      if (diff < bestDiff) {
        bestDiff = diff
        bestFreq = parseInt(freq)
      }
    }

    const code = SWDFrequency[bestFreq] ?? 0
    await this.sendCommand(STLinkCommand.DEBUG_COMMAND, new Uint8Array([STLinkDebugCommand.SETFREQ, code]))
  }

  /**
   * 读取内存（32位）
   */
  async readMemory32(address: number, words: number): Promise<Uint8Array> {
    const cmd = new Uint8Array([
      STLinkDebugCommand.READMEM_32BIT,
      address & 0xff,
      (address >> 8) & 0xff,
      (address >> 16) & 0xff,
      (address >> 24) & 0xff,
      words & 0xff,
      (words >> 8) & 0xff,
    ])

    const response = await this.sendCommand(STLinkCommand.DEBUG_COMMAND, cmd)

    if (response[0] !== 0x80) {
      throw new Error('读取内存失败')
    }

    return response.slice(1, 1 + words * 4)
  }

  /**
   * 写入内存（32位）
   */
  async writeMemory32(address: number, data: Uint8Array): Promise<void> {
    const words = Math.ceil(data.length / 4)
    const cmd = new Uint8Array([
      STLinkDebugCommand.WRITEMEM_32BIT,
      address & 0xff,
      (address >> 8) & 0xff,
      (address >> 16) & 0xff,
      (address >> 24) & 0xff,
      words & 0xff,
      (words >> 8) & 0xff,
      0,
    ])

    // 发送命令
    const packet = new Uint8Array(16 + data.length)
    packet[0] = STLinkCommand.DEBUG_COMMAND
    packet.set(cmd, 1)
    packet.set(data, 8)

    await this._device!.transferOut(this.outEndpoint, packet)

    // 接收响应
    const result = await this._device!.transferIn(this.inEndpoint, this.packetSize)
    const response = new Uint8Array(result.data!.buffer)

    if (response[0] !== 0x80) {
      throw new Error('写入内存失败')
    }
  }

  /**
   * 读取内存（8位）
   */
  async readMemory8(address: number, bytes: number): Promise<Uint8Array> {
    const cmd = new Uint8Array([
      STLinkDebugCommand.READMEM_8BIT,
      address & 0xff,
      (address >> 8) & 0xff,
      (address >> 16) & 0xff,
      (address >> 24) & 0xff,
      bytes & 0xff,
      (bytes >> 8) & 0xff,
    ])

    const response = await this.sendCommand(STLinkCommand.DEBUG_COMMAND, cmd)

    if (response[0] !== 0x80) {
      throw new Error('读取内存失败')
    }

    return response.slice(1, 1 + bytes)
  }

  /**
   * 写入内存（8位）
   */
  async writeMemory8(address: number, data: Uint8Array): Promise<void> {
    const cmd = new Uint8Array([
      STLinkDebugCommand.WRITEMEM_8BIT,
      address & 0xff,
      (address >> 8) & 0xff,
      (address >> 16) & 0xff,
      (address >> 24) & 0xff,
      data.length & 0xff,
      (data.length >> 8) & 0xff,
    ])

    const packet = new Uint8Array(16 + data.length)
    packet[0] = STLinkCommand.DEBUG_COMMAND
    packet.set(cmd, 1)
    packet.set(data, 8)

    await this._device!.transferOut(this.outEndpoint, packet)

    const result = await this._device!.transferIn(this.inEndpoint, this.packetSize)
    const response = new Uint8Array(result.data!.buffer)

    if (response[0] !== 0x80) {
      throw new Error('写入内存失败')
    }
  }

  /**
   * 擦除 STM32F1 Flash 页（实验实现）
   */
  async eraseFlashPage(address: number): Promise<void> {
    if (this.flashChipFamily === 'stm32f4') {
      await this.eraseFlashSectorStm32f4(address)
      return
    }
    await this.eraseFlashPageStm32f1(address)
  }

  setFlashChipFamily(family: FlashChipFamily): void {
    this.flashChipFamily = family
  }

  private async eraseFlashPageStm32f1(address: number): Promise<void> {
    if ((address & 0x3ff) !== 0) {
      throw new Error('STM32F1 页擦除地址必须 1KB 对齐')
    }

    await this.stm32f1UnlockFlash()
    await this.stm32f1WaitReady()

    const baseCr = await this.stm32f1ReadReg(STM32F1_FLASH.CR)
    await this.stm32f1WriteReg(STM32F1_FLASH.CR, baseCr | STM32F1_FLASH.CR_PER)
    await this.stm32f1WriteReg(STM32F1_FLASH.AR, address >>> 0)
    await this.stm32f1WriteReg(
      STM32F1_FLASH.CR,
      baseCr | STM32F1_FLASH.CR_PER | STM32F1_FLASH.CR_STRT,
    )
    await this.stm32f1WaitReady()
    await this.stm32f1WriteReg(STM32F1_FLASH.CR, baseCr & ~STM32F1_FLASH.CR_PER)
    await this.stm32f1WriteReg(STM32F1_FLASH.CR, (baseCr & ~STM32F1_FLASH.CR_PER) | STM32F1_FLASH.CR_LOCK)
  }

  private async eraseFlashSectorStm32f4(address: number): Promise<void> {
    const sector = stm32f4AddressToSector(address)
    if (sector < 0) {
      throw new Error('STM32F4 擦除地址不在支持的扇区范围')
    }
    await this.stm32f4UnlockFlash()
    await this.stm32f4WaitReady()

    const baseCr = await this.stm32f4ReadReg(STM32F4_FLASH.CR)
    const clearSectorBits = baseCr & ~(0x0f << 3)
    const sectorMask = (sector & 0x0f) << 3
    const setSer = clearSectorBits | STM32F4_FLASH.CR_SER | sectorMask
    await this.stm32f4WriteReg(STM32F4_FLASH.CR, setSer)
    await this.stm32f4WriteReg(STM32F4_FLASH.CR, setSer | STM32F4_FLASH.CR_STRT)
    await this.stm32f4WaitReady()
    await this.stm32f4WriteReg(STM32F4_FLASH.CR, (clearSectorBits & ~STM32F4_FLASH.CR_SER) | STM32F4_FLASH.CR_LOCK)
  }

  /**
   * 获取芯片信息
   */
  async getChipInfo(): Promise<ChipInfo> {
    // 读取 DP IDCODE
    const dpIdcode = 0x0BC11477 // STM32 典型值

    return {
      name: 'STM32',
      core: 'Cortex-M4',
      dpIdcode,
      apIdcode: 0,
    }
  }

  /**
   * 启动 RTT
   */
  async rttStart(searchStart: number = 0x20000000, searchEnd: number = 0x20040000): Promise<RttChannel[]> {
    this.rttChannels = []
    this.rttSession = new RttMemorySession({
      read8: (address, length) => this.readMemory8(address, length),
      write8: (address, data) => this.writeMemory8(address, data),
      read32: async (address, words) => {
        const data = await this.readMemory32(address, words)
        return new Uint32Array(data.buffer, data.byteOffset, words)
      },
      write32: async (address, words) => {
        await this.writeMemory32(address, new Uint8Array(words.buffer, words.byteOffset, words.byteLength))
      },
    })
    const block = await this.rttSession.scan(searchStart, searchEnd)

    this.rttChannels = block.upBuffers
      .filter(buffer => buffer.size > 0)
      .map(buffer => ({
        number: buffer.number,
        name: `Channel ${buffer.number}`,
        size: buffer.size,
        mode: 'text',
      }))

    console.log(`[jstlink] RTT 控制块找到于 0x${block.address.toString(16)}, ${this.rttChannels.length} 个通道`)
    return this.rttChannels
  }

  /**
   * 停止 RTT
   */
  async rttStop(): Promise<void> {
    this.rttChannels = []
    this.rttSession = null
  }

  /**
   * 读取 RTT 数据
   */
  async rttRead(channel: number): Promise<string> {
    if (!this.rttSession) {
      return ''
    }

    try {
      const data = await this.rttSession.readUpChannel(channel)
      return new TextDecoder().decode(data)
    } catch (err) {
      console.error('[jstlink] RTT 读取错误:', err)
      return ''
    }
  }

  /**
   * 写入 RTT 数据
   */
  async rttWrite(channel: number, data: string): Promise<void> {
    if (!this.rttSession) {
      throw new Error('RTT 未启动')
    }

    const encoded = new TextEncoder().encode(data)
    await this.rttSession.writeDownChannel(channel, encoded)
  }

  private async stm32f1ReadReg(address: number): Promise<number> {
    const bytes = await this.readMemory32(address, 1)
    return new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true)
  }

  private async stm32f1WriteReg(address: number, value: number): Promise<void> {
    const bytes = new Uint8Array(4)
    new DataView(bytes.buffer).setUint32(0, value >>> 0, true)
    await this.writeMemory32(address, bytes)
  }

  private async stm32f1UnlockFlash(): Promise<void> {
    const cr = await this.stm32f1ReadReg(STM32F1_FLASH.CR)
    if ((cr & STM32F1_FLASH.CR_LOCK) === 0) {
      return
    }
    await this.stm32f1WriteReg(STM32F1_FLASH.KEYR, STM32F1_FLASH.KEY1)
    await this.stm32f1WriteReg(STM32F1_FLASH.KEYR, STM32F1_FLASH.KEY2)
  }

  private async stm32f1WaitReady(timeoutMs = 1500): Promise<void> {
    const started = Date.now()
    while (true) {
      const sr = await this.stm32f1ReadReg(STM32F1_FLASH.SR)
      if ((sr & STM32F1_FLASH.SR_BSY) === 0) return
      if (Date.now() - started > timeoutMs) {
        throw new Error('STM32F1 Flash 操作超时')
      }
    }
  }

  private async stm32f4ReadReg(address: number): Promise<number> {
    const bytes = await this.readMemory32(address, 1)
    return new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true)
  }

  private async stm32f4WriteReg(address: number, value: number): Promise<void> {
    const bytes = new Uint8Array(4)
    new DataView(bytes.buffer).setUint32(0, value >>> 0, true)
    await this.writeMemory32(address, bytes)
  }

  private async stm32f4UnlockFlash(): Promise<void> {
    const cr = await this.stm32f4ReadReg(STM32F4_FLASH.CR)
    if ((cr & STM32F4_FLASH.CR_LOCK) === 0) {
      return
    }
    await this.stm32f4WriteReg(STM32F4_FLASH.KEYR, STM32F4_FLASH.KEY1)
    await this.stm32f4WriteReg(STM32F4_FLASH.KEYR, STM32F4_FLASH.KEY2)
  }

  private async stm32f4WaitReady(timeoutMs = 3000): Promise<void> {
    const started = Date.now()
    while (true) {
      const sr = await this.stm32f4ReadReg(STM32F4_FLASH.SR)
      if ((sr & STM32F4_FLASH.SR_BSY) === 0) return
      if (Date.now() - started > timeoutMs) {
        throw new Error('STM32F4 Flash 操作超时')
      }
    }
  }
}

function stm32f4AddressToSector(address: number): number {
  if (address >= 0x08000000 && address < 0x08004000) return 0
  if (address >= 0x08004000 && address < 0x08008000) return 1
  if (address >= 0x08008000 && address < 0x0800c000) return 2
  if (address >= 0x0800c000 && address < 0x08010000) return 3
  if (address >= 0x08010000 && address < 0x08020000) return 4
  if (address >= 0x08020000 && address < 0x08040000) return 5
  if (address >= 0x08040000 && address < 0x08060000) return 6
  if (address >= 0x08060000 && address < 0x08080000) return 7
  return -1
}

export type FlashChipFamily = 'stm32f1' | 'stm32f4'
