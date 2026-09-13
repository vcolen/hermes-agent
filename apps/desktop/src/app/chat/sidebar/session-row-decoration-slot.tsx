import type { FC } from 'react'
import { createElement } from 'react'

import { useContributions } from '@/contrib'
import { ContribBoundary } from '@/contrib/react/boundary'
import {
  SESSION_ROW_DECORATION_AREA,
  type SessionRowDecorationContribution,
  type SessionRowDecorationProps
} from '@/lib/session-row-contribution'

const SessionRowDecorationEntry: FC<{
  id: string
  props: SessionRowDecorationProps
  render: SessionRowDecorationContribution['render']
}> = ({ id, props, render }) => {
  return (
    <ContribBoundary id={id} variant="chip">
      {createElement(render, props)}
    </ContribBoundary>
  )
}

export const SessionRowDecorationSlot: FC<SessionRowDecorationProps> = props => {
  const contributions = useContributions(SESSION_ROW_DECORATION_AREA)

  return (
    <>
      {contributions.map(contribution => {
        const render = (contribution.data as SessionRowDecorationContribution | undefined)?.render

        return render ? (
          <SessionRowDecorationEntry id={contribution.id} key={contribution.id} props={props} render={render} />
        ) : null
      })}
    </>
  )
}
