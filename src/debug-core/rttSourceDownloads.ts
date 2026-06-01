export type RttSourceFileId =
  | 'segger-rtt-c'
  | 'segger-rtt-h'
  | 'segger-rtt-conf-h'
  | 'segger-rtt-printf-c'

export interface RttSourceFile {
  id: RttSourceFileId
  fileName: string
  path: string
  url: string
  description: string
}

export interface RttSourceDownloadResult {
  fileName: string
  url: string
  bytes: number
}

export interface RttSourceDownloadOptions {
  fetcher?: typeof fetch
  saveText?: (content: string, fileName: string) => void | Promise<void>
}

export const RTT_SOURCE_REPOSITORY_URL = 'https://github.com/SEGGERMicro/RTT'

const RTT_SOURCE_RAW_BASE = 'https://raw.githubusercontent.com/SEGGERMicro/RTT/main'

export const RTT_SOURCE_FILES: RttSourceFile[] = [
  {
    id: 'segger-rtt-c',
    fileName: 'SEGGER_RTT.c',
    path: 'RTT/SEGGER_RTT.c',
    url: `${RTT_SOURCE_RAW_BASE}/RTT/SEGGER_RTT.c`,
    description: 'RTT 核心实现，定义控制块和默认 Up/Down buffer。',
  },
  {
    id: 'segger-rtt-h',
    fileName: 'SEGGER_RTT.h',
    path: 'RTT/SEGGER_RTT.h',
    url: `${RTT_SOURCE_RAW_BASE}/RTT/SEGGER_RTT.h`,
    description: 'RTT API 头文件，业务代码包含此文件调用输出接口。',
  },
  {
    id: 'segger-rtt-conf-h',
    fileName: 'SEGGER_RTT_Conf.h',
    path: 'Config/SEGGER_RTT_Conf.h',
    url: `${RTT_SOURCE_RAW_BASE}/Config/SEGGER_RTT_Conf.h`,
    description: 'RTT 编译配置，包含 buffer、通道数量和锁配置。',
  },
  {
    id: 'segger-rtt-printf-c',
    fileName: 'SEGGER_RTT_Printf.c',
    path: 'RTT/SEGGER_RTT_Printf.c',
    url: `${RTT_SOURCE_RAW_BASE}/RTT/SEGGER_RTT_Printf.c`,
    description: '轻量 printf 支持，用于 SEGGER_RTT_printf()。',
  },
]

export async function downloadRttSourceFile(
  file: RttSourceFile,
  options: RttSourceDownloadOptions = {},
): Promise<RttSourceDownloadResult> {
  const fetcher = options.fetcher ?? fetch
  const response = await fetcher(file.url, { cache: 'no-cache' })

  if (!response.ok) {
    throw new Error(`下载 ${file.fileName} 失败: ${response.status} ${response.statusText} (${file.url})`)
  }

  const content = await response.text()
  const saveText = options.saveText ?? saveTextAsDownload
  await saveText(content, file.fileName)

  return {
    fileName: file.fileName,
    url: file.url,
    bytes: new Blob([content]).size,
  }
}

function saveTextAsDownload(content: string, fileName: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  link.style.display = 'none'

  try {
    document.body.appendChild(link)
    link.click()
  } finally {
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
}
