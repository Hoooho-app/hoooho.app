import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { nextAmbientNurseDelay, type NurseTriageState } from './nurseTriageMachine'

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

function useAmbientIdlePose(active: boolean) {
  const [alternate, setAlternate] = useState(false)

  useEffect(() => {
    if (!active) {
      setAlternate(false)
      return
    }

    let nextTimer = 0
    let settleTimer = 0
    const schedule = () => {
      window.clearTimeout(nextTimer)
      if (document.hidden) return
      nextTimer = window.setTimeout(() => {
        setAlternate(true)
        settleTimer = window.setTimeout(() => {
          setAlternate(false)
          schedule()
        }, 900)
      }, nextAmbientNurseDelay())
    }
    const handleVisibility = () => {
      window.clearTimeout(nextTimer)
      window.clearTimeout(settleTimer)
      setAlternate(false)
      if (!document.hidden) schedule()
    }

    schedule()
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.clearTimeout(nextTimer)
      window.clearTimeout(settleTimer)
    }
  }, [active])

  return alternate
}

interface NurseTriageDeskProps {
  state: NurseTriageState
  audioLevel: number
  reducedMotion: boolean
}

export function NurseTriageDesk({ state, audioLevel, reducedMotion }: NurseTriageDeskProps) {
  const alternateIdlePose = useAmbientIdlePose(state === 'idle' && !reducedMotion)
  const activeAsset = state === 'idle' && alternateIdlePose ? nurseTriageAssets.idle : visualAssetByState[state]
  const style = useMemo(() => ({ '--nurse-audio-level': Math.max(0, Math.min(1, audioLevel)) } as CSSProperties), [audioLevel])

  return (
    <figure
      aria-label="护士导诊台"
      className="nurse-triage-desk"
      data-reduced-motion={reducedMotion}
      data-state={state}
      style={style}
    >
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
