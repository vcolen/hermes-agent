import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { registry } from '@/contrib'
import {
  SESSION_ROW_DECORATION_AREA,
  type SessionRowDecorationContribution
} from '@/lib/session-row-contribution'

import { SessionRowDecorationSlot } from './session-row-decoration-slot'

const disposers: (() => void)[] = []

function contribute(id: string, render: SessionRowDecorationContribution['render']) {
  disposers.push(registry.register({ area: SESSION_ROW_DECORATION_AREA, data: { render }, id }))
}

afterEach(() => {
  act(() => {
    for (const dispose of disposers.splice(0)) {
      dispose()
    }
  })
})

describe('session row decoration slot', () => {
  it('preserves decoration state while row props update', () => {
    contribute('note', props => <input aria-label="Decoration note" data-visible={String(props.visible)} defaultValue="" />)

    const { rerender } = render(
      <SessionRowDecorationSlot focused={false} profile="default" sessionId="s-1" visible />
    )

    const input = screen.getByRole('textbox') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'retained note' } })

    rerender(<SessionRowDecorationSlot focused={false} profile="default" sessionId="s-1" visible />)
    expect(screen.getByRole('textbox')).toBe(input)
    expect(input.value).toBe('retained note')

    rerender(<SessionRowDecorationSlot focused={false} profile="default" sessionId="s-1" visible={false} />)
    expect(screen.getByRole('textbox')).toBe(input)
    expect(input.getAttribute('data-visible')).toBe('false')
  })

  it('passes the exact row state to every contributor', () => {
    contribute('presence', props => (
      <span data-testid="presence">
        {props.sessionId}:{props.profile}:{String(props.visible)}:{String(props.focused)}
      </span>
    ))

    render(<SessionRowDecorationSlot focused={false} profile="default" sessionId="s-1" visible />)

    expect(screen.getByTestId('presence').textContent).toBe('s-1:default:true:false')
  })

  it('renders nothing when no plugin contributes', () => {
    const { container } = render(
      <SessionRowDecorationSlot focused={false} profile="default" sessionId="s-1" visible={false} />
    )

    expect(container.innerHTML).toBe('')
  })

  it('lets one contributor decline without suppressing another', () => {
    contribute('declines', () => null)
    contribute('presence', () => <span>visible marker</span>)

    render(<SessionRowDecorationSlot focused profile="default" sessionId="s-1" visible />)

    expect(screen.getByText('visible marker')).toBeTruthy()
  })

  it('isolates a throwing contributor from its siblings', () => {
    contribute('boom', () => {
      throw new Error('marker failed')
    })
    contribute('presence', () => <span>still visible</span>)

    render(<SessionRowDecorationSlot focused profile="default" sessionId="s-1" visible />)

    expect(screen.getByText('still visible')).toBeTruthy()
  })
})
