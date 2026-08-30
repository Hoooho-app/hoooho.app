import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  IdleAnimationScheduler,
  idleNurseActions,
  playIdleVideoSafely,
  type IdleNurseAction
} from './idleNurseAnimation'
import { createIdleNurseAnimationState, transitionNurseAnimation } from './nurseAnimationController'

const idleVideoSource = '/nurse-triage/nurses-idle-loop.mp4'
const videoSourceByAction = Object.fromEntries(
  idleNurseActions.map((action) => [action.id, action.source])
) as Record<IdleNurseAction, string>

interface PendingSpecialAction {
  action: IdleNurseAction
  requestId: number
}

interface IdleNurseVisualProps {
  active: boolean
  reducedMotion: boolean
  resetKey: string
  staticSource: string
}

export function IdleNurseVisual({ active, reducedMotion, resetKey, staticSource }: IdleNurseVisualProps) {
  const [animation, dispatch] = useReducer(transitionNurseAnimation, undefined, () => createIdleNurseAnimationState())
  const [idleReady, setIdleReady] = useState(false)
  const [idlePlaybackBlocked, setIdlePlaybackBlocked] = useState(false)
  const [idleUnavailable, setIdleUnavailable] = useState(false)
  const [pendingSpecial, setPendingSpecial] = useState<PendingSpecialAction | null>(null)
  const [specialReady, setSpecialReady] = useState(false)
  const [specialRequested, setSpecialRequested] = useState(false)
  const schedulerRef = useRef<IdleAnimationScheduler | null>(null)
  const idleVideoRef = useRef<HTMLVideoElement | null>(null)
  const mountedRef = useRef(true)
  const specialVideoRef = useRef<HTMLVideoElement | null>(null)
  const requestIdRef = useRef(0)
  const specialLoadTimerRef = useRef(0)

  const playIdle = useCallback(async () => {
    const video = idleVideoRef.current
    if (!video || !active || reducedMotion || idleUnavailable) return
    if (video.ended || (Number.isFinite(video.duration) && video.currentTime >= video.duration - 0.05)) {
      video.currentTime = 0
    }
    const reason = await playIdleVideoSafely(() => video.play())
    if (!mountedRef.current) return
    setIdlePlaybackBlocked(Boolean(reason))
    if (!reason) setIdleReady(true)
  }, [active, idleUnavailable, reducedMotion])

  const returnToIdle = useCallback((requestId: number, completed: boolean) => {
    if (!mountedRef.current || requestId !== requestIdRef.current) return
    window.clearTimeout(specialLoadTimerRef.current)
    specialLoadTimerRef.current = 0
    dispatch({ type: 'RETURN_TO_IDLE', requestId })
    const video = specialVideoRef.current
    if (video) {
      video.pause()
      video.currentTime = 0
    }
    setPendingSpecial(null)
    setSpecialReady(false)
    setSpecialRequested(false)
    if (completed) schedulerRef.current?.completeAction()
    else schedulerRef.current?.skipPreparedAction()
    void playIdle()
  }, [playIdle])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    requestIdRef.current += 1
    dispatch({ type: 'FORCE_IDLE', requestId: requestIdRef.current })
    setPendingSpecial(null)
    setSpecialReady(false)
    setSpecialRequested(false)
    specialVideoRef.current?.pause()

    const scheduler = new IdleAnimationScheduler({
      onPrepare: (action) => {
        const requestId = ++requestIdRef.current
        setPendingSpecial({ action, requestId })
        setSpecialReady(false)
        setSpecialRequested(false)
      },
      onPlay: (action) => {
        setPendingSpecial((current) => {
          if (!current || current.action !== action) return current
          setSpecialRequested(true)
          return current
        })
      }
    })
    schedulerRef.current = scheduler
    if (active && !reducedMotion) scheduler.start()

    return () => {
      scheduler.stop()
      if (schedulerRef.current === scheduler) schedulerRef.current = null
      window.clearTimeout(specialLoadTimerRef.current)
      requestIdRef.current += 1
      specialVideoRef.current?.pause()
    }
  }, [active, reducedMotion, resetKey])

  useEffect(() => {
    if (!active || reducedMotion) {
      idleVideoRef.current?.pause()
      return
    }
    void playIdle()
  }, [active, playIdle, reducedMotion])

  useEffect(() => {
    if (!active || !idlePlaybackBlocked) return
    const resume = () => void playIdle()
    document.addEventListener('pointerdown', resume, { once: true })
    document.addEventListener('keydown', resume, { once: true })
    return () => {
      document.removeEventListener('pointerdown', resume)
      document.removeEventListener('keydown', resume)
    }
  }, [active, idlePlaybackBlocked, playIdle])

  useEffect(() => {
    if (!pendingSpecial || specialReady) return
    window.clearTimeout(specialLoadTimerRef.current)
    specialLoadTimerRef.current = window.setTimeout(() => returnToIdle(pendingSpecial.requestId, false), 10_000)
    return () => window.clearTimeout(specialLoadTimerRef.current)
  }, [pendingSpecial, returnToIdle, specialReady])

  useEffect(() => {
    if (!active || !pendingSpecial || !specialReady || !specialRequested) return
    const video = specialVideoRef.current
    if (!video) return
    const { action, requestId } = pendingSpecial
    window.clearTimeout(specialLoadTimerRef.current)
    video.currentTime = 0
    idleVideoRef.current?.pause()
    void playIdleVideoSafely(() => video.play()).then((reason) => {
      if (!mountedRef.current || requestId !== requestIdRef.current) return
      if (reason) {
        returnToIdle(requestId, false)
        return
      }
      dispatch({ type: 'PLAY', kind: 'special', action, requestId })
    })
  }, [active, pendingSpecial, returnToIdle, specialReady, specialRequested])

  useEffect(() => {
    if (!pendingSpecial) return
    const video = specialVideoRef.current
    if (!video) return
    const requestId = pendingSpecial.requestId
    const complete = () => returnToIdle(requestId, true)
    const fail = () => returnToIdle(requestId, false)
    video.addEventListener('ended', complete, { once: true })
    video.addEventListener('error', fail, { once: true })
    video.addEventListener('abort', fail, { once: true })
    video.addEventListener('stalled', fail, { once: true })
    return () => {
      video.removeEventListener('ended', complete)
      video.removeEventListener('error', fail)
      video.removeEventListener('abort', fail)
      video.removeEventListener('stalled', fail)
    }
  }, [pendingSpecial, returnToIdle])

  const specialSource = pendingSpecial ? videoSourceByAction[pendingSpecial.action] : undefined
  const showStatic = reducedMotion || idleUnavailable || !idleReady

  return (
    <div
      className="idle-nurse-visual"
      data-action={animation.action ?? 'none'}
      data-idle-ready={idleReady && !idleUnavailable}
      data-mode={animation.kind}
      data-reduced-motion={reducedMotion}
    >
      <img alt="" aria-hidden="true" className="idle-nurse-visual__static" data-active={showStatic} decoding="async" src={staticSource} />
      <video
        aria-hidden="true"
        autoPlay={active && !reducedMotion}
        className="idle-nurse-visual__idle-video"
        controls={false}
        controlsList="nodownload noplaybackrate nofullscreen"
        disablePictureInPicture
        draggable={false}
        loop
        muted
        onCanPlay={() => {
          setIdleReady(true)
          void playIdle()
        }}
        onContextMenu={(event) => event.preventDefault()}
        onError={() => setIdleUnavailable(true)}
        playsInline
        preload="auto"
        ref={idleVideoRef}
        src={idleVideoSource}
      />
      <video
        aria-hidden="true"
        className="idle-nurse-visual__special-video"
        controls={false}
        controlsList="nodownload noplaybackrate nofullscreen"
        disablePictureInPicture
        draggable={false}
        loop={false}
        muted
        onCanPlay={() => setSpecialReady(true)}
        onContextMenu={(event) => event.preventDefault()}
        playsInline
        preload={specialSource ? 'auto' : 'none'}
        ref={specialVideoRef}
        src={specialSource}
      />
    </div>
  )
}
