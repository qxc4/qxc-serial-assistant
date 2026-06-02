import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultSerialSession, createSerialSessionController } from '../serialSessionController'

describe('serialSessionController', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a default session compatible with the current singleton connection', () => {
    expect(createDefaultSerialSession('2026-06-02T00:00:00.000Z')).toEqual({
      id: 'default',
      name: '串口 1',
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
      isDefault: true,
      connectionLabel: '当前 Web Serial 连接',
      stats: { txBytes: 0, rxBytes: 0, events: 0 },
    })
  })

  it('adds, activates, renames and removes non-default sessions', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const controller = createSerialSessionController([createDefaultSerialSession('2026-06-02T00:00:00.000Z')])

    const added = controller.addSession('网关调试')
    expect(added.id.startsWith('session-1000-')).toBe(true)
    expect(controller.activeSession().name).toBe('网关调试')
    expect(controller.renameSession(added.id, 'MCU-B')).toBe(true)
    expect(controller.updateSessionStats(added.id, { txBytes: 12, events: 2 })).toBe(true)
    expect(controller.activeSession().stats).toEqual({ txBytes: 12, rxBytes: 0, events: 2 })
    expect(controller.removeSession(added.id)).toBe(true)
    expect(controller.activeSession().id).toBe('default')
  })

  it('protects the default session and enforces max session count', () => {
    const controller = createSerialSessionController([createDefaultSerialSession()], 2)

    expect(controller.removeSession('default')).toBe(false)
    controller.addSession()
    expect(() => controller.addSession()).toThrow(/最多/)
  })
})
