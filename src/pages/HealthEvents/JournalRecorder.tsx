import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'
import symptomCardImage from '../../assets/health-events/quick-record/symptom.webp'
import dailyCardImage from '../../assets/health-events/quick-record/daily.webp'
import visitCardImage from '../../assets/health-events/quick-record/visit.webp'
import medicationCardImage from '../../assets/health-events/quick-record/medication.webp'
import feedingImage from '../../assets/health-events/diet-types/feeding.webp'
import complementaryImage from '../../assets/health-events/diet-types/complementary.webp'
import mealImage from '../../assets/health-events/diet-types/meal.webp'
import snackImage from '../../assets/health-events/diet-types/snack.webp'
import supplementImage from '../../assets/health-events/diet-types/supplement.webp'
import dailyFeedingImage from '../../assets/health-events/daily-record/feeding.webp'
import dailySleepImage from '../../assets/health-events/daily-record/sleep.webp'
import dailyBowelImage from '../../assets/health-events/daily-record/bowel.webp'
import dailyActivityImage from '../../assets/health-events/quick-record/medication.webp'
import type { DietRecordKind, JournalCategory, JournalMetadata } from '../../types/journal'
import { QuickVoiceRecordFlow, type QuickRecordInputChannel } from '../HealthEventDetail/components'
import type { QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { DietRecordFlow } from './DietRecordFlow'
import { BowelRecordFlow } from './BowelRecordFlow'
import { OutdoorActivityRecordFlow } from './OutdoorActivityRecordFlow'
import { TopicalRecordFlow } from './TopicalRecordFlow'
import { createSleepDraft, SleepRecordFlow, type SleepDraft } from './SleepRecordFlow'
import { SymptomRecordFlow } from './SymptomRecordFlow'
import { MedicationRecordFlow } from './MedicationRecordFlow'
import { VaccinationRecordFlow } from './VaccinationRecordFlow'
import { VisitRecordFlow } from './VisitRecordFlow'

type RecorderScreen = 'categories' | 'daily-types' | 'diet-types' | 'diet-form' | 'sleep-form' | 'bowel-form' | 'activity-form' | 'topical-form' | 'symptom-form' | 'medication-form' | 'vaccination-form' | 'visit-form' | 'generic'
interface RecorderHistoryEntry { id: string; screen: RecorderScreen | 'ai'; depth: number; dietKind: DietRecordKind | null }

export function JournalRecorder({ memberId, token, selectedDay, today, initialCategory, initialDietKind, onClose, onConfirm, onSaved }: {
  memberId: string; token: string; selectedDay: string; today: string; onClose: () => void
  initialCategory?: JournalCategory
  initialDietKind?: DietRecordKind
  onConfirm: (text: string, occurredAt: string, channel: QuickRecordInputChannel, photos: QuickRecordPhotoPayload, journal: JournalMetadata) => Promise<string>
  onSaved?: (message: string) => void
}) {
  const location = useLocation()
  const nurseMedicationEntry = Boolean((location.state as { nurseMedicationEntry?: boolean } | null)?.nurseMedicationEntry)
  const initialScreen = initialCategory === 'care' ? 'topical-form' : initialCategory === 'diet' ? 'diet-form' : initialCategory === 'sleep' ? 'sleep-form' : initialCategory === 'elimination' ? 'bowel-form' : initialCategory === 'visit' ? 'visit-form' : initialCategory === 'activity' ? 'activity-form' : initialCategory === 'symptom' ? 'symptom-form' : initialCategory === 'medication' || nurseMedicationEntry ? 'medication-form' : initialCategory ? 'generic' : 'categories'
  const [screen, setScreen] = useState<RecorderScreen>(initialScreen)
  const [selected, setSelected] = useState<JournalCategory[]>([])
  const [dietKind, setDietKind] = useState<DietRecordKind | null>(() => initialDietKind ?? 'feeding')
  const [sleepDraft, setSleepDraft] = useState<SleepDraft>(() => createSleepDraft())
  const [saving, setSaving] = useState(false)
  const flowIdRef = useRef(globalThis.crypto?.randomUUID?.() ?? `recorder-${Date.now()}`)
  const [viewport, setViewport] = useState({ height: window.visualViewport?.height ?? window.innerHeight, inset: 0 })
  const historyEntry = () => (window.history.state?.hooohoRecorder ?? null) as RecorderHistoryEntry | null
  const navigateScreen = (next: RecorderScreen, nextDietKind = dietKind) => {
    const current = historyEntry()
    const depth = current?.id === flowIdRef.current ? current.depth + 1 : 1
    window.history.pushState({ ...window.history.state, hooohoRecorder: { id: flowIdRef.current, screen: next, depth, dietKind: nextDietKind } }, '', `${location.pathname}${location.search}`)
    if (nextDietKind !== dietKind) setDietKind(nextDietKind)
    setScreen(next)
  }
  const closeRecorder = () => {
    const current = historyEntry()
    onClose()
    if (current?.id === flowIdRef.current) window.history.go(-(current.depth + 1))
  }
  const backOneLevel = (fallback: RecorderScreen) => {
    const current = historyEntry()
    if (current?.id === flowIdRef.current && current.depth > 0) window.history.back()
    else if (current?.id === flowIdRef.current) closeRecorder()
    else setScreen(fallback)
  }
  useEffect(() => {
    const initial: RecorderHistoryEntry = { id: flowIdRef.current, screen: initialScreen, depth: 0, dietKind }
    window.history.pushState({ ...window.history.state, hooohoRecorder: initial }, '', `${location.pathname}${location.search}`)
    const handlePopState = () => {
      const current = historyEntry()
      if (current?.id !== flowIdRef.current) { onClose(); return }
      setScreen(current.screen === 'ai' ? 'symptom-form' : current.screen)
      setDietKind(current.dietKind)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  // The recorder owns one same-URL history stack for its mounted lifetime.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const vv = window.visualViewport
    const update = () => setViewport({ height: vv?.height ?? window.innerHeight, inset: Math.max(0, window.innerHeight - (vv?.height ?? window.innerHeight) - (vv?.offsetTop ?? 0)) })
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    return () => { vv?.removeEventListener('resize', update); vv?.removeEventListener('scroll', update) }
  }, [])
  const sourceBack = initialCategory ? closeRecorder : () => backOneLevel('categories')
  const dailyBack = initialCategory ? closeRecorder : () => backOneLevel('daily-types')
  const occurrenceDay = selectedDay
  if (screen === 'topical-form') return <TopicalRecordFlow memberId={memberId} token={token} selectedDay={occurrenceDay} today={today} onBack={dailyBack} onClose={closeRecorder} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)}/>
  if (screen === 'diet-form' && dietKind) return <DietRecordFlow kind={dietKind} memberId={memberId} selectedDay={occurrenceDay} today={today} token={token} onBack={initialCategory ? closeRecorder : () => backOneLevel('categories')} onClose={closeRecorder} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'bowel-form') return <BowelRecordFlow memberId={memberId} selectedDay={occurrenceDay} today={today} token={token} onBack={dailyBack} onClose={closeRecorder} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'sleep-form') return <SleepRecordFlow draft={sleepDraft} memberId={memberId} onDraftChange={setSleepDraft} onBack={sourceBack} onClose={closeRecorder} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'activity-form') return <OutdoorActivityRecordFlow memberId={memberId} selectedDay={occurrenceDay} today={today} token={token} onBack={dailyBack} onClose={closeRecorder} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'symptom-form') return <SymptomRecordFlow memberId={memberId} selectedDay={occurrenceDay} today={today} token={token} onBack={sourceBack} onClose={closeRecorder} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'medication-form') return <MedicationRecordFlow memberId={memberId} selectedDay={occurrenceDay} today={today} token={token} onBack={sourceBack} onClose={closeRecorder} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'vaccination-form') return <VaccinationRecordFlow memberId={memberId} selectedDay={occurrenceDay} today={today} token={token} onBack={sourceBack} onClose={closeRecorder} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'visit-form') return <VisitRecordFlow memberId={memberId} selectedDay={occurrenceDay} today={today} token={token} onBack={sourceBack} onClose={closeRecorder} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  const dietOptions: readonly { kind: DietRecordKind; title: string; description: string; image: string }[] = [
    { kind: 'feeding', title: '喂养', description: '母乳 / 配方奶', image: feedingImage },
    { kind: 'complementary', title: '辅食', description: '泥糊 / 颗粒', image: complementaryImage },
    { kind: 'meal', title: '正餐', description: '早餐 / 午餐 / 晚餐', image: mealImage },
    { kind: 'snack', title: '零食', description: '点心 / 水果 / 饮品', image: snackImage },
    { kind: 'supplement', title: '补剂', description: '维生素 / 矿物质 / 其他', image: supplementImage }
  ]
  const isDietTypes = screen === 'diet-types'
  const categoryScreen = (category: JournalCategory) => category === 'care' ? 'topical-form' : category === 'diet' ? 'diet-form' : category === 'sleep' ? 'sleep-form' : category === 'elimination' ? 'bowel-form' : category === 'activity' ? 'activity-form' : category === 'symptom' ? 'symptom-form' : category === 'medication' ? 'medication-form' : category === 'vaccination' ? 'vaccination-form' : category === 'visit' ? 'visit-form' : 'generic'
  const chooseCategory = (category: JournalCategory) => {
    setSelected([category])
    navigateScreen(categoryScreen(category))
  }
  const dailyCategories: readonly { category: JournalCategory; label: string; image: string }[] = [
    { category: 'diet', label: '喂养/饮食', image: dailyFeedingImage },
    { category: 'sleep', label: '睡眠', image: dailySleepImage },
    { category: 'elimination', label: '排便', image: dailyBowelImage },
    { category: 'care', label: '身体涂抹', image: dailyActivityImage }
  ]
  const hubCategories: readonly { category: JournalCategory; label: string; image: string; action?: () => void }[] = [
    { category: 'symptom', label: '记录症状', image: symptomCardImage },
    { category: 'other', label: '记录日常', image: dailyCardImage, action: () => navigateScreen('daily-types') },
    { category: 'visit', label: '记录就医', image: visitCardImage },
    { category: 'medication', label: '记录用药', image: medicationCardImage }
  ]
  const sheetTitle = screen === 'daily-types' ? '记录日常' : isDietTypes ? '记录喂养/饮食' : screen === 'generic' ? '记录到今天' : '记一下'
  return <div style={{ '--journal-viewport-height': `${viewport.height}px`, '--journal-keyboard-inset': `${viewport.inset}px` } as CSSProperties}><BottomSheetSurface className={`journal-recorder-sheet ${isDietTypes ? 'diet-type-sheet' : screen === 'categories' ? 'journal-category-sheet' : screen === 'daily-types' ? 'journal-daily-sheet' : ''}`} open label={sheetTitle} title={sheetTitle} onClose={() => { if (!saving) closeRecorder() }}
    leading={(screen === 'daily-types' || isDietTypes) ? <button aria-label={screen === 'daily-types' ? '返回记录入口' : '返回记录日常'} className="hoho-bottom-sheet__back" onClick={() => screen === 'daily-types' ? backOneLevel('categories') : initialCategory ? closeRecorder() : backOneLevel('daily-types')} type="button"><ArrowLeft aria-hidden="true" size={20} /></button> : undefined}
    footer={undefined}>
    {screen === 'categories' ? <div className="journal-entry-hub journal-entry-hub--illustrated">{hubCategories.map(({ category, label, image, action }) => <HohoButton className="journal-entry-hub__item" variant="secondary" key={label} onClick={action ?? (() => chooseCategory(category))}><img alt="" aria-hidden="true" className="journal-entry-hub__image" src={image} /><span className="journal-entry-hub__label">{label}</span></HohoButton>)}</div> : screen === 'daily-types' ? <div className="journal-entry-hub journal-entry-hub--daily journal-entry-hub--illustrated">{dailyCategories.map(({ category, label, image }) => <HohoButton className="journal-entry-hub__item" variant="secondary" key={category} onClick={() => chooseCategory(category)}><img alt="" aria-hidden="true" className="journal-entry-hub__image" src={image} /><span className="journal-entry-hub__label">{label}</span></HohoButton>)}</div> : isDietTypes ? <div className="diet-type-grid">{dietOptions.map(({ kind, title, description, image }) => <button className="diet-type-direct-entry" key={kind} onClick={() => navigateScreen('diet-form', kind)} type="button"><img alt="" aria-hidden="true" src={image} /><span><strong>{title}</strong><small>{description}</small></span></button>)}</div> :
      <QuickVoiceRecordFlow open forceManual presentation="nurse-inline" initialInputChannel="text" photoMemberId={memberId} photoToken={token}
        selectedDay={occurrenceDay} today={today}
        onActivityChange={(activity) => setSaving(activity === 'saving')}
        onClose={closeRecorder}
        onConfirm={(text, occurredAt, _candidates, channel, photos) => onConfirm(text, occurredAt, channel, photos, { categories: selected })} />}
  </BottomSheetSurface></div>
}
