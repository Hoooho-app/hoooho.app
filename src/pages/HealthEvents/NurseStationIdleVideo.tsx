import { useEffect, useRef } from 'react'
import idleOne from '../../assets/nurse-triage/nurse-station-idle-1.mp4'
import idleOnePoster from '../../assets/nurse-triage/nurse-station-idle-1-poster.webp'
import idleOneWebm from '../../assets/nurse-triage/nurse-station-idle-1-portable-20261025.webm'

interface NurseStationIdleVideoProps {
  active: boolean
  reducedMotion: boolean
  portable?: boolean
}

export function NurseStationIdleVideo({ active, reducedMotion, portable=false }: NurseStationIdleVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    // StrictMode replays effect cleanup while keeping the same video element.
    if(video){
      const sources=portable?[...video.querySelectorAll('source')]:[video]
      const urls=portable?[idleOneWebm,idleOne]:[idleOne]
      let restored=false
      sources.forEach((source,index)=>{if(!source.getAttribute('src')){source.setAttribute('src',urls[index]);restored=true}})
      if(restored)video.load()
    }
    return () => {
      if (!video) return
      video.pause()
      video.removeAttribute('src')
      video.querySelectorAll('source').forEach(source=>source.removeAttribute('src'))
      video.load()
    }
  }, [portable])

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
      src={portable?undefined:idleOne}
      tabIndex={-1}
    >{portable&&<><source src={idleOneWebm} type={'video/webm; codecs="vp9"'}/><source src={idleOne} type="video/mp4"/></>}</video>
  </div>
}
