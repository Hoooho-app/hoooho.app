import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { QuickRecordTrigger } from '../../components/health'
import { QuickVoiceRecordFlow, type QuickRecordActivity, type QuickRecordInputChannel } from '../HealthEventDetail/components'
import { NursePromptCarousel } from './NursePromptCarousel'
import { shouldTriggerNurseSaveSuccess } from './nurseSaveSuccess'
import { NurseTriageDesk } from './NurseTriageDesk'
import './NurseQuickRecord.css'

interface NurseQuickRecordProps {
  currentMemberId: string
  disabled?: boolean
  nextActionDisabled?: boolean
  nextActionOpen: boolean
  onClose: () => void
  onConfirm: (transcript: string, occurredAt: string, inputChannel: QuickRecordInputChannel) => Promise<string | void>
  onNextActionOpen: () => void
  onOpen: () => void
  open: boolean
  reducedMotion: boolean
}

export function NurseQuickRecord({
  currentMemberId,
  disabled = false,
  nextActionDisabled = false,
  nextActionOpen,
  onClose,
  onConfirm,
  onNextActionOpen,
  onOpen,
  open,
  reducedMotion
}: NurseQuickRecordProps) {
  const [savedNotice, setSavedNotice] = useState('')
  const [saveSuccessSequence, setSaveSuccessSequence] = useState(0)
  const [activity, setActivity] = useState<QuickRecordActivity>('idle')
  const noticeTimerRef = useRef<number | null>(null)
  const quickRecordSessionRef = useRef(0)
  const animatedSaveSessionRef = useRef(-1)
  const triageState = activity === 'listening'
    ? 'listening'
    : activity === 'reviewing'
      ? 'reviewing'
      : activity === 'saving'
        ? 'saving'
        : activity === 'saved'
          ? 'saved'
          : activity === 'error'
            ? 'error'
            : activity === 'attention'
              ? 'attention'
              : 'idle'
  const openQuickRecord = () => {
    quickRecordSessionRef.current += 1
    setSavedNotice('')
    onOpen()
  }
  const showSavedNotice = (message: string, inputChannel: QuickRecordInputChannel) => {
    setSavedNotice(message)
    if (shouldTriggerNurseSaveSuccess(inputChannel, quickRecordSessionRef.current, animatedSaveSessionRef.current)) {
      animatedSaveSessionRef.current = quickRecordSessionRef.current
      setSaveSuccessSequence((sequence) => sequence + 1)
    }
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null
      setSavedNotice('')
    }, 1800)
  }

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current)
  }, [])

  return (
    <section aria-label="健康随记快捷记录" className="nurse-triage-recorder">
      <div className="nurse-triage-visual-slot">
        <NurseTriageDesk
          audioLevel={0}
          idleActive={!open}
          idleAnimationResetKey={currentMemberId}
          reducedMotion={reducedMotion}
          saveSuccessSequence={saveSuccessSequence}
          state={triageState}
        />
      </div>
      <div className="nurse-triage-status">
        <NursePromptCarousel paused={open} reducedMotion={reducedMotion} />
      </div>
      <div className="nurse-quick-record-anchor" data-open={open}>
        {savedNotice && <div aria-live="polite" className="nurse-quick-record-saved"><Check aria-hidden="true" size={18} /><strong>{savedNotice}</strong></div>}
        <div className="nurse-quick-record-controls">
          <div className="nurse-quick-record-entry" data-visible={!open}>
            <QuickRecordTrigger
              className="nurse-quick-record-trigger"
              disabled={disabled}
              onClick={openQuickRecord}
            />
          </div>
          <button
            aria-haspopup="dialog"
            aria-label="打开当前健康随记的下一步"
            aria-pressed={nextActionOpen}
            className="nurse-next-action-trigger"
            data-active={nextActionOpen}
            disabled={nextActionDisabled}
            onClick={onNextActionOpen}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 80 80">
              <path d="M 13 65 Q 40 28 67 13" />
              <circle className="nurse-next-action-mark__start" cx="13" cy="65" r="6" />
              <circle cx="40" cy="38" r="11" />
              <circle className="nurse-next-action-mark__end" cx="67" cy="13" r="8" />
            </svg>
          </button>
        </div>
        <QuickVoiceRecordFlow
          onActivityChange={setActivity}
          onClose={onClose}
          onConfirm={(transcript, occurredAt, _candidates, inputChannel) => onConfirm(transcript, occurredAt, inputChannel)}
          onSaved={showSavedNotice}
          open={open}
          presentation="nurse-inline"
        />
      </div>
    </section>
  )
}
