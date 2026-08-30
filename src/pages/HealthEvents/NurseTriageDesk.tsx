import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { IdleNurseVisual } from './IdleNurseVisual'
import { canRunIdleNurseAnimation } from './idleNurseAnimation'
import type { NurseTriageState } from './nurseTriageMachine'

const nurseTriageAssets = {
  idle: '/nurse-triage/idle.png',
  idleWorking: '/nurse-triage/idle-working.png',
  attention: '/nurse-triage/attention.png',
  preparing: '/nurse-triage/preparing.png',
  listening: '/nurse-triage/listening.png',
  speechPaused: '/nurse-triage/speech-paused.png',
  reviewing: '/nurse-triage/reviewing.png',
  awaitingConfirmation: '/nurse-triage/awaiting-confirmation.png',
  saving: '/nurse-triage/saving.png',
  saved: '/nurse-triage/saved.png',
  handoff: '/nurse-triage/handoff.png',
  shifted: '/nurse-triage/shifted.png'
} as const

type NurseTriageAsset = (typeof nurseTriageAssets)[keyof typeof nurseTriageAssets]

const visualAssetByState: Record<NurseTriageState, NurseTriageAsset> = {
  idle: nurseTriageAssets.idleWorking,
  attention: nurseTriageAssets.attention,
  preparing: nurseTriageAssets.preparing,
  listening: nurseTriageAssets.listening,
  speechPaused: nurseTriageAssets.speechPaused,
  reviewing: nurseTriageAssets.reviewing,
  awaitingConfirmation: nurseTriageAssets.awaitingConfirmation,
  saving: nurseTriageAssets.saving,
  saved: nurseTriageAssets.saved,
  handoff: nurseTriageAssets.handoff,
  shifted: nurseTriageAssets.shifted,
  error: nurseTriageAssets.idleWorking
}

const allNurseTriageAssets = [...new Set(Object.values(nurseTriageAssets))]

export function preloadNurseTriageAssets() {
  if (typeof Image === 'undefined') return
  allNurseTriageAssets.forEach((source) => {
    const image = new Image()
    image.decoding = 'async'
    image.src = source
  })
}

function usePageVisible() {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  useEffect(() => {
    const handleVisibility = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])
  return visible
}

interface NurseTriageDeskProps {
  state: NurseTriageState
  audioLevel: number
  idleAnimationResetKey: string
  reducedMotion: boolean
}

export function NurseTriageDesk({ state, audioLevel, idleAnimationResetKey, reducedMotion }: NurseTriageDeskProps) {
  const pageVisible = usePageVisible()
  const activeAsset = state === 'idle' ? null : visualAssetByState[state]
  const style = useMemo(() => ({ '--nurse-audio-level': Math.max(0, Math.min(1, audioLevel)) } as CSSProperties), [audioLevel])

  return (
    <figure
      aria-label="护士导诊台"
      className="nurse-triage-desk"
      data-reduced-motion={reducedMotion}
      data-state={state}
      style={style}
    >
      <IdleNurseVisual
        active={canRunIdleNurseAnimation(state, pageVisible, reducedMotion)}
        resetKey={idleAnimationResetKey}
        staticSource="/nurse-triage/idle-video-first-frame.png"
      />
      {allNurseTriageAssets.map((source) => (
        <img
          alt=""
          aria-hidden="true"
          className="nurse-triage-desk__image"
          data-active={source === activeAsset}
          decoding="async"
          key={source}
          src={source}
        />
      ))}
    </figure>
  )
}
