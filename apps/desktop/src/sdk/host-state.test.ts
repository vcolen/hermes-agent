import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('host.state window-scoped presence atom', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.resetModules()
  })

  async function setup() {
    const { host } = await import('@/sdk/index')

    return { host }
  }

  it('exposes visibleStoredSessionIds as a readable atom', async () => {
    const { host } = await setup()

    const store = host.state.visibleStoredSessionIds
    expect(store).toBeDefined()
    expect(typeof store.get).toBe('function')
    expect(typeof store.listen).toBe('function')
    expect(typeof store.subscribe).toBe('function')
  })

  it('tracks the session-presence store', async () => {
    const { host } = await setup()
    const presence = await import('@/store/session-presence')

    expect(host.state.visibleStoredSessionIds.get()).toBe(presence.$visibleStoredSessionIds.get())
  })
})
