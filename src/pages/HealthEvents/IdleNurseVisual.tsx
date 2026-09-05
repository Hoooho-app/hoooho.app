import { useEffect, useRef } from 'react'
import intro from '../../assets/nurse-triage/nurses-idle-intro-0-mobile.mp4'
import idleOne from '../../assets/nurse-triage/nurses-idle-loop-1-mobile.mp4'
import idleTwo from '../../assets/nurse-triage/nurses-idle-loop-2-mobile.mp4'
import saved from '../../assets/nurse-triage/nurse-save-success-ok-mobile.mp4'
import { createNursePlayback } from './nursePlayback'

export const idlePlaylist = [intro, idleOne, idleTwo] as const
const sources = [...idlePlaylist, saved]
const phases = ['intro0', 'idle1', 'idle2', 'save_success']
interface IdleNurseVisualProps {
  active: boolean
  reducedMotion: boolean
  resetKey: string
  saveSuccessSequence: number
}
export function IdleNurseVisual({ active, reducedMotion, saveSuccessSequence }: IdleNurseVisualProps) {
  const root = useRef<HTMLDivElement>(null)
  const playback = useRef<ReturnType<typeof createNursePlayback>>()
  useEffect(() => {
    const controller = createNursePlayback(Array.from(root.current!.querySelectorAll('video')), sources)
    playback.current = controller
    return () => { controller.dispose(); playback.current = undefined }
  }, [])
  useEffect(() => { playback.current?.setActive(active && !reducedMotion) }, [active, reducedMotion])
  useEffect(() => { playback.current?.saved(saveSuccessSequence) }, [saveSuccessSequence])
  return <div className="idle-nurse-visual" ref={root} data-reduced-motion={reducedMotion}>
    {phases.map((phase) => <video key={phase}
      aria-hidden="true" className="idle-nurse-visual__idle-video"
      data-active="false" data-video-phase={phase}
      controls={false} controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"
      disablePictureInPicture disableRemotePlayback draggable={false}
      muted playsInline preload="none" tabIndex={-1}
      onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()}
    />)}
  </div>
}
