import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { notifyError } from '@/store/notifications'

import { useVoiceRecorder } from './use-voice-recorder'

vi.mock('@/store/notifications', () => ({ notify: vi.fn(), notifyError: vi.fn() }))

const tracks: Array<{ readyState: string; stop: ReturnType<typeof vi.fn> }> = []
const pendingStops: Array<() => void> = []

class Recorder {
  static isTypeSupported() { return true }
  state = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: ((event: Event) => void) | null = null
  constructor(readonly stream: MediaStream) { recorders.push(this) }
  start() {
    this.state = 'recording'
    this.ondataavailable?.({ data: new Blob(['fixture audio']) })
  }
  stop() {
    this.state = 'inactive'
    pendingStops.push(() => {
      this.ondataavailable?.({ data: new Blob(['final fixture chunk']) })
      this.onstop?.()
    })
  }
}
const recorders: Recorder[] = []
const flushStops = () => pendingStops.splice(0).forEach(fn => fn())

function microphoneStream() {
  const track = { readyState: 'live', stop: vi.fn() }
  track.stop.mockImplementation(() => { track.readyState = 'ended' })
  tracks.push(track)

  return { getTracks: () => [track] } as unknown as MediaStream
}

beforeEach(() => {
  vi.clearAllMocks()
  tracks.length = 0
  pendingStops.length = 0
  recorders.length = 0
  vi.stubGlobal('MediaRecorder', Recorder)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: vi.fn(async () => microphoneStream())
  } })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function setup(transcribe: () => Promise<string> = async () => 'recorded text') {
  const onTranscribeAudio = vi.fn(transcribe)
  const onTranscript = vi.fn()
  const focusInput = vi.fn()
  const hook = renderHook(() => useVoiceRecorder({ maxRecordingSeconds: 600, focusInput, onTranscribeAudio, onTranscript }))

  return { ...hook, focusInput, onTranscribeAudio, onTranscript }
}

async function start(hook: ReturnType<typeof setup>) {
  await act(async () => { hook.result.current.dictate() })
  expect(hook.result.current.voiceStatus).toBe('recording')
}

const cancel = (hook: ReturnType<typeof setup>) => (hook.result.current as typeof hook.result.current & { cancel?: () => void }).cancel?.()

const stop = (hook: ReturnType<typeof setup>) =>
  (hook.result.current as typeof hook.result.current & { stop?: () => Promise<void> }).stop

it('discards dictation before a transcription request', async () => {
  const hook = setup()
  await start(hook)
  act(() => { cancel(hook); flushStops() })
  expect(tracks[0]!.readyState).toBe('ended')
  expect(hook.result.current.voiceStatus).toBe('idle')
  expect(hook.onTranscribeAudio).not.toHaveBeenCalled()
  expect(hook.onTranscript).not.toHaveBeenCalled()
})
it('normal completion still transcribes and inserts the transcript', async () => {
  const hook = setup()
  await start(hook)
  await act(async () => { hook.result.current.dictate(); flushStops() })
  expect(hook.onTranscribeAudio).toHaveBeenCalledOnce()
  expect(hook.onTranscript).toHaveBeenCalledWith('recorded text')
})
it('explicit completion supports consecutive recordings without submitting', async () => {
  const hook = setup()

  expect(stop(hook)).toBeTypeOf('function')

  await start(hook)
  await act(async () => {
    const completion = stop(hook)!()
    flushStops()
    await completion
  })
  await start(hook)
  await act(async () => {
    const completion = stop(hook)!()
    flushStops()
    await completion
  })

  expect(hook.onTranscribeAudio).toHaveBeenCalledTimes(2)
  expect(hook.onTranscript).toHaveBeenNthCalledWith(1, 'recorded text')
  expect(hook.onTranscript).toHaveBeenNthCalledWith(2, 'recorded text')
})
it('cancellation is isolated to the owning composer', async () => {
  const a = setup(), b = setup()
  await start(a); await start(b)
  act(() => cancel(a))
  expect(tracks[0]!.readyState).toBe('ended')
  expect(tracks[1]!.readyState).toBe('live')
  expect(b.result.current.voiceStatus).toBe('recording')
})
it('a queued old stop cannot upload audio or stop the next recording', async () => {
  const hook = setup()
  await start(hook)
  act(() => { hook.result.current.dictate(); cancel(hook) })
  await start(hook)
  await act(async () => flushStops())
  expect(hook.onTranscribeAudio).not.toHaveBeenCalled()
  expect(tracks[1]!.readyState).toBe('live')
  expect(hook.result.current.voiceStatus).toBe('recording')
})

