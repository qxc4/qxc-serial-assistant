/**
 * 平台检测工具
 * 仅用于 Web 端功能检测
 */

/** 平台类型 */
export type Platform = 'web'

/** 平台能力 */
export interface PlatformCapabilities {
  /** 是否支持 Web Serial API */
  webSerial: boolean
  /** 是否支持 Web Bluetooth API */
  webBluetooth: boolean
  /** 是否支持本地文件系统 */
  fileSystem: boolean
}

/** 检测当前平台 */
export function detectPlatform(): Platform {
  return 'web'
}

/** 获取平台能力 */
export function getCapabilities(): PlatformCapabilities {
  return {
    webSerial: typeof navigator !== 'undefined' && 'serial' in navigator,
    webBluetooth: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
    fileSystem: false,
  }
}

/** 平台 API */
export const platform = {
  /** 当前平台类型 */
  current: 'web' as const,

  /** 平台能力 */
  capabilities: getCapabilities(),

  /**
   * 获取应用版本
   */
  getVersion(): string {
    return '2.0.0'
  },

  /**
   * 打开外部链接
   */
  async openExternal(url: string): Promise<void> {
    window.open(url, '_blank')
  },
}

export default platform
