import { useCallback, useEffect, useRef, useState } from 'react'
import idleIntroZeroSource from '../../assets/nurse-triage/nurses-idle-intro-0.mp4'
import idleVideoOneSource from '../../assets/nurse-triage/nurses-idle-loop-1.mp4'
import idleVideoTwoSource from '../../assets/nurse-triage/nurses-idle-loop-2.mp4'
import {
  beginIdlePlayback,
  chooseAvailableVideo,
  commitIdlePlayback,
  createIdlePlaylistState,
  isVideoVisible,
  loadAndPlayIdleVideo,
  requestNextIdlePlayback,
  resumeIdlePlaylist,
  suspendIdlePlaylist,
  type IdlePlaylistState,
  type NurseVideoIndex
} from './idleVideoPlaylist'

export const idlePlaylist = [idleIntroZeroSource, idleVideoOneSource, idleVideoTwoSource] as const

const idleRetryLimit = 3
const videoPhaseNames = ['intro0', 'idle1', 'idle2'] as const

interface IdleNurseVisualProps {
  active: boolean
  reducedMotion: boolean
  resetKey: string
}

export function IdleNurseVisual({ active, reducedMotion, resetKey }: IdleNurseVisualProps) {
  const [playlist, setPlaylist] = useState<IdlePlaylistState>(() => createIdlePlaylistState())
  const [idlePlaybackBlocked, setIdlePlaybackBlocked] = useState(false)
  const playlistRef = useRef(playlist)
  const idleVideoRefs = useRef<[HTMLVideoElement | null, HTMLVideoElement | null, HTMLVideoElement | null]>([null, null, null])
  const idleFailedRef = useRef<[boolean, boolean, boolean]>([false, false, false])
  const idleRetryCountRef = useRef<[number, number, number]>([0, 0, 0])
  const idleRetryTimerRef = useRef<[number, number, number]>([0, 0, 0])
  const videoSessionRef = useRef<[number, number, number]>([0, 0, 0])
  const mountedRef = useRef(true)
  const idlePlaybackAllowedRef = useRef(false)
  const reducedMotionRef = useRef(reducedMotion)

  idlePlaybackAllowedRef.current = active
  reducedMotionRef.current = reducedMotion

  const updatePlaylist = useCallback((next: IdlePlaylistState) => {
    playlistRef.current = next
    if (mountedRef.current) setPlaylist(next)
    return next
  }, [])

  const pauseIdlePlayers = useCallback(() => {
    idleVideoRefs.current.forEach((video) => video?.pause())
  }, [])

  const tryPlayPreparedVideo = useCallback(async (videoIndex: NurseVideoIndex, playbackSessionId: number) => {
    const current = playlistRef.current
    if (
      !mountedRef.current ||
      !idlePlaybackAllowedRef.current ||
      reducedMotionRef.current ||
      current.suspended ||
      current.pendingVideoIndex !== videoIndex ||
      current.playbackSessionId !== playbackSessionId
    ) {
      return
    }

    const video = idleVideoRefs.current[videoIndex]
    if (!video) return
    const reason = await loadAndPlayIdleVideo(video)
    if (!mountedRef.current) return
    const latest = playlistRef.current
    if (latest.pendingVideoIndex !== videoIndex || latest.playbackSessionId !== playbackSessionId) return
    setIdlePlaybackBlocked(Boolean(reason))
  }, [])

  const startPreparedVideo = useCallback((state: IdlePlaylistState) => {
    const videoIndex = state.pendingVideoIndex
    if (videoIndex === null) return
    videoSessionRef.current[videoIndex] = state.playbackSessionId
    const video = idleVideoRefs.current[videoIndex]
    if (!video || !idlePlaybackAllowedRef.current) return

    if (reducedMotionRef.current) {
      video.pause()
      video.currentTime = 0
      updatePlaylist(commitIdlePlayback(state, videoIndex, state.playbackSessionId))
      return
    }

    void tryPlayPreparedVideo(videoIndex, state.playbackSessionId)
  }, [tryPlayPreparedVideo, updatePlaylist])

  const beginPreferredVideo = useCallback((preferred: NurseVideoIndex) => {
    const current = playlistRef.current
    const videoIndex = chooseAvailableVideo(preferred, idleFailedRef.current)
    if (videoIndex === null) {
      updatePlaylist(suspendIdlePlaylist(current))
      return
    }

    const next = beginIdlePlayback(current, videoIndex)
    updatePlaylist(next)
    startPreparedVideo(next)
  }, [startPreparedVideo, updatePlaylist])

  const startOrResumeIdle = useCallback(() => {
    const current = playlistRef.current
    if (!idlePlaybackAllowedRef.current) return

    if (!current.suspended) {
      if (current.pendingVideoIndex !== null) startPreparedVideo(current)
      return
    }

    const resumed = resumeIdlePlaylist(current)
    const videoIndex = chooseAvailableVideo(resumed.pendingVideoIndex ?? 0, idleFailedRef.current)
    if (videoIndex === null) return
    const next = videoIndex === resumed.pendingVideoIndex ? resumed : beginIdlePlayback(current, videoIndex)
    updatePlaylist(next)
    startPreparedVideo(next)
  }, [startPreparedVideo, updatePlaylist])

  const stopIdlePlaylist = useCallback(() => {
    updatePlaylist(suspendIdlePlaylist(playlistRef.current))
    pauseIdlePlayers()
    setIdlePlaybackBlocked(false)
  }, [pauseIdlePlayers, updatePlaylist])

  const retryIdleVideo = useCallback((videoIndex: NurseVideoIndex) => {
    idleFailedRef.current[videoIndex] = true
    window.clearTimeout(idleRetryTimerRef.current[videoIndex])

    if (idleRetryCountRef.current[videoIndex] < idleRetryLimit) {
      idleRetryCountRef.current[videoIndex] += 1
      idleRetryTimerRef.current[videoIndex] = window.setTimeout(() => {
        if (!mountedRef.current) return
        idleVideoRefs.current[videoIndex]?.load()
      }, 2_000)
    }

    const current = playlistRef.current
    if (current.pendingVideoIndex === videoIndex || (current.hasPlayed && current.activeVideoIndex === videoIndex)) {
      const fallback = chooseAvailableVideo(current.nextVideoIndex, idleFailedRef.current)
      if (fallback === null) {
        stopIdlePlaylist()
        return
      }
      beginPreferredVideo(fallback)
    }
  }, [beginPreferredVideo, stopIdlePlaylist])

  const handleIdleCanPlay = useCallback((videoIndex: NurseVideoIndex) => {
    window.clearTimeout(idleRetryTimerRef.current[videoIndex])
    idleRetryTimerRef.current[videoIndex] = 0
    idleRetryCountRef.current[videoIndex] = 0
    idleFailedRef.current[videoIndex] = false

    const current = playlistRef.current
    if (current.pendingVideoIndex === videoIndex) {
      startPreparedVideo(current)
      return
    }
    if (current.suspended && idlePlaybackAllowedRef.current) startOrResumeIdle()
  }, [startOrResumeIdle, startPreparedVideo])

  const handleIdlePlaying = useCallback((videoIndex: NurseVideoIndex) => {
    let current = playlistRef.current
    if (current.suspended && !current.hasPlayed && videoIndex === 0 && idlePlaybackAllowedRef.current) {
      current = beginIdlePlayback(current, videoIndex)
      videoSessionRef.current[videoIndex] = current.playbackSessionId
      updatePlaylist(current)
    }
    const next = commitIdlePlayback(current, videoIndex, videoSessionRef.current[videoIndex])
    if (next === current) return
    updatePlaylist(next)
    setIdlePlaybackBlocked(false)
  }, [updatePlaylist])

  const handleIdleEnded = useCallback((videoIndex: NurseVideoIndex) => {
    const current = playlistRef.current
    const requested = requestNextIdlePlayback(current, videoIndex, videoSessionRef.current[videoIndex])
    if (requested === current || requested.pendingVideoIndex === null) return

    const nextVideoIndex = chooseAvailableVideo(requested.pendingVideoIndex, idleFailedRef.current)
    if (nextVideoIndex === null) {
      stopIdlePlaylist()
      return
    }
    const next = nextVideoIndex === requested.pendingVideoIndex
      ? requested
      : beginIdlePlayback(current, nextVideoIndex)
    updatePlaylist(next)
    startPreparedVideo(next)
  }, [startPreparedVideo, stopIdlePlaylist, updatePlaylist])

  useEffect(() => {
    mountedRef.current = true
    idleVideoRefs.current.forEach((video) => {
      if (video && video.networkState === HTMLMediaElement.NETWORK_EMPTY) video.load()
    })
    return () => {
      mountedRef.current = false
      idleRetryTimerRef.current.forEach((timer) => window.clearTimeout(timer))
      playlistRef.current = suspendIdlePlaylist(playlistRef.current)
      pauseIdlePlayers()
    }
  }, [pauseIdlePlayers])

  useEffect(() => {
    if (!active) {
      stopIdlePlaylist()
      return
    }
    startOrResumeIdle()
  }, [active, reducedMotion, resetKey, startOrResumeIdle, stopIdlePlaylist])

  useEffect(() => {
    if (!playlist.hasPlayed || playlist.pendingVideoIndex !== null) return
    idleVideoRefs.current.forEach((video, videoIndex) => {
      if (!video || videoIndex === playlist.activeVideoIndex) return
      video.pause()
      if (video.currentTime > 0) video.currentTime = 0
    })
  }, [playlist.activeVideoIndex, playlist.hasPlayed, playlist.pendingVideoIndex])

  useEffect(() => {
    if (!active || !idlePlaybackBlocked) return
    const resume = () => {
      const current = playlistRef.current
      if (current.pendingVideoIndex !== null) {
        void tryPlayPreparedVideo(current.pendingVideoIndex, current.playbackSessionId)
      }
    }
    document.addEventListener('pointerdown', resume, { once: true })
    document.addEventListener('keydown', resume, { once: true })
    return () => {
      document.removeEventListener('pointerdown', resume)
      document.removeEventListener('keydown', resume)
    }
  }, [active, idlePlaybackBlocked, tryPlayPreparedVideo])

  return (
    <div
      className="idle-nurse-visual"
      data-active-video={videoPhaseNames[playlist.activeVideoIndex]}
      data-playback-session={playlist.playbackSessionId}
      data-reduced-motion={reducedMotion}
    >
      {idlePlaylist.map((source, videoIndexValue) => {
        const videoIndex = videoIndexValue as NurseVideoIndex
        return (
          <video
            aria-hidden="true"
            autoPlay={videoIndex === 0 && active && !reducedMotion}
            className="idle-nurse-visual__idle-video"
            controls={false}
            controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"
            data-active={isVideoVisible(playlist, videoIndex)}
            data-video-phase={videoPhaseNames[videoIndex]}
            disablePictureInPicture
            disableRemotePlayback
            draggable={false}
            loop={false}
            muted
            onCanPlay={() => handleIdleCanPlay(videoIndex)}
            onContextMenu={(event) => event.preventDefault()}
            onDragStart={(event) => event.preventDefault()}
            onEnded={() => handleIdleEnded(videoIndex)}
            onError={() => retryIdleVideo(videoIndex)}
            onPlaying={() => handleIdlePlaying(videoIndex)}
            playsInline
            preload="auto"
            ref={(video) => {
              idleVideoRefs.current[videoIndex] = video
            }}
            src={source}
            tabIndex={-1}
          />
        )
      })}
    </div>
  )
}
