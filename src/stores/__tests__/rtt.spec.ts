import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRttStore } from '../rtt'
import { rttService } from '../../services/rttService'
import type { RttLogEntry } from '../../types/rtt'

// Mock rttService
vi.mock('../../services/rttService', () => ({
  rttService: {
    isWsConnected: false,
    registerCallbacks: vi.fn(),
    connectWs: vi.fn(),
    disconnectWs: vi.fn(),
    connectRtt: vi.fn(),
    disconnectRtt: vi.fn(),
    sendData: vi.fn(),
    listProbes: vi.fn(),
  },
}))

describe('RTT Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('初始状态', () => {
    it('应该有正确的初始连接状态', () => {
      const store = useRttStore()
      expect(store.connectionState).toBe('disconnected')
      expect(store.isConnected).toBe(false)
      expect(store.backend).toBe('probe-rs')
    })

    it('应该有空的日志列表', () => {
      const store = useRttStore()
      expect(store.logs).toEqual([])
      expect(store.filteredLogs).toEqual([])
    })

    it('应该有空的探针和通道列表', () => {
      const store = useRttStore()
      expect(store.probes).toEqual([])
      expect(store.channels).toEqual([])
    })

    it('应该有默认的过滤器配置', () => {
      const store = useRttStore()
      expect(store.filter.levels).toEqual(['debug', 'info', 'warn', 'error', 'trace'])
      expect(store.filter.channels).toEqual([])
      expect(store.filter.searchText).toBe('')
    })

    it('应该有默认的配置值', () => {
      const store = useRttStore()
      expect(store.chipModel).toBe('STM32F407VGTx')
      expect(store.protocol).toBe('Swd')
      expect(store.openocdHost).toBe('127.0.0.1')
      expect(store.openocdPort).toBe(9090)
      expect(store.jlinkHost).toBe('127.0.0.1')
      expect(store.jlinkPort).toBe(19021)
    })

    it('初始日志统计应为零', () => {
      const store = useRttStore()
      expect(store.logStats.total).toBe(0)
      expect(store.logStats.errors).toBe(0)
      expect(store.logStats.warnings).toBe(0)
    })
  })

  describe('服务回调注册', () => {
    it('应该在 store 创建时注册回调', () => {
      useRttStore()
      expect(rttService.registerCallbacks).toHaveBeenCalledTimes(1)
    })
  })

  describe('连接操作', () => {
    it('connect 应该调用 rttService.connectRtt', () => {
      const store = useRttStore()
      store.connect()
      expect(rttService.connectWs).toHaveBeenCalled()
      expect(rttService.connectRtt).toHaveBeenCalledTimes(1)
    })

    it('connect 时应将状态设为 connecting', () => {
      const store = useRttStore()
      store.connect()
      expect(store.connectionState).toBe('connecting')
    })

    it('连接中或已连接时不应重复连接', () => {
      const store = useRttStore()
      store.connect()
      vi.clearAllMocks()
      store.connect()
      expect(rttService.connectRtt).not.toHaveBeenCalled()
    })

    it('disconnect 应该调用 rttService.disconnectRtt', () => {
      const store = useRttStore()
      store.disconnect()
      expect(rttService.disconnectRtt).toHaveBeenCalled()
      expect(store.connectionState).toBe('disconnected')
    })
  })

  describe('buildConnectConfig', () => {
    it('应该为 probe-rs 生成正确的配置', () => {
      const store = useRttStore()
      const config = store.buildConnectConfig()
      expect(config.backend).toBe('probe-rs')
      expect(config.probeRs).toEqual({
        chip: 'STM32F407VGTx',
        protocol: 'Swd',
        probe: undefined,
      })
    })

    it('应该为 openocd 生成正确的配置', () => {
      const store = useRttStore()
      store.backend = 'openocd'
      const config = store.buildConnectConfig()
      expect(config.backend).toBe('openocd')
      expect(config.openocd).toEqual({
        host: '127.0.0.1',
        port: 9090,
        channel: 0,
      })
    })

    it('应该为 jlink 生成正确的配置', () => {
      const store = useRttStore()
      store.backend = 'jlink'
      const config = store.buildConnectConfig()
      expect(config.backend).toBe('jlink')
      expect(config.jlink).toEqual({
        host: '127.0.0.1',
        port: 19021,
        channel: 0,
      })
    })

    it('应该包含选中的探针（如有）', () => {
      const store = useRttStore()
      store.selectedProbe = '0483:374b'
      const config = store.buildConnectConfig()
      expect(config.probeRs?.probe).toBe('0483:374b')
    })
  })

  describe('日志操作', () => {
    it('clearLogs 应该清空日志和重置计数器', () => {
      const store = useRttStore()
      // 直接模拟已添加的日志
      store.logs = [
        { id: 1, timestamp: Date.now(), level: 'info', channel: 0, text: 'test' },
      ] as RttLogEntry[]
      store.clearLogs()
      expect(store.logs).toEqual([])
    })

    it('send 应该调用 rttService.sendData', () => {
      const store = useRttStore()
      store.send('hello', 0)
      expect(rttService.sendData).toHaveBeenCalledWith('hello', 0)
    })
  })

  describe('过滤器', () => {
    it('setFilter 应该更新过滤器配置', () => {
      const store = useRttStore()
      store.setFilter({ searchText: 'error' })
      expect(store.filter.searchText).toBe('error')
    })

    it('filteredLogs 应该按搜索关键词过滤', () => {
      const store = useRttStore()
      store.logs = [
        { id: 1, timestamp: Date.now(), level: 'info', channel: 0, text: 'hello world' },
        { id: 2, timestamp: Date.now(), level: 'error', channel: 0, text: 'error occurred' },
      ] as RttLogEntry[]

      store.setFilter({ searchText: 'error' })
      expect(store.filteredLogs).toHaveLength(1)
      expect(store.filteredLogs[0].text).toBe('error occurred')
    })

    it('filteredLogs 应该按日志级别过滤', () => {
      const store = useRttStore()
      store.logs = [
        { id: 1, timestamp: Date.now(), level: 'info', channel: 0, text: 'info msg' },
        { id: 2, timestamp: Date.now(), level: 'error', channel: 0, text: 'error msg' },
        { id: 3, timestamp: Date.now(), level: 'warn', channel: 0, text: 'warn msg' },
      ] as RttLogEntry[]

      store.setFilter({ levels: ['error', 'warn'] })
      expect(store.filteredLogs).toHaveLength(2)
    })

    it('filteredLogs 应该按通道过滤', () => {
      const store = useRttStore()
      store.logs = [
        { id: 1, timestamp: Date.now(), level: 'info', channel: 0, text: 'ch0 msg' },
        { id: 2, timestamp: Date.now(), level: 'info', channel: 1, text: 'ch1 msg' },
      ] as RttLogEntry[]

      store.setFilter({ channels: [0] })
      expect(store.filteredLogs).toHaveLength(1)
      expect(store.filteredLogs[0].text).toBe('ch0 msg')
    })

    it('filteredLogs 无过滤条件时返回全部日志', () => {
      const store = useRttStore()
      store.logs = [
        { id: 1, timestamp: Date.now(), level: 'info', channel: 0, text: 'msg1' },
        { id: 2, timestamp: Date.now(), level: 'error', channel: 1, text: 'msg2' },
      ] as RttLogEntry[]

      expect(store.filteredLogs).toHaveLength(2)
    })
  })

  describe('errorLogs', () => {
    it('应该只返回错误级别的日志', () => {
      const store = useRttStore()
      store.logs = [
        { id: 1, timestamp: Date.now(), level: 'info', channel: 0, text: 'info' },
        { id: 2, timestamp: Date.now(), level: 'error', channel: 0, text: 'err1' },
        { id: 3, timestamp: Date.now(), level: 'warn', channel: 0, text: 'warn' },
        { id: 4, timestamp: Date.now(), level: 'error', channel: 0, text: 'err2' },
      ] as RttLogEntry[]

      expect(store.errorLogs).toHaveLength(2)
    })
  })

  describe('logStats', () => {
    it('应该正确统计日志条目', () => {
      const store = useRttStore()
      store.logs = [
        { id: 1, timestamp: Date.now(), level: 'info', channel: 0, text: 'info' },
        { id: 2, timestamp: Date.now(), level: 'error', channel: 0, text: 'err' },
        { id: 3, timestamp: Date.now(), level: 'warn', channel: 0, text: 'warn' },
        { id: 4, timestamp: Date.now(), level: 'warn', channel: 0, text: 'warn2' },
      ] as RttLogEntry[]

      expect(store.logStats.total).toBe(4)
      expect(store.logStats.errors).toBe(1)
      expect(store.logStats.warnings).toBe(2)
    })
  })

  describe('暂停和自动滚动', () => {
    it('togglePause 应该切换暂停状态', () => {
      const store = useRttStore()
      expect(store.isPaused).toBe(false)
      store.togglePause()
      expect(store.isPaused).toBe(true)
      store.togglePause()
      expect(store.isPaused).toBe(false)
    })
  })

  describe('refreshProbes', () => {
    it('应该调用 rttService.listProbes', () => {
      const store = useRttStore()
      store.refreshProbes()
      expect(rttService.listProbes).toHaveBeenCalled()
    })

    it('WebSocket 未连接时应该先建立连接', () => {
      const store = useRttStore()
      store.refreshProbes()
      expect(rttService.connectWs).toHaveBeenCalled()
      expect(rttService.listProbes).toHaveBeenCalled()
    })
  })

  describe('exportLogs', () => {
    it('应该返回格式化的日志文本', () => {
      const store = useRttStore()
      const ts = new Date(2026, 0, 1, 12, 30, 45, 123).getTime()
      store.logs = [
        { id: 1, timestamp: ts, level: 'info', channel: 0, text: 'hello' },
      ] as RttLogEntry[]

      const result = store.exportLogs()
      expect(result).toContain('[INFO ]')
      expect(result).toContain('[Ch0]')
      expect(result).toContain('hello')
      expect(result).toContain('12:30:45.123')
    })
  })

  describe('exportSession', () => {
    it('应该返回有效的 JSON 字符串', () => {
      const store = useRttStore()
      store.logs = [
        { id: 1, timestamp: Date.now(), level: 'info', channel: 0, text: 'test' },
      ] as RttLogEntry[]

      const result = store.exportSession()
      const parsed = JSON.parse(result)
      expect(parsed).toHaveProperty('exportTime')
      expect(parsed).toHaveProperty('config')
      expect(parsed).toHaveProperty('logs')
      expect(parsed.logs).toHaveLength(1)
    })
  })

  describe('cleanup', () => {
    it('应该断开连接并清理资源', () => {
      const store = useRttStore()
      store.cleanup()
      expect(rttService.disconnectWs).toHaveBeenCalled()
      expect(store.connectionState).toBe('disconnected')
    })
  })
})
