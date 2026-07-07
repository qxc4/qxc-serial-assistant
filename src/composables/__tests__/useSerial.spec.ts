import { createPinia, setActivePinia } from 'pinia'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

function installMatchMediaMock() {
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
}

async function createSerialComposable(navigatorMock: unknown) {
  vi.resetModules()
  vi.stubGlobal('navigator', navigatorMock)
  setActivePinia(createPinia())

  const { useSerial } = await import('../useSerial')
  return useSerial()
}

describe('useSerial', () => {
  beforeAll(() => {
    installMatchMediaMock()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
    vi.stubGlobal('alert', vi.fn())
  })

  it('records unsupported browser errors without calling alert', async () => {
    const serial = await createSerialComposable({})

    await serial.connect()

    expect(alert).not.toHaveBeenCalled()
    expect(serial.lastSerialError.value).toMatchObject({
      code: 'unsupported',
    })
  })

  it('records request/open failures without calling alert', async () => {
    const requestPort = vi.fn().mockRejectedValue(new Error('Permission denied'))
    const serial = await createSerialComposable({
      serial: {
        requestPort,
        getPorts: vi.fn(),
      },
    })

    await serial.connect()

    expect(requestPort).toHaveBeenCalledTimes(1)
    expect(alert).not.toHaveBeenCalled()
    expect(serial.lastSerialError.value).toMatchObject({
      code: 'connect-failed',
      detail: 'Permission denied',
    })
  })

  it('clears the latest serial error on demand', async () => {
    const serial = await createSerialComposable({})

    await serial.connect()
    serial.clearSerialError()

    expect(serial.lastSerialError.value).toBeNull()
  })
})
