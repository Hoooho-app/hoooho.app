import { QuickRecordTrigger } from '../../components/health'
import type { QuickRecordCandidate } from '../../features/quick-record'
import { QuickVoiceRecordFlow } from '../HealthEventDetail/components'
import { NurseTriageDesk } from './NurseTriageDesk'

interface NurseQuickRecordProps {
  currentMemberId: string
  disabled?: boolean
  onClose: () => void
  onConfirm: (transcript: string, occurredAt: string) => Promise<string | void>
  onOpen: () => void
  onPreview: (transcript: string, occurredAt: string) => Promise<QuickRecordCandidate[]>
  open: boolean
  reducedMotion: boolean
}

export function NurseQuickRecord({
  currentMemberId,
  disabled = false,
  onClose,
  onConfirm,
  onOpen,
  onPreview,
  open,
  reducedMotion
}: NurseQuickRecordProps) {
  return (
    <section aria-label="健康事件快捷记录" className="nurse-triage-recorder">
      <div className="nurse-triage-visual-slot">
        <NurseTriageDesk
          audioLevel={0}
          idleActive={!open}
          idleAnimationResetKey={currentMemberId}
          reducedMotion={reducedMotion}
          state="idle"
        />
      </div>
      <div aria-live="polite" className="nurse-triage-status">
        <h3>发生什么，都可以告诉我们</h3>
      </div>
      {!open && (
        <QuickRecordTrigger
          className="nurse-quick-record-trigger"
          disabled={disabled}
          onClick={onOpen}
        />
      )}
      <QuickVoiceRecordFlow
        onClose={onClose}
        onConfirm={onConfirm}
        onPreview={onPreview}
        open={open}
      />
    </section>
  )
}
