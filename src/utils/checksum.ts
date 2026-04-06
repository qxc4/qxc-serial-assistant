/**
 * 校验算法工具
 * 提供 CRC16、CRC32、LRC、Checksum、MD5 等常用校验算法
 */

/**
 * CRC16 查找表 (Modbus 多项式 0xA001)
 */
const CRC16_TABLE: number[] = (() => {
  const table: number[] = []
  for (let i = 0; i < 256; i++) {
    let crc = i
    for (let j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xA001
      } else {
        crc >>= 1
      }
    }
    table[i] = crc
  }
  return table
})()

/**
 * CRC32 查找表 (多项式 0xEDB88320)
 */
const CRC32_TABLE: number[] = (() => {
  const table: number[] = []
  for (let i = 0; i < 256; i++) {
    let crc = i
    for (let j = 0; j < 8; j++) {
      if (crc & 0x00000001) {
        crc = (crc >> 1) ^ 0xEDB88320
      } else {
        crc >>= 1
      }
    }
    table[i] = crc >>> 0
  }
  return table
})()

/**
 * 计算 CRC16 校验码 (Modbus 标准)
 * @param data 字节数组
 * @returns CRC16 值 (低字节在前)
 */
export function crc16(data: number[]): number {
  let crc = 0xFFFF
  for (const byte of data) {
    crc = (crc >> 8) ^ CRC16_TABLE[(crc ^ byte) & 0xFF]
  }
  return crc
}

/**
 * 计算 CRC16 并返回字节数组 (低字节在前)
 * @param data 字节数组
 * @returns [低字节, 高字节]
 */
export function crc16Bytes(data: number[]): [number, number] {
  const result = crc16(data)
  return [result & 0xFF, (result >> 8) & 0xFF]
}

/**
 * 验证 CRC16 校验码
 * @param data 包含 CRC 的完整数据帧
 * @returns 校验是否通过
 */
export function verifyCrc16(data: number[]): boolean {
  if (data.length < 3) return false
  const payload = data.slice(0, -2)
  const receivedCrc = (data[data.length - 1] << 8) | data[data.length - 2]
  const calculatedCrc = crc16(payload)
  return receivedCrc === calculatedCrc
}

/**
 * 计算 CRC32 校验码
 * @param data 字节数组
 * @returns CRC32 值
 */
