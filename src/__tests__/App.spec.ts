import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App.vue'
import { resetDiagnostics } from '../features/diagnostics/globalDiagnostics'

vi.mock('vue-router', () => ({
  RouterView: { name: 'RouterView', template: '<div data-testid="router-view" />' },
  useRoute: () => ({ path: '/' }),
  useRouter: () => ({ push: vi.fn() }),
}))

function installMatchMediaMock() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
}

function mountApp() {
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(App, {
    global: {
      plugins: [pinia],
      stubs: {
        DonateModal: true,
        RouterLink: { props: ['to'], template: '<a><slot /></a>' },
        RouterView: { template: '<div data-testid="router-view" />' },
      },
    },
  })
}

describe('App diagnostics entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resetDiagnostics()
    installMatchMediaMock()
  })

  it('renders the global diagnostics entry without removing topbar controls', () => {
    const wrapper = mountApp()

    expect(wrapper.find('[data-testid="global-diagnostics-button"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('全局诊断')
    expect(wrapper.text()).toContain('搜索命令')
    expect(wrapper.find('[title="切换主题"]').exists()).toBe(true)
    expect(wrapper.find('[title="切换语言"]').exists()).toBe(true)
  })
})
