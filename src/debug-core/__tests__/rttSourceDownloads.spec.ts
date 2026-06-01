import { describe, expect, test, vi } from 'vitest'
import {
  RTT_SOURCE_FILES,
  RTT_SOURCE_REPOSITORY_URL,
  downloadRttSourceFile,
} from '../rttSourceDownloads'

describe('RTT source downloads', () => {
  test('lists the complete SEGGER RTT integration file set', () => {
    expect(RTT_SOURCE_REPOSITORY_URL).toBe('https://github.com/SEGGERMicro/RTT')
    expect(RTT_SOURCE_FILES.map(file => file.fileName)).toEqual([
      'SEGGER_RTT.c',
      'SEGGER_RTT.h',
      'SEGGER_RTT_Conf.h',
      'SEGGER_RTT_Printf.c',
    ])
    expect(RTT_SOURCE_FILES.map(file => file.path)).toEqual([
      'RTT/SEGGER_RTT.c',
      'RTT/SEGGER_RTT.h',
      'Config/SEGGER_RTT_Conf.h',
      'RTT/SEGGER_RTT_Printf.c',
    ])
    expect(RTT_SOURCE_FILES.every(file => file.url.startsWith('https://raw.githubusercontent.com/SEGGERMicro/RTT/'))).toBe(true)
  })

  test('downloads a selected source file through injectable fetch and save handlers', async () => {
    const fetcher = vi.fn(async () => new Response('source-content', { status: 200 }))
    const saveText = vi.fn()

    const result = await downloadRttSourceFile(RTT_SOURCE_FILES[0]!, {
      fetcher,
      saveText,
    })

    expect(fetcher).toHaveBeenCalledWith(RTT_SOURCE_FILES[0]!.url, { cache: 'no-cache' })
    expect(saveText).toHaveBeenCalledWith('source-content', 'SEGGER_RTT.c')
    expect(result).toEqual({
      fileName: 'SEGGER_RTT.c',
      url: RTT_SOURCE_FILES[0]!.url,
      bytes: 14,
    })
  })

  test('reports the upstream URL when the official source cannot be fetched', async () => {
    const fetcher = vi.fn(async () => new Response('missing', { status: 404, statusText: 'Not Found' }))

    await expect(downloadRttSourceFile(RTT_SOURCE_FILES[1]!, { fetcher })).rejects.toThrow(
      `下载 SEGGER_RTT.h 失败: 404 Not Found (${RTT_SOURCE_FILES[1]!.url})`,
    )
  })
})