it.each([
  ['cancel', 'resolve'],
  ['cancel', 'reject'],
  ['unmount', 'resolve'],
  ['unmount', 'reject']
])('ignores a late transcription %s/%s after ownership ends', async (termination, outcome) => {
  let resolve!: (text: string) => void
  let reject!: (error: Error) => void
  const pending = new Promise<string>((ok, fail) => { resolve = ok; reject = fail })
  const hook = setup(() => pending)
  await start(hook)
  let completion!: Promise<void>
  await act(async () => {
    completion = stop(hook)!()
    flushStops()
  })
  expect(hook.result.current.voiceStatus).toBe('transcribing')

  if (termination === 'cancel') {
    act(() => cancel(hook))
  } else {
    hook.unmount()
  }

  hook.focusInput.mockClear()
  await act(async () => {
    if (outcome === 'resolve') {
      resolve('late transcript')
    } else {
      reject(new Error('late transcription failure'))
    }

    await completion
  })
  expect(hook.onTranscript).not.toHaveBeenCalled()
  expect(notifyError).not.toHaveBeenCalled()
  expect(hook.focusInput).not.toHaveBeenCalled()
})

it('a repeated stop preserves the pending transcription and completes once', async () => {
  let resolve!: (text: string) => void
  const pending = new Promise<string>(ok => { resolve = ok })
  const hook = setup(() => pending)
  await start(hook)
  let first!: Promise<void>
  await act(async () => { first = stop(hook)!(); flushStops() })
  let second!: Promise<void>
  act(() => { second = stop(hook)!() })

  try {
    await act(async () => { await Promise.resolve() })
    expect(hook.result.current.voiceStatus).toBe('transcribing')
    expect(hook.onTranscribeAudio).toHaveBeenCalledOnce()
  } finally {
    await act(async () => { resolve('one transcript'); await Promise.all([first, second]) })
  }

  expect(hook.onTranscript).toHaveBeenCalledOnce()
})

it.each(['cancel', 'unmount'])('releases pending microphone acquisition after %s', async termination => {
  let resolve!: (stream: MediaStream) => void
  vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementationOnce(() => new Promise(ok => { resolve = ok }))
  const hook = setup()
  await act(async () => { hook.result.current.dictate() })
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce()

  if (termination === 'cancel') {
    act(() => cancel(hook))
  } else {
    hook.unmount()
  }

  await act(async () => { resolve(microphoneStream()) })
  expect(tracks[0]!.readyState).toBe('ended')
  expect(hook.onTranscribeAudio).not.toHaveBeenCalled()
  expect(notifyError).not.toHaveBeenCalled()

  if (termination === 'cancel') {
    expect(hook.result.current.voiceStatus).toBe('idle')
  }
})

it('coalesces repeated dictate requests during pending microphone acquisition', async () => {
  const resolvers: Array<(stream: MediaStream) => void> = []
  vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(() => new Promise(ok => { resolvers.push(ok) }))
  const hook = setup()
  await act(async () => { hook.result.current.dictate(); hook.result.current.dictate() })
  const acquisitions = vi.mocked(navigator.mediaDevices.getUserMedia).mock.calls.length
  await act(async () => { resolvers.forEach(resolve => resolve(microphoneStream())) })
  act(() => cancel(hook))
  expect(acquisitions).toBe(1)
  expect(tracks.every(track => track.readyState === 'ended')).toBe(true)
})

it('keeps dictation idle when microphone permission is denied', async () => {
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'))
  const hook = setup()
  await act(async () => { hook.result.current.dictate() })
  expect(hook.result.current.voiceStatus).toBe('idle')
  expect(tracks).toHaveLength(0)
  expect(hook.onTranscribeAudio).not.toHaveBeenCalled()
  expect(notifyError).toHaveBeenCalledOnce()
})

it('detaches recorder callbacks when the composer unmounts', async () => {
  const hook = setup()
  await start(hook)
  const recorder = recorders[0]!
  hook.unmount()
  act(() => { recorder.onerror?.(new Event('error')); flushStops() })
  expect(notifyError).not.toHaveBeenCalled()
  expect(recorder.ondataavailable).toBeNull()
  expect(recorder.onstop).toBeNull()
  expect(tracks[0]!.readyState).toBe('ended')
})
