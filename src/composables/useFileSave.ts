import { ref, computed } from 'vue'

/** 保存结果类型 */
export interface SaveResult {
  success: boolean
  filePath?: string
  error?: string
  code?: string
}

/** 保存状态 */
export type SaveStatus = 'idle' | 'saving' | 'success' | 'error'

/** 支持的文件类型 */
export const FILE_TYPES: Record<string, { description: string; accept: Record<string, string[]> }> = {
  json: {
    description: 'JSON 文件',
    accept: { 'application/json': ['.json'] }
  },
  txt: {
    description: '文本文件',
    accept: { 'text/plain': ['.txt'] }
  },
  csv: {
    description: 'CSV 表格',
    accept: { 'text/csv': ['.csv'] }
  },
  log: {
    description: '日志文件',
    accept: { 'text/plain': ['.log'] }
  }
}

/** 检测是否支持 File System Access API */
const isFileSystemAccessSupported = computed(() => {
  return 'showSaveFilePicker' in window && 'showOpenFilePicker' in window
})

/**
 * 文件保存与导出 Composable
 * 使用 File System Access API（现代浏览器）或回退到传统下载方式
 */
export function useFileSave() {

  /** 当前保存状态 */
  const saveStatus = ref<SaveStatus>('idle')

  /** 最后一次错误信息 */
  const lastError = ref<string>('')

  /** 最后保存的文件路径（仅 File System Access API 可用时） */
  const lastSavedPath = ref<string>('')

  /** 是否支持 File System Access API */
  const isSupported = computed(() => isFileSystemAccessSupported.value)

  /**
   * 获取建议的默认文件名
   */
  function getSuggestedFileName(baseName: string, extension: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    return `${baseName}_${timestamp}.${extension}`
  }

  /**
   * 使用 File System Access API 保存文件
   */
  async function saveWithFileSystemAccess(
    content: string | Blob,
    fileName: string,
    fileType: keyof typeof FILE_TYPES = 'json'
  ): Promise<SaveResult> {
    try {
      saveStatus.value = 'saving'
      lastError.value = ''

      const options: SaveFilePickerOptions = {
        suggestedName: fileName,
        types: [FILE_TYPES[fileType]]
      }

      const handle = await window.showSaveFilePicker(options)
      const writable = await handle.createWritable()

      const blob = content instanceof Blob 
        ? content 
        : new Blob([content], { type: getMimeType(fileType) })

      await writable.write(blob)
      await writable.close()

      lastSavedPath.value = handle.name
      saveStatus.value = 'success'

      return {
        success: true,
        filePath: handle.name
      }
    } catch (err: any) {
      saveStatus.value = 'error'
      
      if (err.name === 'AbortError') {
        lastError.value = '用户取消了保存操作'
        return { success: false, error: '用户取消', code: 'USER_CANCELLED' }
      }
      
      if (err.name === 'NotAllowedError') {
        lastError.value = '没有权限保存到此位置'
        return { success: false, error: '权限不足', code: 'PERMISSION_DENIED' }
      }

      if (err.name === 'QuotaExceededError') {
        lastError.value = '存储空间不足'
        return { success: false, error: '存储空间不足', code: 'QUOTA_EXCEEDED' }
      }

      lastError.value = err.message || '保存失败'
      return { success: false, error: lastError.value, code: 'SAVE_ERROR' }
    }
  }

  /**
   * 使用传统下载方式保存文件
   */
  async function saveWithDownload(
    content: string | Blob,
    fileName: string,
    fileType: keyof typeof FILE_TYPES = 'json'
  ): Promise<SaveResult> {
    try {
      saveStatus.value = 'saving'
      lastError.value = ''

      const blob = content instanceof Blob 
        ? content 
        : new Blob([content], { type: getMimeType(fileType) })

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.style.display = 'none'

      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      setTimeout(() => URL.revokeObjectURL(url), 1000)

      lastSavedPath.value = fileName
      saveStatus.value = 'success'

      return {
        success: true,
        filePath: fileName
      }
    } catch (err: any) {
      saveStatus.value = 'error'
      lastError.value = err.message || '下载失败'
      return { success: false, error: lastError.value, code: 'DOWNLOAD_ERROR' }
    }
  }

  /**
   * 保存文件（自动选择最佳方式）
   */
  async function saveFile(
    content: string | Blob,
    fileName: string,
    fileType: keyof typeof FILE_TYPES = 'json'
  ): Promise<SaveResult> {
    if (isFileSystemAccessSupported.value) {
      return saveWithFileSystemAccess(content, fileName, fileType)
    } else {
      return saveWithDownload(content, fileName, fileType)
    }
  }

  /**
   * 保存到桌面并打开（尝试打开文件）
   * 注意：浏览器环境下无法直接打开本地文件，会尝试在新标签页打开
   */
  async function saveToDesktopAndOpen(
    content: string | Blob,
    fileName: string,
    fileType: keyof typeof FILE_TYPES = 'json'
  ): Promise<SaveResult> {
    const result = await saveFile(content, fileName, fileType)

    if (result.success) {
      /** 尝试打开文件 */
      setTimeout(() => {
        openFile(content, fileType)
      }, 500)
    }

    return result
  }

  /**
   * 尝试打开文件（在新标签页中预览）
   */
  function openFile(content: string | Blob, fileType: keyof typeof FILE_TYPES = 'json'): void {
    try {
      const blob = content instanceof Blob 
        ? content 
        : new Blob([content], { type: getMimeType(fileType) })

      const url = URL.createObjectURL(blob)
      
      /** 在新标签页打开 */
      const newWindow = window.open(url, '_blank')
      
      if (!newWindow) {
        lastError.value = '无法打开新窗口，请检查浏览器弹窗设置'
      }
    } catch (err: any) {
      lastError.value = err.message || '打开文件失败'
    }
  }

  /**
   * 导出数据为 JSON 文件
   */
  async function exportAsJson(
    data: any,
    fileName: string = 'export'
  ): Promise<SaveResult> {
    const content = JSON.stringify(data, null, 2)
    const suggestedName = getSuggestedFileName(fileName, 'json')
    return saveFile(content, suggestedName, 'json')
  }

  /**
   * 导出数据为文本文件
   */
  async function exportAsText(
    content: string,
    fileName: string = 'export'
  ): Promise<SaveResult> {
    const suggestedName = getSuggestedFileName(fileName, 'txt')
    return saveFile(content, suggestedName, 'txt')
  }

  /**
   * 导出数据为 CSV 文件
   */
  async function exportAsCsv(
    data: Record<string, any>[],
    fileName: string = 'export'
  ): Promise<SaveResult> {
    if (data.length === 0) {
      return { success: false, error: '没有数据可导出', code: 'EMPTY_DATA' }
    }

    const headers = Object.keys(data[0])
    const rows = data.map(row => 
      headers.map(h => {
        const value = row[h]
        /** 处理包含逗号或引号的值 */
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return value ?? ''
      }).join(',')
    )
    
    const content = [headers.join(','), ...rows].join('\n')
    const suggestedName = getSuggestedFileName(fileName, 'csv')
    
    return saveFile(content, suggestedName, 'csv')
  }

  /**
   * 重置状态
   */
  function resetStatus(): void {
    saveStatus.value = 'idle'
    lastError.value = ''
    lastSavedPath.value = ''
  }

  /**
   * 获取 MIME 类型
   */
  function getMimeType(fileType: keyof typeof FILE_TYPES): string {
    const types: Record<string, string> = {
      json: 'application/json',
      txt: 'text/plain',
      csv: 'text/csv',
      log: 'text/plain'
    }
    return types[fileType] || 'application/octet-stream'
  }

  return {
    /** 状态 */
    saveStatus,
    lastError,
    lastSavedPath,
    isSupported,

    /** 方法 */
    saveFile,
    saveToDesktopAndOpen,
    openFile,
    exportAsJson,
    exportAsText,
    exportAsCsv,
    getSuggestedFileName,
    resetStatus,

    /** 常量 */
    FILE_TYPES
  }
}

/** 扩展 Window 接口类型声明 */
declare global {
  interface Window {
    showSaveFilePicker: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
    showOpenFilePicker: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>
  }

  interface SaveFilePickerOptions {
    suggestedName?: string
    types?: FilePickerAcceptType[]
    excludeAcceptAllOption?: boolean
  }

  interface OpenFilePickerOptions {
    multiple?: boolean
    types?: FilePickerAcceptType[]
    excludeAcceptAllOption?: boolean
  }

  interface FilePickerAcceptType {
    description?: string
    accept: Record<string, string[]>
  }

  interface FileSystemFileHandle {
    createWritable(): Promise<FileSystemWritableFileStream>
    name: string
  }

  interface FileSystemWritableFileStream extends WritableStream {
    write(data: string | BufferSource | Blob): Promise<void>
    close(): Promise<void>
  }
}
