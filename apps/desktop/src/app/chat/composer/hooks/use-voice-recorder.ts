import { useEffect, useRef, useState } from 'react'

import { useI18n } from '@/i18n'
import { notify, notifyError } from '@/store/notifications'

import type { VoiceActivityState, VoiceStatus } from '../types'

import { useMicRecorder } from './use-mic-recorder'

interface VoiceRecorderOptions {
  maxRecordingSeconds: number
  onTranscribeAudio?: (audio: Blob) => Promise<string>
  focusInput: () => void
  onTranscript: (text: string) => void
}

export function useVoiceRecorder({
  maxRecordingSeconds,
  onTranscribeAudio,
  focusInput,
  onTranscript
}: VoiceRecorderOptions) {
  const { t } = useI18n()
  const voiceCopy = t.notifications.voice
  const { handle, level, recording } = useMicRecorder(voiceCopy)
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const startedAtRef = useRef(0)
  const intervalRef = useRef<number | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const cancellationRef = useRef(0)
  const activeStopRef = useRef<Promise<void> | null>(null)
  const activeStartRef = useRef<Promise<void> | null>(null)

  const clearTimers = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  useEffect(
    () => () => {
      // Ending ownership on unmount invalidates any in-flight transcription
      // so a late settle cannot notify, insert text, or touch focus.
      cancellationRef.current += 1
      clearTimers()
    },
    []
  )

  const runStop = async () => {
    const generation = cancellationRef.current
    clearTimers()
    const result = await handle.stop()

    if (generation !== cancellationRef.current) {
      return
    }

    if (!result) {
      setVoiceStatus('idle')

      return
    }

    if (!onTranscribeAudio) {
      setVoiceStatus('idle')

      return
    }

    setVoiceStatus('transcribing')

    try {
      const transcript = (await onTranscribeAudio(result.audio)).trim()

      if (generation !== cancellationRef.current) {
        return
      }

      if (!transcript) {
        notify({ kind: 'warning', title: voiceCopy.noSpeechDetected, message: voiceCopy.tryRecordingAgain })
      } else {
        onTranscript(transcript)
      }
    } catch (error) {
      if (generation !== cancellationRef.current) {
        return
      }

      notifyError(error, voiceCopy.transcriptionFailed)
    } finally {
      if (generation === cancellationRef.current) {
        setVoiceStatus('idle')
        focusInput()
      }
    }
  }

  const stop = async () => {
    if (activeStopRef.current) {
      return activeStopRef.current
    }

    const completion = runStop()
    activeStopRef.current = completion

    try {
      await completion
    } finally {
      // Clear only if this operation still owns the slot, so a stale
      // completion cannot release a newer one.
      if (activeStopRef.current === completion) {
        activeStopRef.current = null
      }
    }
  }

  const runStart = async () => {
    if (!onTranscribeAudio) {
      notify({ kind: 'warning', title: voiceCopy.unavailable, message: voiceCopy.transcriptionUnavailable })

      return
    }

    const generation = cancellationRef.current

    try {
      await handle.start({ onError: error => notifyError(error, voiceCopy.recordingFailed) })

      if (generation !== cancellationRef.current) {
        return
      }

      startedAtRef.current = Date.now()
      setElapsedSeconds(0)
      setVoiceStatus('recording')
      intervalRef.current = window.setInterval(() => setElapsedSeconds((Date.now() - startedAtRef.current) / 1000), 250)
      const cap = Math.max(1, Math.min(Math.trunc(maxRecordingSeconds), 600))
      timeoutRef.current = window.setTimeout(() => void stop(), cap * 1000)
    } catch (error) {
      if (generation !== cancellationRef.current) {
        return
      }

      setVoiceStatus('idle')
      notifyError(error, voiceCopy.recordingFailed)
    }
  }

  const start = async () => {
    if (activeStartRef.current) {
      return activeStartRef.current
    }

    const completion = runStart()
    activeStartRef.current = completion

    try {
      await completion
    } finally {
      if (activeStartRef.current === completion) {
        activeStartRef.current = null
      }
    }
  }

  const cancel = () => {
    cancellationRef.current += 1
    activeStopRef.current = null
    activeStartRef.current = null
    clearTimers()
    handle.cancel()
    setElapsedSeconds(0)
    setVoiceStatus('idle')
    focusInput()
  }

  const dictate = () => {
    if (recording) {
      void stop()
    } else if (voiceStatus === 'idle') {
      void start()
    }
  }

  const voiceActivityState: VoiceActivityState = {
    elapsedSeconds,
    level,
    status: voiceStatus
  }

  return { cancel, dictate, stop, voiceActivityState, voiceStatus }
}
