import { describe, expect, it } from 'vitest'

import { resolveVisibleStoredSessionIds } from './session-presence'

const tiles = (...storedSessionIds: string[]) => storedSessionIds.map(storedSessionId => ({ storedSessionId }))

describe('visible stored session resolution', () => {
  it('includes only session surfaces whose panes are actually painted', () => {
    const visible = resolveVisibleStoredSessionIds({
      paneVisible: paneId => paneId === 'workspace' || paneId === 'session-tile:visible-tile',
      selectedStoredSessionId: 'primary',
      sessionTiles: tiles('visible-tile', 'hidden-tab'),
      workspaceIsPage: false
    })

    expect([...visible]).toEqual(['primary', 'visible-tile'])
  })

  it('excludes the selected session when the workspace pane is not visible', () => {
    const visible = resolveVisibleStoredSessionIds({
      paneVisible: paneId => paneId === 'session-tile:front-tile',
      selectedStoredSessionId: 'primary',
      sessionTiles: tiles('front-tile'),
      workspaceIsPage: false
    })

    expect([...visible]).toEqual(['front-tile'])
  })

  it('excludes the selected session while the workspace renders a page', () => {
    const visible = resolveVisibleStoredSessionIds({
      paneVisible: paneId => paneId === 'workspace',
      selectedStoredSessionId: 'primary',
      sessionTiles: [],
      workspaceIsPage: true
    })

    expect([...visible]).toEqual([])
  })

  it('deduplicates a session rendered through more than one surface', () => {
    const visible = resolveVisibleStoredSessionIds({
      paneVisible: () => true,
      selectedStoredSessionId: 'same',
      sessionTiles: tiles('same', 'same'),
      workspaceIsPage: false
    })

    expect([...visible]).toEqual(['same'])
  })
})
