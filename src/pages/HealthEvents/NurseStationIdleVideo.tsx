import { useEffect, useRef, useState } from 'react'
import idleOne from '../../assets/nurse-triage/nurse-station-idle-1.mp4'
import idleOnePoster from '../../assets/nurse-triage/nurse-station-idle-1-poster.webp'
import idleOneWebm from '../../assets/nurse-triage/nurse-station-idle-1-portable-20261025.webm'
import cutoutPacked from '../../assets/nurse-triage/nurse-station-cutout-packed-20261029.mp4'
import cutoutPackedWebm from '../../assets/nurse-triage/nurse-station-cutout-packed-20261029.webm'
import cutoutPoster from '../../assets/nurse-triage/nurse-station-cutout-poster-20261029.webp'

interface NurseStationIdleVideoProps {
  active: boolean
  reducedMotion: boolean
  portable?: boolean
  cutout?: boolean
}

export function NurseStationIdleVideo({ active, reducedMotion, portable=false, cutout=false }: NurseStationIdleVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [frameReady, setFrameReady] = useState(false)

  useEffect(() => {
    if (!cutout) return
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas) return
    const context = canvas.getContext('2d')
    const packed = document.createElement('canvas')
    packed.width = 360; packed.height = 720
    const reader = packed.getContext('2d', { willReadFrequently: true })
    if (!context || !reader) return // Transparent poster stays visible.
    const output = context.createImageData(360, 360)
    const half = output.data.length
    let ready = false, renderingFailed = false, animation = 0, videoFrame = 0, lastTime = -1
    setFrameReady(false)
    const draw = () => {
      if (renderingFailed || video.readyState < 2 || video.videoWidth !== 360 || video.videoHeight !== 720 || lastTime === video.currentTime) return
      try {
        reader.drawImage(video, 0, 0, 360, 720)
        const pixels = reader.getImageData(0, 0, 360, 720).data
        output.data.set(pixels.subarray(0, half))
        // Both panels are decoded from the same frame: no mask/video drift.
        for (let index = 0; index < half; index += 4) {
          const matte = pixels[half + index]
          // Lossy video may decode flat black/white a few levels off. Snap
          // those endpoints so the backdrop is fully clear and clothes opaque.
          output.data[index + 3] = matte < 4 ? 0 : matte > 251 ? 255 : matte
        }
        context.putImageData(output, 0, 0)
        lastTime = video.currentTime
        if (!ready) { ready = true; setFrameReady(true) }
      } catch { failed() }
    }
    const cancel = () => {
      cancelAnimationFrame(animation)
      if (videoFrame && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(videoFrame)
      animation = 0; videoFrame = 0
    }
    const tick = () => {
      draw()
      if (renderingFailed || video.paused || video.ended) return
      if (video.requestVideoFrameCallback) videoFrame = video.requestVideoFrameCallback(tick)
      else animation = requestAnimationFrame(tick)
    }
    const start = () => { cancel(); tick() }
    const failed = () => { cancel(); renderingFailed = true; ready = false; setFrameReady(false) }
    video.addEventListener('loadeddata', draw)
    video.addEventListener('seeked', draw)
    video.addEventListener('play', start)
    video.addEventListener('pause', cancel)
    video.addEventListener('error', failed)
    draw()
    if (!video.paused) start()
    return () => {
      cancel()
      video.removeEventListener('loadeddata', draw)
      video.removeEventListener('seeked', draw)
      video.removeEventListener('play', start)
      video.removeEventListener('pause', cancel)
      video.removeEventListener('error', failed)
    }
  }, [cutout])

  useEffect(() => {
    const video = videoRef.current
    // StrictMode replays effect cleanup while keeping the same video element.
    if(video){
      const sources=portable||cutout?[...video.querySelectorAll('source')]:[video]
      const urls=cutout?[cutoutPackedWebm,cutoutPacked]:portable?[idleOneWebm,idleOne]:[idleOne]
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
  }, [portable, cutout])

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

  return <div className="idle-nurse-visual" data-reduced-motion={reducedMotion} data-cutout={cutout} data-cutout-ready={frameReady}>
    {cutout && <><img className="idle-nurse-visual__cutout-poster" src={cutoutPoster} alt="" draggable={false}/><canvas className="idle-nurse-visual__cutout" width={360} height={360} ref={canvasRef} aria-hidden="true"/></>}
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
      poster={cutout?cutoutPoster:idleOnePoster}
      preload="auto"
      ref={videoRef}
      src={cutout||portable?undefined:idleOne}
      tabIndex={-1}
    >{cutout?<><source src={cutoutPackedWebm} type={'video/webm; codecs="vp9"'}/><source src={cutoutPacked} type="video/mp4"/></>:portable&&<><source src={idleOneWebm} type={'video/webm; codecs="vp9"'}/><source src={idleOne} type="video/mp4"/></>}</video>
  </div>
}
