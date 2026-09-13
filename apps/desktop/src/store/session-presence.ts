import { computed, type ReadableAtom } from 'nanostores'

import { $workspaceIsPage } from '@/app/routes'
import { $layoutEditMode } from '@/components/pane-shell/edit-mode'
import {
  $collapsedTreeSides,
  $dismissedPanes,
  $hiddenTreePanes,
  $layoutTree,
  isPaneVisible,
  paneRootSide
} from '@/components/pane-shell/tree/store'
import { $registryVersion } from '@/contrib/registry'
import { $selectedStoredSessionId } from '@/store/session'
import { $sessionTiles, type SessionTile } from '@/store/session-states'

const TILE_PANE_PREFIX = 'session-tile:'

export interface VisibleStoredSessionInputs {
  paneVisible: (paneId: string) => boolean
  selectedStoredSessionId: null | string
  sessionTiles: readonly Pick<SessionTile, 'storedSessionId'>[]
  workspaceIsPage: boolean
}

/** Resolve durable session ids whose chat surfaces are actually painted. */
export function resolveVisibleStoredSessionIds({
  paneVisible,
  selectedStoredSessionId,
  sessionTiles,
  workspaceIsPage
}: VisibleStoredSessionInputs): ReadonlySet<string> {
  const visible = new Set<string>()

  if (selectedStoredSessionId && !workspaceIsPage && paneVisible('workspace')) {
    visible.add(selectedStoredSessionId)
  }

  for (const tile of sessionTiles) {
    if (paneVisible(`${TILE_PANE_PREFIX}${tile.storedSessionId}`)) {
      visible.add(tile.storedSessionId)
    }
  }

  return visible
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every(value => b.has(value))
}

let previous: ReadonlySet<string> = new Set()

/** Sessions painted in this renderer window. Structural layout state only. */
export const $visibleStoredSessionIds: ReadableAtom<ReadonlySet<string>> = computed(
  [
    $selectedStoredSessionId,
    $sessionTiles,
    $workspaceIsPage,
    $layoutTree,
    $dismissedPanes,
    $hiddenTreePanes,
    $collapsedTreeSides,
    $layoutEditMode,
    $registryVersion
  ],
  (
    selectedStoredSessionId,
    sessionTiles,
    workspaceIsPage,
    _tree,
    _dismissed,
    _hidden,
    collapsedSides,
    editMode,
    _registryVersion
  ) => {
    const paneVisible = (paneId: string) => {
      if (!isPaneVisible(paneId)) {
        return false
      }

      const side = paneRootSide(paneId)

      return editMode || !side || !collapsedSides.has(side)
    }

    const next = resolveVisibleStoredSessionIds({
      paneVisible,
      selectedStoredSessionId,
      sessionTiles,
      workspaceIsPage
    })

    if (sameSet(previous, next)) {
      return previous
    }

    previous = next

    return next
  }
)
