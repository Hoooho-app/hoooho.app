import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { IdleNurseVisual } from './IdleNurseVisual'
import type { NurseTriageState } from './nurseTriageMachine'

const nurseTriageAssets = {
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

const visualAssetByState: Partial<Record<NurseTriageState, NurseTriageAsset>> = {
  attention: nurseTriageAssets.attention,
  preparing: nurseTriageAssets.preparing,
  listening: nurseTriageAssets.listening,
  speechPaused: nurseTriageAssets.speechPaused,
  reviewing: nurseTriageAssets.reviewing,
  awaitingConfirmation: nurseTriageAssets.awaitingConfirmation,
  saving: nurseTriageAssets.saving,
  saved: nurseTriageAssets.saved,
  handoff: nurseTriageAssets.handoff,
  shifted: nurseTriageAssets.shifted
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
  idleActive?: boolean
  idleAnimationResetKey: string
  reducedMotion: boolean
  saveSuccessSequence?: number
}

export function NurseTriageDesk({ state, audioLevel, idleActive = true, idleAnimationResetKey, reducedMotion, saveSuccessSequence = 0 }: NurseTriageDeskProps) {
  const pageVisible = usePageVisible()
  const activeAsset = visualAssetByState[state] ?? null
  const idleVideoActive = idleActive && (state === 'idle' || state === 'error')
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
        active={idleVideoActive && pageVisible}
        reducedMotion={reducedMotion}
        resetKey={idleAnimationResetKey}
        saveSuccessSequence={saveSuccessSequence}
      />
      {activeAsset && <img
        alt=""
        aria-hidden="true"
        className="nurse-triage-desk__image"
        data-active="true"
        decoding="async"
        draggable={false}
        src={activeAsset}
      />}
    </figure>
  )
}
