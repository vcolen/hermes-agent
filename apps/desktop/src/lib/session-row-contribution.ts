import type { ReactNode } from 'react'

/** Runtime plugin area mounted at the leading edge of each stored-session row. */
export const SESSION_ROW_DECORATION_AREA = 'session.row.decoration'

export interface SessionRowDecorationProps {
  /** Durable stored-session id used by navigation and the sidebar. */
  sessionId: string
  /** Desktop profile that owns the row. */
  profile: string
  /** True when this session is actually painted in this renderer window. */
  visible: boolean
  /** True when this visible session owns the current interaction focus. */
  focused: boolean
}

export interface SessionRowDecorationContribution {
  /** Render a layout-neutral decoration, or null when the row is not claimed. */
  render: (props: SessionRowDecorationProps) => ReactNode
}
