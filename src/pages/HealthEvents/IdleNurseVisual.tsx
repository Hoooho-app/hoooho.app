import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import idleVideoOneSource from '../../assets/nurse-triage/nurses-idle-loop-1.mp4'
import idleVideoTwoSource from '../../assets/nurse-triage/nurses-idle-loop-2.mp4'
import {
  IdleAnimationScheduler,
  idleNurseActions,
  playIdleVideoSafely,
  type IdleNurseAction
} from './idleNurseAnimation'
import {
  beginIdlePlayback,
  chooseAvailableIdle,
  commitIdlePlayback,
  createIdlePlaylistState,
  otherIdleIndex,
  requestNextIdlePlayback,
  resumeIdlePlaylist,
  suspendIdlePlaylist,
  type IdleIndex,
  type IdlePlaylistState
} from './idleVideoPlaylist'
import { createIdleNurseAnimationState, transitionNurseAnimation } from './nurseAnimationController'

const idlePlaylist = [idleVideoOneSource, idleVideoTwoSource] as const
const idleRetryLimit = 3

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
  specialActionsEnabled: boolean
}

export function IdleNurseVisual({ active, reducedMotion, resetKey, specialActionsEnabled }: IdleNurseVisualProps) {
  const [animation, dispatch] = useReducer(transitionNurseAnimation, undefined, () => createIdleNurseAnimationState())
  const [playlist, setPlaylist] = useState<IdlePlaylistState>(() => createIdlePlaylistState())
  const [idlePlaybackBlocked, setIdlePlaybackBlocked] = useState(false)
  const [pendingSpecial, setPendingSpecial] = useState<PendingSpecialAction | null>(null)
  const [specialReady, setSpecialReady] = useState(false)
  const [specialRequested, setSpecialRequested] = useState(false)
  const schedulerRef = useRef<IdleAnimationScheduler | null>(null)
  const playlistRef = useRef(playlist)
  const idleVideoRefs = useRef<[HTMLVideoElement | null, HTMLVideoElement | null]>([null, null])
  const idleReadyRef = useRef<[boolean, boolean]>([false, false])
  const idleFailedRef = useRef<[boolean, boolean]>([false, false])
  const idleRetryCountRef = useRef<[number, number]>([0, 0])
  const idleRetryTimerRef = useRef<[number, number]>([0, 0])
  const idlePlayerSessionRef = useRef<[number, number]>([0, 0])
  const mountedRef = useRef(true)
  const idlePlaybackAllowedRef = useRef(false)
  const reducedMotionRef = useRef(reducedMotion)
  const specialVideoRef = useRef<HTMLVideoElement | null>(null)
  const requestIdRef = useRef(0)
  const specialLoadTimerRef = useRef(0)

  idlePlaybackAllowedRef.current = active && animation.kind === 'idle'
  reducedMotionRef.current = reducedMotion

  const updatePlaylist = useCallback((next: IdlePlaylistState) => {
    playlistRef.current = next
    if (mountedRef.current) setPlaylist(next)
    return next
  }, [])

  const pauseIdlePlayers = useCallback(() => {
    idleVideoRefs.current.forEach((video) => video?.pause())
  }, [])

  const tryPlayPreparedIdle = useCallback(async (player: IdleIndex, playbackSessionId: number) => {
    const current = playlistRef.current
    if (
      !mountedRef.current ||
      !idlePlaybackAllowedRef.current ||
      reducedMotionRef.current ||
      current.suspended ||
      current.pendingPlayer !== player ||
      current.playbackSessionId !== playbackSessionId
    ) {
      return
    }

    const video = idleVideoRefs.current[player]
    if (!video || !idleReadyRef.current[player]) return
    if (video.ended || (Number.isFinite(video.duration) && video.currentTime >= video.duration - 0.05)) {
      video.currentTime = 0
    }

    const reason = await playIdleVideoSafely(() => video.play())
    if (!mountedRef.current) return
    const latest = playlistRef.current
    if (latest.pendingPlayer !== player || latest.playbackSessionId !== playbackSessionId) return
    setIdlePlaybackBlocked(Boolean(reason))
  }, [])

  const startPreparedIdle = useCallback((state: IdlePlaylistState) => {
    const player = state.pendingPlayer
    if (player === null) return
    idlePlayerSessionRef.current[player] = state.playbackSessionId
    const video = idleVideoRefs.current[player]
    if (!video || !idleReadyRef.current[player] || !idlePlaybackAllowedRef.current) return

    if (reducedMotionRef.current) {
      video.pause()
      video.currentTime = 0
      updatePlaylist(commitIdlePlayback(state, player, state.playbackSessionId))
      return
    }

    void tryPlayPreparedIdle(player, state.playbackSessionId)
  }, [tryPlayPreparedIdle, updatePlaylist])

  const beginPreferredIdle = useCallback((preferred: IdleIndex) => {
    const current = playlistRef.current
    const player = chooseAvailableIdle(preferred, idleFailedRef.current)
    if (player === null) {
      updatePlaylist(suspendIdlePlaylist(current))
      return
    }

    const next = beginIdlePlayback(current, player)
    updatePlaylist(next)
    startPreparedIdle(next)
  }, [startPreparedIdle, updatePlaylist])

  const startOrResumeIdle = useCallback(() => {
    const current = playlistRef.current
    if (!idlePlaybackAllowedRef.current) return

    if (!current.suspended) {
      if (current.pendingPlayer !== null) startPreparedIdle(current)
      return
    }

    const resumed = resumeIdlePlaylist(current)
    const player = chooseAvailableIdle(resumed.pendingPlayer ?? 0, idleFailedRef.current)
    if (player === null) return
    const next = player === resumed.pendingPlayer ? resumed : beginIdlePlayback(current, player)
    updatePlaylist(next)
    startPreparedIdle(next)
  }, [startPreparedIdle, updatePlaylist])

  const stopIdlePlaylist = useCallback(() => {
    updatePlaylist(suspendIdlePlaylist(playlistRef.current))
    pauseIdlePlayers()
    setIdlePlaybackBlocked(false)
  }, [pauseIdlePlayers, updatePlaylist])

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
    startOrResumeIdle()
  }, [startOrResumeIdle])

  const retryIdleVideo = useCallback((player: IdleIndex) => {
    idleReadyRef.current[player] = false
    idleFailedRef.current[player] = true
    window.clearTimeout(idleRetryTimerRef.current[player])

    if (idleRetryCountRef.current[player] < idleRetryLimit) {
      idleRetryCountRef.current[player] += 1
      idleRetryTimerRef.current[player] = window.setTimeout(() => {
        if (!mountedRef.current) return
        idleVideoRefs.current[player]?.load()
      }, 2_000)
    }

    const current = playlistRef.current
    if (current.pendingPlayer === player || (current.hasPlayed && current.activePlayer === player)) {
      const fallback = chooseAvailableIdle(otherIdleIndex(player), idleFailedRef.current)
      if (fallback === null) {
        stopIdlePlaylist()
        return
      }
      beginPreferredIdle(fallback)
    }
  }, [beginPreferredIdle, stopIdlePlaylist])

  const handleIdleCanPlay = useCallback((player: IdleIndex) => {
    window.clearTimeout(idleRetryTimerRef.current[player])
    idleRetryTimerRef.current[player] = 0
    idleRetryCountRef.current[player] = 0
    idleReadyRef.current[player] = true
    idleFailedRef.current[player] = false

    const current = playlistRef.current
    if (current.pendingPlayer === player) {
      startPreparedIdle(current)
      return
    }
    if (current.suspended && idlePlaybackAllowedRef.current) startOrResumeIdle()
  }, [startOrResumeIdle, startPreparedIdle])

  const handleIdlePlaying = useCallback((player: IdleIndex) => {
    let current = playlistRef.current
    // The first player's autoplay may win the race against the mount effect.
    // Adopt that playback into a normal session so it cannot remain invisible.
    if (current.suspended && !current.hasPlayed && player === 0 && idlePlaybackAllowedRef.current) {
      current = beginIdlePlayback(current, player)
      idlePlayerSessionRef.current[player] = current.playbackSessionId
      updatePlaylist(current)
    }
    const next = commitIdlePlayback(current, player, idlePlayerSessionRef.current[player])
    if (next === current) return
    updatePlaylist(next)
    setIdlePlaybackBlocked(false)
  }, [updatePlaylist])

  const handleIdleEnded = useCallback((player: IdleIndex) => {
    const current = playlistRef.current
    const requested = requestNextIdlePlayback(current, player, idlePlayerSessionRef.current[player])
    if (requested === current || requested.pendingPlayer === null) return

    const nextPlayer = chooseAvailableIdle(requested.pendingPlayer, idleFailedRef.current)
    if (nextPlayer === null) {
      stopIdlePlaylist()
      return
    }
    const next = nextPlayer === requested.pendingPlayer
      ? requested
      : beginIdlePlayback(current, nextPlayer)
    updatePlaylist(next)
    startPreparedIdle(next)
  }, [startPreparedIdle, stopIdlePlaylist, updatePlaylist])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      idleRetryTimerRef.current.forEach((timer) => window.clearTimeout(timer))
      window.clearTimeout(specialLoadTimerRef.current)
      playlistRef.current = suspendIdlePlaylist(playlistRef.current)
      pauseIdlePlayers()
      specialVideoRef.current?.pause()
    }
  }, [pauseIdlePlayers])

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
    if (specialActionsEnabled && !reducedMotion) scheduler.start()

    return () => {
      scheduler.stop()
      if (schedulerRef.current === scheduler) schedulerRef.current = null
      window.clearTimeout(specialLoadTimerRef.current)
      requestIdRef.current += 1
      specialVideoRef.current?.pause()
    }
  }, [reducedMotion, resetKey, specialActionsEnabled])

  useEffect(() => {
    if (!active || animation.kind !== 'idle') {
      stopIdlePlaylist()
      return
    }
    startOrResumeIdle()
  }, [active, animation.kind, reducedMotion, resetKey, startOrResumeIdle, stopIdlePlaylist])

  useEffect(() => {
    if (!playlist.hasPlayed || playlist.pendingPlayer !== null || animation.kind !== 'idle') return
    const inactivePlayer = otherIdleIndex(playlist.activePlayer)
    const inactiveVideo = idleVideoRefs.current[inactivePlayer]
    if (!inactiveVideo) return
    inactiveVideo.pause()
    if (inactiveVideo.currentTime > 0) inactiveVideo.currentTime = 0
  }, [animation.kind, playlist.activePlayer, playlist.hasPlayed, playlist.pendingPlayer])

  useEffect(() => {
    if (!active || !idlePlaybackBlocked) return
    const resume = () => {
      const current = playlistRef.current
      if (current.pendingPlayer !== null) {
        void tryPlayPreparedIdle(current.pendingPlayer, current.playbackSessionId)
      }
    }
    document.addEventListener('pointerdown', resume, { once: true })
    document.addEventListener('keydown', resume, { once: true })
    return () => {
      document.removeEventListener('pointerdown', resume)
      document.removeEventListener('keydown', resume)
    }
  }, [active, idlePlaybackBlocked, tryPlayPreparedIdle])

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
    stopIdlePlaylist()
    void playIdleVideoSafely(() => video.play()).then((reason) => {
      if (!mountedRef.current || requestId !== requestIdRef.current) return
      if (reason) {
        returnToIdle(requestId, false)
        return
      }
      dispatch({ type: 'PLAY', kind: 'special', action, requestId })
    })
  }, [active, pendingSpecial, returnToIdle, specialReady, specialRequested, stopIdlePlaylist])

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
  return (
    <div
      className="idle-nurse-visual"
      data-action={animation.action ?? 'none'}
      data-active-idle={playlist.hasPlayed ? playlist.activeIdleIndex + 1 : 'none'}
      data-mode={animation.kind}
      data-playback-session={playlist.playbackSessionId}
      data-reduced-motion={reducedMotion}
    >
      {idlePlaylist.map((source, player) => {
        const idlePlayer = player as IdleIndex
        return (
          <video
            aria-hidden="true"
            autoPlay={idlePlayer === 0 && active && !reducedMotion}
            className="idle-nurse-visual__idle-video"
            controls={false}
            controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"
            data-active={animation.kind === 'idle' && playlist.hasPlayed && playlist.activePlayer === idlePlayer}
            data-idle-index={idlePlayer + 1}
            disablePictureInPicture
            disableRemotePlayback
            draggable={false}
            loop={false}
            muted
            onCanPlay={() => handleIdleCanPlay(idlePlayer)}
            onContextMenu={(event) => event.preventDefault()}
            onDragStart={(event) => event.preventDefault()}
            onEnded={() => handleIdleEnded(idlePlayer)}
            onError={() => retryIdleVideo(idlePlayer)}
            onPlaying={() => handleIdlePlaying(idlePlayer)}
            playsInline
            preload="auto"
            ref={(video) => {
              idleVideoRefs.current[idlePlayer] = video
            }}
            src={source}
            tabIndex={-1}
          />
        )
      })}
      <video
        aria-hidden="true"
        className="idle-nurse-visual__special-video"
        controls={false}
        controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"
        disablePictureInPicture
        disableRemotePlayback
        draggable={false}
        loop={false}
        muted
        onCanPlay={() => setSpecialReady(true)}
        onContextMenu={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
        playsInline
        preload={specialSource ? 'auto' : 'none'}
        ref={specialVideoRef}
        src={specialSource}
        tabIndex={-1}
      />
    </div>
  )
}
