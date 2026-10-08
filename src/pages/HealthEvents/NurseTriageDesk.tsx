import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { IdleNurseVisual } from './IdleNurseVisual'
import { NurseStationIdleVideo } from './NurseStationIdleVideo'
import type { NurseTriageState } from './nurseTriageMachine'

const nurseTriageAssets = {
  attention: '/nurse-triage/attention.0e839af8d0.webp',
  preparing: '/nurse-triage/preparing.75a958747e.webp',
  listening: '/nurse-triage/listening.ac2a73c2f7.webp',
  speechPaused: '/nurse-triage/speech-paused.2d25ea8b7c.webp',
  reviewing: '/nurse-triage/reviewing.46297d4a67.webp',
  awaitingConfirmation: '/nurse-triage/awaiting-confirmation.7d6e9afe32.webp',
  saving: '/nurse-triage/saving.ca64982bfe.webp',
  saved: '/nurse-triage/saved.e10c9b3405.webp',
  handoff: '/nurse-triage/handoff.f19c1f491d.webp',
  shifted: '/nurse-triage/shifted.d6d40cee88.webp'
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
  stationIdleOnly?: boolean
}

export function NurseTriageDesk({ state, audioLevel, idleActive = true, idleAnimationResetKey, reducedMotion, saveSuccessSequence = 0, stationIdleOnly = false }: NurseTriageDeskProps) {
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
      {stationIdleOnly
        ? <NurseStationIdleVideo active={idleVideoActive && pageVisible} reducedMotion={reducedMotion} />
        : <IdleNurseVisual
            active={idleVideoActive && pageVisible}
            reducedMotion={reducedMotion}
            resetKey={idleAnimationResetKey}
            saveSuccessSequence={saveSuccessSequence}
          />}
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
