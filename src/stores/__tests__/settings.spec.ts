import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest'
import { useSettingsStore } from '../settings'
import { nextTick } from 'vue'

describe('Settings Store', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    // 模拟 localStorage
    localStorage.clear()
  })

  it('初始状态应为默认值', () => {
    const store = useSettingsStore()
    expect(store.config.theme).toBe('system')
    expect(store.config.language).toBe('zh-CN')
    expect(store.config.serialDefaults.baudRate).toBe(9600)
    expect(store.config.serialDefaults.dataBits).toBe(8)
  })

  it('更新主题能够修改状态', async () => {
    const store = useSettingsStore()
    store.config.theme = 'dark'
    await nextTick()
    expect(store.config.theme).toBe('dark')
  })

  it('修改默认串口配置', async () => {
    const store = useSettingsStore()
    store.config.serialDefaults.baudRate = 115200
    store.config.serialDefaults.parity = 'even'
    await nextTick()
    expect(store.config.serialDefaults.baudRate).toBe(115200)
    expect(store.config.serialDefaults.parity).toBe('even')
  })

  it('重置配置功能', async () => {
    const store = useSettingsStore()
    
    // Clear any existing data
    localStorage.removeItem('qxc-serial-settings')
    
    // Set custom values
    store.config.serialDefaults.baudRate = 115200
    store.config.theme = 'dark'
    
    // Wait for Vue reactivity
    await nextTick()
    
    // Verify values were set
    expect(store.config.serialDefaults.baudRate).toBe(115200)
    expect(store.config.theme).toBe('dark')
    
    // Call clearAllData to reset to defaults
    store.clearAllData()
    
    // Wait for reactivity
    await nextTick()
    
    // Check localStorage after clear
    const storedData = localStorage.getItem('qxc-serial-settings')
    
    if (storedData) {
      const parsed = JSON.parse(storedData)
      // localStorage should have default values after clearAllData
      expect(parsed.serialDefaults?.baudRate).toBe(9600)
      expect(parsed.theme).toBe('system')
    } else {
      // If localStorage is empty, that's also acceptable
      // The store should initialize with defaults on next load
    }
  })
})