export function crc32(data: number[]): number {
  let crc = 0xFFFFFFFF
  for (const byte of data) {
    crc = (crc >> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xFF]
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

/**
 * 计算 CRC32 并返回十六进制字符串
 * @param data 字节数组
 * @returns 8位十六进制字符串
 */
export function crc32Hex(data: number[]): string {
  return crc32(data).toString(16).toUpperCase().padStart(8, '0')
}

/**
 * 计算 LRC 校验码 (Modbus ASCII)
 * @param data 字节数组 (不含起始符和结束符)
 * @returns LRC 值
 */
export function lrc(data: number[]): number {
  let sum = 0
  for (const byte of data) {
    sum = (sum + byte) & 0xFF
  }
  return ((~sum + 1) & 0xFF)
}

/**
 * 计算 LRC 并返回十六进制字符串
 * @param data 字节数组
 * @returns 2位十六进制字符串
 */
export function lrcHex(data: number[]): string {
  return lrc(data).toString(16).toUpperCase().padStart(2, '0')
}

/**
 * 验证 LRC 校验码
 * @param data 包含 LRC 的完整数据 (不含起始符和结束符)
 * @returns 校验是否通过
 */
export function verifyLrc(data: number[]): boolean {
  if (data.length < 2) return false
  const payload = data.slice(0, -1)
  const receivedLrc = data[data.length - 1]
  const calculatedLrc = lrc(payload)
  return receivedLrc === calculatedLrc
}

/**
 * 计算累加和校验
 * @param data 字节数组
 * @returns 累加和 (取低字节)
 */
export function checksum(data: number[]): number {
  let sum = 0
  for (const byte of data) {
    sum = (sum + byte) & 0xFF
  }
  return sum
}

/**
 * 计算累加和校验 (checksum 的别名)
 * @param data 字节数组
 * @returns 累加和 (取低字节)
 */
export function sumChecksum(data: number[]): number {
  return checksum(data)
}

/**
 * 计算异或校验 (XOR)
 * @param data 字节数组
 * @returns 异或结果
 */
export function xorChecksum(data: number[]): number {
  let result = 0
  for (const byte of data) {
    result ^= byte
  }
  return result
}

/**
 * 字符串转字节数组
 * @param str 字符串
 * @param encoding 编码方式
 * @returns 字节数组
 */
export function stringToBytes(str: string, encoding: 'ascii' | 'utf8' | 'hex' = 'ascii'): number[] {
  if (encoding === 'hex') {
    const bytes: number[] = []
    for (let i = 0; i < str.length; i += 2) {
      bytes.push(parseInt(str.substr(i, 2), 16))
    }
    return bytes
  }
  
  const encoder = new TextEncoder()
  return Array.from(encoder.encode(str))
}

/**
 * 字节数组转十六进制字符串
 * @param bytes 字节数组
 * @param separator 分隔符
 * @returns 十六进制字符串
 */
export function bytesToHex(bytes: number[], separator: string = ' '): string {
  return bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(separator)
}

/**
 * 十六进制字符串转字节数组
 * @param hex 十六进制字符串
 * @returns 字节数组
 */
export function hexToBytes(hex: string): number[] {
  const cleanHex = hex.replace(/\s+/g, '')
  const bytes: number[] = []
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes.push(parseInt(cleanHex.substr(i, 2), 16))
  }
  return bytes
}

/**
 * 简易 MD5 实现 (用于数据校验，非安全用途)
 * 注意: 浏览器环境建议使用 Web Crypto API 或 spark-md5 库
 */
export function md5Simple(data: number[]): string {
  const K: number[] = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee,
    0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
    0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
    0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
    0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039,
    0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391
  ]

  const S: number[] = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ]

  const leftRotate = (x: number, c: number): number => {
    return ((x << c) | (x >>> (32 - c))) >>> 0
  }

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  const msgLen = data.length
  const bitLen = msgLen * 8
  
  data.push(0x80)
  while ((data.length % 64) !== 56) {
    data.push(0x00)
  }
  
  for (let i = 0; i < 8; i++) {
    data.push((bitLen >>> (i * 8)) & 0xFF)
  }

  for (let offset = 0; offset < data.length; offset += 64) {
    const M = new Uint32Array(16)
    for (let i = 0; i < 16; i++) {
      M[i] = (data[offset + i * 4]) |
             (data[offset + i * 4 + 1] << 8) |
             (data[offset + i * 4 + 2] << 16) |
             (data[offset + i * 4 + 3] << 24)
    }

    let A = a0
    let B = b0
    let C = c0
    let D = d0

    for (let i = 0; i < 64; i++) {
      let F: number
      let g: number

      if (i < 16) {
        F = (B & C) | ((~B >>> 0) & D)
        g = i
      } else if (i < 32) {
        F = (D & B) | ((~D >>> 0) & C)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        F = B ^ C ^ D
        g = (3 * i + 5) % 16
      } else {
        F = C ^ (B | (~D >>> 0))
        g = (7 * i) % 16
      }

      F = (F + A + K[i] + M[g]) >>> 0
      A = D
      D = C
      C = B
      B = (B + leftRotate(F, S[i])) >>> 0
    }

    a0 = (a0 + A) >>> 0
    b0 = (b0 + B) >>> 0
    c0 = (c0 + C) >>> 0
    d0 = (d0 + D) >>> 0
  }

  const result = new Uint8Array(16)
  for (let i = 0; i < 4; i++) {
    result[i] = (a0 >>> (i * 8)) & 0xFF
    result[i + 4] = (b0 >>> (i * 8)) & 0xFF
    result[i + 8] = (c0 >>> (i * 8)) & 0xFF
    result[i + 12] = (d0 >>> (i * 8)) & 0xFF
  }

  return Array.from(result).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 校验结果
 */
export interface ChecksumResult {
  type: string
  value: string
  bytes?: number[]
}

/**
 * 计算所有校验值
 * @param data 字节数组
 * @returns 所有校验结果
 */
export function calculateAllChecksums(data: number[]): ChecksumResult[] {
  return [
    { type: 'CRC16', value: crc16(data).toString(16).toUpperCase().padStart(4, '0'), bytes: Array.from(crc16Bytes(data)) },
    { type: 'CRC32', value: crc32Hex(data) },
    { type: 'LRC', value: lrcHex(data) },
    { type: 'Checksum', value: checksum(data).toString(16).toUpperCase().padStart(2, '0') },
    { type: 'XOR', value: xorChecksum(data).toString(16).toUpperCase().padStart(2, '0') },
    { type: 'MD5', value: md5Simple([...data]) }
  ]
}
