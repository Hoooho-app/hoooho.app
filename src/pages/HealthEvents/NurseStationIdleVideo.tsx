import { useEffect, useRef } from 'react'
import idleOne from '../../assets/nurse-triage/nurse-station-idle-1.mp4'
import idleOnePoster from '../../assets/nurse-triage/nurse-station-idle-1-poster.webp'

interface NurseStationIdleVideoProps {
  active: boolean
  reducedMotion: boolean
}

export function NurseStationIdleVideo({ active, reducedMotion }: NurseStationIdleVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    return () => {
      if (!video) return
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !active || reducedMotion) {
      video?.pause()
      return
    }

    let retryUsed = false
    const retryAfterGesture = () => {
      if (retryUsed) return
      retryUsed = true
      removeRetryListeners()
      void video.play().catch(() => undefined)
    }
    const removeRetryListeners = () => {
      window.removeEventListener('pointerdown', retryAfterGesture)
      window.removeEventListener('keydown', retryAfterGesture)
    }

    void video.play().catch(() => {
      window.addEventListener('pointerdown', retryAfterGesture, { once: true, passive: true })
      window.addEventListener('keydown', retryAfterGesture, { once: true })
    })

    return () => {
      removeRetryListeners()
      video.pause()
    }
  }, [active, reducedMotion])

  return <div className="idle-nurse-visual" data-reduced-motion={reducedMotion}>
    <video
      aria-hidden="true"
      autoPlay={active && !reducedMotion}
      className="idle-nurse-visual__idle-video"
      controls={false}
      controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"
      data-active={active && !reducedMotion}
      data-video-phase="idle1"
      disablePictureInPicture
      disableRemotePlayback
      draggable={false}
      loop
      muted
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      playsInline
      poster={idleOnePoster}
      preload="auto"
      ref={videoRef}
      src={idleOne}
      tabIndex={-1}
    />
  </div>
}
