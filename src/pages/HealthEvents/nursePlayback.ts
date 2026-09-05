// Only advancing presented frames may reveal a player. Each clip retains its
// element and cached source independently of recorder renders.
export const FRAME_STALL_MS = 1_200
export const RECOVERY_MS = 8_000
export const RETRY_LIMIT = 2

export function createNursePlayback(videos: HTMLVideoElement[], sources: readonly string[]) {
  let enabled = false
  let disposed = false
  let startedIntro = false
  let lastSave = 0
  let current = -1
  let pending = -1
  let generation = 0
  let pendingSince = 0
  const retries = videos.map(() => 0)
  const exhausted = videos.map(() => false)
  const lastFrame = videos.map(() => 0)
  const mediaTime = videos.map(() => -1)
  const frameCount = videos.map(() => 0)
  const decodedFrames = videos.map(() => -1)
  const probes: Array<CanvasRenderingContext2D | null | undefined> = videos.map(() => undefined)
  const callbacks = videos.map(() => 0)
  const cleanup: Array<() => void> = []
  const allowed = () => enabled && !document.hidden && !disposed
  const hide = (index: number) => { if (index >= 0) videos[index].dataset.active = 'false' }
  const next = (index: number) => index === 1 ? 2 : 1
  const available = (index: number) => !exhausted[index] ? index : [1, 2].find((i) => !exhausted[i]) ?? -1
  const prepare = (index: number) => {
    const video = videos[index]
    if (!video.getAttribute('src')) {
      video.preload = 'auto'
      video.src = sources[index]
      video.load()
    }
  }
  const stop = () => {
    generation++
    pending = -1
    current = -1
    videos.forEach((video, i) => { hide(i); video.pause() })
  }
  const start = (index: number, reload = false) => {
    if (!allowed() || index < 0) return
    const attempt = ++generation
    if (pending >= 0 && pending !== current) videos[pending].pause()
    pending = index
    pendingSince = performance.now()
    const video = videos[index]
    hide(index)
    video.pause()
    mediaTime[index] = -1
    frameCount[index] = 0
    decodedFrames[index] = -1
    lastFrame[index] = 0
    prepare(index)
    if (reload) video.load()
    video.currentTime = 0
    if (index === 0) startedIntro = true
    void video.play().catch(() => {
      if (disposed || attempt !== generation) return
      hide(index)
      // Rejected autoplay and failed loads share the finite watchdog budget.
    })
  }
  const recover = (index: number) => {
    hide(index)
    if (retries[index] < RETRY_LIMIT) {
      retries[index]++
      start(index, Boolean(videos[index].error))
    } else {
      exhausted[index] = true
      videos[index].pause()
      if (current === index) current = -1
      pending = -1
      start(available(next(index)))
    }
  }
  const frame = (index: number, time: number) => {
    const video = videos[index]
    if (!allowed() || video.paused || video.ended || (index !== pending && index !== current)) return
    if (time === mediaTime[index]) return
    mediaTime[index] = time
    lastFrame[index] = performance.now()
    frameCount[index]++
    if (frameCount[index] < 2) return
    if (pending === index) {
      const previous = current
      current = index
      pending = -1
      if (previous >= 0 && previous !== index) { hide(previous); videos[previous].pause() }
      // Prepare just the next idle clip after foreground playback starts.
      const upcoming = available(next(index))
      if (upcoming >= 0 && upcoming !== index) prepare(upcoming)
    }
    if (current === index) video.dataset.active = 'true'
  }
  videos.forEach((video, index) => {
    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    const watch = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (disposed) return
      frame(index, metadata.mediaTime)
      callbacks[index] = video.requestVideoFrameCallback(watch)
    }
    if (typeof video.requestVideoFrameCallback === 'function') callbacks[index] = video.requestVideoFrameCallback(watch)
    const ended = () => {
      hide(index)
      if (index === current && pending < 0) start(available(next(index)))
    }
    const failed = () => { hide(index) }
    const paused = () => { hide(index); frameCount[index] = 0 }
    for (const [event, handler] of [['ended', ended], ['error', failed], ['pause', paused]] as const) {
      video.addEventListener(event, handler)
      cleanup.push(() => video.removeEventListener(event, handler))
    }
  })
  const timer = window.setInterval(() => {
    if (!allowed()) return
    const now = performance.now()
    for (const index of new Set([current, pending])) {
      if (index < 0) continue
      const video = videos[index]
      // Older WebKit: decoded-frame progress or changed decoded pixels.
      // Neither loadeddata nor playing reveals video.
      if (typeof video.requestVideoFrameCallback !== 'function' && video.readyState >= 2 && !video.paused && !video.ended) {
        const count = video.getVideoPlaybackQuality?.().totalVideoFrames
        if (count && count !== decodedFrames[index]) {
          decodedFrames[index] = count
          frame(index, video.currentTime)
        } else if (!count && decodedFrames[index] <= 0) {
          // Some WebKit builds expose a frame counter that always returns zero.
          // A tiny, never-displayed same-origin canvas proves pixel changes;
          // advancing currentTime alone cannot expose a frozen decoded frame.
          if (probes[index] === undefined) {
            const canvas = document.createElement('canvas')
            canvas.width = canvas.height = 32
            probes[index] = canvas.getContext('2d', { willReadFrequently: true })
          }
          const context = probes[index]
          if (context && video.videoWidth > 0) {
            try {
              context.drawImage(video, 0, 0, 32, 32)
              const pixels = context.getImageData(0, 0, 32, 32).data
              let signature = 2166136261
              for (const value of pixels) signature = Math.imul(signature ^ value, 16777619)
              frame(index, signature)
            } catch { hide(index) }
          }
        }
      }
      if (lastFrame[index] && now - lastFrame[index] > FRAME_STALL_MS) {
        hide(index)
        frameCount[index] = 0
      }
    }
    if (pending >= 0 && now - pendingSince > RECOVERY_MS) recover(pending)
    else if (pending < 0 && current >= 0 && now - lastFrame[current] > RECOVERY_MS) recover(current)
  }, 200)
  const resume = () => {
    if (!allowed()) { stop(); return }
    if (current < 0 && pending < 0) start(available(startedIntro ? 1 : 0))
  }
  const pageHide = () => stop()
  document.addEventListener('visibilitychange', resume)
  window.addEventListener('pageshow', resume)
  window.addEventListener('pagehide', pageHide)
  return {
    setActive(value: boolean) { enabled = value; if (value) resume(); else stop() },
    saved(sequence: number) {
      if (sequence <= lastSave) return
      lastSave = sequence
      if (allowed() && !exhausted[3]) start(3)
    },
    dispose() {
      disposed = true
      stop()
      window.clearInterval(timer)
      cleanup.forEach((remove) => remove())
      videos.forEach((video, index) => {
        if (callbacks[index]) video.cancelVideoFrameCallback(callbacks[index])
      })
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('pageshow', resume)
      window.removeEventListener('pagehide', pageHide)
    }
  }
}
