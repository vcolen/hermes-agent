import { fireEvent, render, screen } from '@testing-library/react'
import type { Context, ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { registry } from '@/contrib/registry'

import * as contributions from './contrib'
import { ComposerDictationMode } from './dictation-mode'

type Control = {
  status: string
  elapsedSeconds: number
  level: number
  cancel: () => void
  stop: () => void
}

const surface = contributions as unknown as {
  COMPOSER_AREAS: { dictation: string }
  ComposerDictationContext: Context<Control | null>
  useComposerDictation: () => Control | null
}

const disposers: Array<() => void> = []

afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose())
})

function registerDictationRow(render: () => ReactNode) {
  disposers.push(
    registry.register({
      area: surface.COMPOSER_AREAS.dictation,
      id: 'test-dictation-row',
      render
    })
  )
}

it('exposes cancellation only for the recording composer that owns the control', () => {
  const cancelA = vi.fn()
  const cancelB = vi.fn()

  function Control({ name }: { name: string }) {
    const dictation = surface.useComposerDictation()

    return dictation?.status === 'recording' ? <button onClick={dictation.cancel}>{name}</button> : null
  }

  render(
    <>
      <surface.ComposerDictationContext
        value={{ status: 'recording', elapsedSeconds: 12, level: 0.4, cancel: cancelA, stop: vi.fn() }}
      >
        <Control name="Cancel A" />
      </surface.ComposerDictationContext>
      <surface.ComposerDictationContext
        value={{ status: 'recording', elapsedSeconds: 3, level: 0.8, cancel: cancelB, stop: vi.fn() }}
      >
        <Control name="Cancel B" />
      </surface.ComposerDictationContext>
      <surface.ComposerDictationContext
        value={{ status: 'idle', elapsedSeconds: 0, level: 0, cancel: cancelA, stop: vi.fn() }}
      >
        <Control name="Idle" />
      </surface.ComposerDictationContext>
      <Control name="Outside a composer" />
    </>
  )

  fireEvent.click(screen.getByRole('button', { name: 'Cancel B' }))
  expect(cancelB).toHaveBeenCalledOnce()
  expect(cancelA).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Idle' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Outside a composer' })).toBeNull()
})

it.each(['recording', 'transcribing'])('replaces the complete input row while dictation is %s', status => {
  registerDictationRow(() => <div>Dictation replacement</div>)

  render(
    <ComposerDictationMode active={status !== 'idle'}>
      <div>Native composer row</div>
    </ComposerDictationMode>
  )

  expect(screen.queryByText('Dictation replacement')).not.toBeNull()
  expect(screen.getByText('Native composer row').closest('[hidden]')).not.toBeNull()
})

it('preserves the native input row while dictation is idle', () => {
  registerDictationRow(() => <div>Dictation replacement</div>)

  render(
    <ComposerDictationMode active={false}>
      <div>Native composer row</div>
    </ComposerDictationMode>
  )

  expect(screen.queryByText('Native composer row')).not.toBeNull()
  expect(screen.queryByText('Dictation replacement')).toBeNull()
})

it('preserves the native input row when no plugin contributes a replacement', () => {
  render(
    <ComposerDictationMode active>
      <div>Native composer row</div>
    </ComposerDictationMode>
  )

  expect(screen.queryByText('Native composer row')).not.toBeNull()
})

it('routes completion through the owning dictation control without submitting the composer', () => {
  const stop = vi.fn()
  const submit = vi.fn(event => event.preventDefault())

  registerDictationRow(() => {
    const dictation = surface.useComposerDictation()

    return (
      <button onClick={dictation?.stop} type="button">
        Stop and transcribe
      </button>
    )
  })

  render(
    <surface.ComposerDictationContext
      value={{ status: 'recording', elapsedSeconds: 7, level: 0.5, cancel: vi.fn(), stop }}
    >
      <form onSubmit={submit}>
        <ComposerDictationMode active>
          <div>Native composer row</div>
        </ComposerDictationMode>
      </form>
    </surface.ComposerDictationContext>
  )

  fireEvent.click(screen.getByRole('button', { name: 'Stop and transcribe' }))
  expect(stop).toHaveBeenCalledOnce()
  expect(submit).not.toHaveBeenCalled()
})
