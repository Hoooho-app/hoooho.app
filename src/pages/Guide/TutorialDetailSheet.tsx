import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'
import type { GuideTutorial } from '../../features/guide/tutorials'
import { TutorialMedia } from './TutorialMedia'

interface TutorialDetailSheetProps { onClose: () => void; tutorial: GuideTutorial | null }

export function TutorialDetailSheet({ onClose, tutorial }: TutorialDetailSheetProps) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  useEffect(() => setStep(0), [tutorial?.id])
  if (!tutorial) return null
  return <BottomSheetSurface
    className="guide-detail-sheet"
    footer={<HohoButton fullWidth onClick={() => navigate(tutorial.actionTo, { state: { fromGuide: true } })}>{tutorial.actionLabel}<ArrowRight size={17} /></HohoButton>}
    label="详细教程"
    onClose={onClose}
    open
    size="workspace"
    title={tutorial.title}
  >
    <div className="guide-detail">
      {tutorial.media && <TutorialMedia id={`detail-${tutorial.id}`} media={tutorial.media} title={tutorial.title} />}
      <p className="guide-detail__context">{tutorial.context}</p>
      <section className="guide-detail__step" aria-live="polite"><span>步骤 {step + 1} / {tutorial.steps.length}</span><strong>{tutorial.steps[step]}</strong></section>
      <div className="guide-detail__step-actions">
        <button disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))} type="button"><ArrowLeft size={16} />上一步</button>
        <button disabled={step === tutorial.steps.length - 1} onClick={() => setStep((current) => Math.min(tutorial.steps.length - 1, current + 1))} type="button">下一步<ArrowRight size={16} /></button>
      </div>
      <section className="guide-result"><span>完成后</span><p>{tutorial.result}</p></section>
    </div>
  </BottomSheetSurface>
}
