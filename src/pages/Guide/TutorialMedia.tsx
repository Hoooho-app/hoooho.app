import { Pause, Play, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GuideMedia } from '../../features/guide/tutorials'

interface TutorialMediaProps { id: string; media: GuideMedia; title: string }

const activeMediaEvent = 'hoooho-guide-active-media'
const reducedMotionPreferred = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function TutorialMedia({ id, media, title }: TutorialMediaProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(reducedMotionPreferred)
  const [visible, setVisible] = useState(false)

  const pause = useCallback(() => { videoRef.current?.pause(); setPlaying(false) }, [])
  const play = useCallback(async () => {
    if (!videoRef.current || failed || reducedMotion || !visible) return
    try {
      await videoRef.current.play()
      window.dispatchEvent(new CustomEvent(activeMediaEvent, { detail: id }))
      setPlaying(true)
    } catch { setPlaying(false) }
  }, [failed, id, reducedMotion, visible])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: [0, 0.2, 0.58, 1] })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const deactivate = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) pause() }
    window.addEventListener(activeMediaEvent, deactivate)
    return () => window.removeEventListener(activeMediaEvent, deactivate)
  }, [id, pause])

  useEffect(() => {
    if (!visible || reducedMotion || failed) pause()
    else void play()
  }, [failed, pause, play, reducedMotion, visible])

  const toggle = () => {
    const video = videoRef.current
    if (!video || failed || reducedMotion) return
    if (video.paused) { if (video.ended) video.currentTime = 0; void play() } else pause()
  }
  const replay = () => {
    if (!videoRef.current || failed || reducedMotion) return
    videoRef.current.currentTime = 0
    void play()
  }

  return <div className="guide-media" data-failed={failed} data-reduced-motion={reducedMotion} ref={containerRef}>
    {failed || reducedMotion
      ? <img alt={`${title}操作演示封面`} decoding="async" loading="lazy" src={media.poster} />
      : <video aria-label={`${title}操作演示`} loop muted onError={() => { setFailed(true); setPlaying(false) }} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} playsInline poster={media.poster} preload="metadata" ref={videoRef}>
          <source src={media.video} type="video/webm" />
        </video>}
    {!failed && !reducedMotion && <div className="guide-media__controls">
      <button aria-label={playing ? `暂停${title}操作演示` : `播放${title}操作演示`} aria-pressed={playing} onClick={toggle} type="button">{playing ? <Pause size={15} /> : <Play size={15} />}</button>
      <button aria-label={`重新播放${title}操作演示`} onClick={replay} type="button"><RotateCcw size={15} /></button>
    </div>}
    {(failed || reducedMotion) && <span className="guide-media__fallback">{failed ? '演示暂时无法加载，请查看步骤' : '已按系统设置减少动态效果'}</span>}
  </div>
}
