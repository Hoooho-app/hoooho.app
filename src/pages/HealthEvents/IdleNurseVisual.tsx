import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  IdleAnimationScheduler,
  idleNurseActions,
  playIdleVideoSafely,
  type IdleNurseAction
} from './idleNurseAnimation'

type IdleVideoPhase = 'static' | 'loading' | 'playing' | 'holding' | 'fadingOut'

const fadeOutDurationByAction: Record<IdleNurseAction, number> = {
  chairSpin: 200,
  stretch: 650,
  waterPlant: 700
}

const videoSourceByAction = Object.fromEntries(
  idleNurseActions.map((action) => [action.id, action.source])
) as Record<IdleNurseAction, string>

interface IdleNurseVisualProps {
  active: boolean
  resetKey: string
  staticSource: string
}

export function IdleNurseVisual({ active, resetKey, staticSource }: IdleNurseVisualProps) {
  const [action, setAction] = useState<IdleNurseAction | null>(null)
  const [lastMediaError, setLastMediaError] = useState('')
  const [phase, setPhase] = useState<IdleVideoPhase>('static')
  const [playRequested, setPlayRequested] = useState(false)
  const [ready, setReady] = useState(false)
  const schedulerRef = useRef<IdleAnimationScheduler | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const loadTimerRef = useRef(0)
  const holdTimerRef = useRef(0)
  const playAttemptRef = useRef<IdleNurseAction | null>(null)

  const fadeDuration = action ? fadeOutDurationByAction[action] : 200
  const videoStyle = useMemo(() => ({ '--idle-video-fade-duration': `${fadeDuration}ms` } as CSSProperties), [fadeDuration])

  const clearVisualTimers = () => {
    window.clearTimeout(loadTimerRef.current)
    window.clearTimeout(holdTimerRef.current)
    loadTimerRef.current = 0
    holdTimerRef.current = 0
  }

  const returnToStatic = (completed: boolean) => {
    clearVisualTimers()
    const video = videoRef.current
    if (video) {
      video.pause()
      video.currentTime = 0
    }
    playAttemptRef.current = null
    setAction(null)
    setPhase('static')
    setPlayRequested(false)
    setReady(false)
    if (completed) schedulerRef.current?.completeAction()
    else schedulerRef.current?.skipPreparedAction()
  }

  useEffect(() => {
    const scheduler = new IdleAnimationScheduler({
      onPrepare: (nextAction) => {
        playAttemptRef.current = null
        setAction(nextAction)
        setPhase('loading')
        setPlayRequested(false)
        setReady(false)
      },
      onPlay: () => setPlayRequested(true)
    })
    schedulerRef.current = scheduler
    if (active) scheduler.start()

    return () => {
      scheduler.stop()
      if (schedulerRef.current === scheduler) schedulerRef.current = null
      clearVisualTimers()
      const video = videoRef.current
      if (video) {
        video.pause()
        video.removeAttribute('src')
        video.load()
      }
    }
  }, [active, resetKey])

  useEffect(() => {
    if (!active) {
      returnToStatic(false)
      return
    }
    if (!action || ready) return

    window.clearTimeout(loadTimerRef.current)
    loadTimerRef.current = window.setTimeout(() => {
      if (!ready) returnToStatic(false)
    }, 10_000)
    return () => window.clearTimeout(loadTimerRef.current)
  }, [action, active, ready])

  useEffect(() => {
    if (!active || !action || !playRequested || !ready || playAttemptRef.current === action) return
    const video = videoRef.current
    if (!video) return
    playAttemptRef.current = action
    window.clearTimeout(loadTimerRef.current)
    video.currentTime = 0
    setPhase('playing')
    void playIdleVideoSafely(() => video.play()).then((reason) => {
      if (!reason) {
        setLastMediaError('')
        return
      }
      setLastMediaError(reason instanceof DOMException ? `${reason.name}: ${reason.message}` : 'play rejected')
      returnToStatic(true)
    })
  }, [action, active, playRequested, ready])

  const handleEnded = () => {
    if (!action) return
    if (action === 'waterPlant') {
      setPhase('holding')
      holdTimerRef.current = window.setTimeout(() => setPhase('fadingOut'), 250)
      return
    }
    setPhase('fadingOut')
  }

  return (
    <div className="idle-nurse-visual" data-action={action ?? 'none'} data-last-media-error={lastMediaError} data-phase={phase}>
      <img alt="" aria-hidden="true" className="idle-nurse-visual__static" decoding="async" src={staticSource} />
      <video
        aria-hidden="true"
        className="idle-nurse-visual__video"
        controls={false}
        controlsList="nodownload noplaybackrate nofullscreen"
        disablePictureInPicture
        draggable={false}
        muted
        onCanPlay={() => {
          window.clearTimeout(loadTimerRef.current)
          setReady(true)
        }}
        onContextMenu={(event) => event.preventDefault()}
        onEnded={handleEnded}
        onError={(event) => {
          if (action && event.currentTarget.error) returnToStatic(false)
        }}
        onTransitionEnd={(event) => {
          if (event.propertyName === 'opacity' && phase === 'fadingOut') returnToStatic(true)
        }}
        playsInline
        preload={action ? 'auto' : 'none'}
        ref={videoRef}
        src={action ? videoSourceByAction[action] : undefined}
        style={videoStyle}
      />
    </div>
  )
}
