import type { ReactNode } from 'react'

import { Slot as ContribSlot } from '@/contrib/react/slot'
import { useContributions } from '@/contrib/react/use-contributions'

import { COMPOSER_AREAS } from './contrib'

interface ComposerDictationModeProps {
  active: boolean
  children: ReactNode
}

/** Reports whether an active dictation contribution should replace the native row. */
export function useComposerDictationMode(active: boolean) {
  const contributions = useContributions(COMPOSER_AREAS.dictation)

  return active && contributions.length > 0
}

/** Replaces the native input row with registered dictation contributions while active. */
export function ComposerDictationMode({ active, children }: ComposerDictationModeProps) {
  const contributionActive = useComposerDictationMode(active)

  return (
    <>
      {/* Transcript insertion paints the imperative editor while transcription
          is still active. Hide it without unmounting its DOM or losing its ref. */}
      <div className={contributionActive ? undefined : 'contents'} hidden={contributionActive} inert={contributionActive}>
        {children}
      </div>
      {contributionActive && (
        <div className="min-w-0 w-full" data-slot="composer-dictation-mode">
          <ContribSlot area={COMPOSER_AREAS.dictation} />
        </div>
      )}
    </>
  )
}