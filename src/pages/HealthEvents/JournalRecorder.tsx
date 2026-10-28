import { JournalCategoryIcon, JournalDietIcon } from './JournalCategoryIcon'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useLocation } from 'react-router-dom'
import { ArrowLeft } from '../../components/icons'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'
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
import { DailyRecordScope } from './DailyRecordSettings'
import type { DailyExtras } from '../../services/dailyRecords'
import type { ReactNode } from 'react'

type RecorderScreen = 'categories' | 'daily-types' | 'diet-types' | 'diet-form' | 'sleep-form' | 'bowel-form' | 'activity-form' | 'topical-form' | 'symptom-form' | 'medication-form' | 'vaccination-form' | 'visit-form' | 'generic'
interface RecorderHistoryEntry { id: string; screen: RecorderScreen | 'ai'; depth: number; dietKind: DietRecordKind | null }

export function JournalRecorder({ memberId, token, selectedDay, today, initialCategory, initialDietKind, returnToSource = false, onClose, onConfirm, onSaved, onViewRecord }: {
  memberId: string; token: string; selectedDay: string; today: string; onClose: () => void
  initialCategory?: JournalCategory
  initialDietKind?: DietRecordKind
  returnToSource?: boolean
  onConfirm: (text: string, occurredAt: string, channel: QuickRecordInputChannel, photos: QuickRecordPhotoPayload, journal: JournalMetadata, daily?: DailyExtras) => Promise<string>
  onSaved?: (message: string) => void
  onViewRecord?: (eventId: string, recordId: string) => void
}) {
  const location = useLocation()
  const nurseMedicationEntry = Boolean((location.state as { nurseMedicationEntry?: boolean } | null)?.nurseMedicationEntry)
  const initialScreen = initialCategory === 'care' ? 'topical-form' : initialCategory === 'diet' ? 'diet-form' : initialCategory === 'sleep' ? 'sleep-form' : initialCategory === 'elimination' ? 'bowel-form' : initialCategory === 'visit' ? 'visit-form' : initialCategory === 'activity' ? 'activity-form' : initialCategory === 'symptom' ? 'symptom-form' : initialCategory === 'medication' || nurseMedicationEntry ? 'medication-form' : initialCategory ? 'generic' : 'categories'
  const [screen, setScreen] = useState<RecorderScreen>(initialScreen)
  const [selected, setSelected] = useState<JournalCategory[]>([])
  const [dietKind, setDietKind] = useState<DietRecordKind | null>(() => initialDietKind ?? 'feeding')
  const [sleepDraft, setSleepDraft] = useState<SleepDraft>(() => createSleepDraft())
  const [saving, setSaving] = useState(false)
  const [dailyInput, setDailyInput] = useState<DailyExtras>({})
  const [dailyReady, setDailyReady] = useState(false)
  const confirmWithDaily = async (text: string, occurredAt: string, channel: QuickRecordInputChannel, photos: QuickRecordPhotoPayload, journal: JournalMetadata) => {
    if (!dailyReady) throw new Error('每天设置尚未加载，请先重试加载。输入内容会保留。')
    return onConfirm(text, occurredAt, channel, photos, journal, dailyInput)
  }
  const withDaily = (form: ReactNode) => <DailyRecordScope.Provider value={{ memberId, token, day: selectedDay, input: dailyInput, onChange: setDailyInput, onReady: setDailyReady }}>{form}</DailyRecordScope.Provider>
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
    // Pop the recorder's own entries before the parent returns to its source.
    // Browser back and the header back then share the same exit path.
    if (returnToSource && current?.id === flowIdRef.current) {
      window.history.go(-(current.depth + 1))
      return
    }
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
    // A front-desk entry already owns a route entry; do not add a calendar stop.
    if (returnToSource) window.history.replaceState({ ...window.history.state, hooohoRecorder: initial }, '', `${location.pathname}${location.search}`)
    else window.history.pushState({ ...window.history.state, hooohoRecorder: initial }, '', `${location.pathname}${location.search}`)
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
  if (screen === 'topical-form') return withDaily(<TopicalRecordFlow memberId={memberId} token={token} selectedDay={occurrenceDay} today={today} onBack={dailyBack} onClose={closeRecorder} onConfirm={confirmWithDaily} onSaved={onSaved ?? (() => undefined)}/>)
  if (screen === 'diet-form' && dietKind) return withDaily(<DietRecordFlow kind={dietKind} memberId={memberId} selectedDay={occurrenceDay} today={today} token={token} onBack={initialCategory ? closeRecorder : () => backOneLevel('categories')} onClose={closeRecorder} onConfirm={confirmWithDaily} onSaved={onSaved ?? (() => undefined)} />)
  if (screen === 'bowel-form') return withDaily(<BowelRecordFlow memberId={memberId} selectedDay={occurrenceDay} today={today} token={token} onBack={dailyBack} onClose={closeRecorder} onConfirm={confirmWithDaily} onSaved={onSaved ?? (() => undefined)} />)
  if (screen === 'sleep-form') return withDaily(<SleepRecordFlow draft={sleepDraft} memberId={memberId} onDraftChange={setSleepDraft} onBack={sourceBack} onClose={closeRecorder} onConfirm={confirmWithDaily} onSaved={onSaved ?? (() => undefined)} />)
  if (screen === 'activity-form') return <OutdoorActivityRecordFlow memberId={memberId} selectedDay={occurrenceDay} today={today} token={token} onBack={dailyBack} onClose={closeRecorder} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'symptom-form') return <SymptomRecordFlow memberId={memberId} selectedDay={occurrenceDay} today={today} token={token} onBack={sourceBack} onClose={closeRecorder} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'medication-form') return withDaily(<MedicationRecordFlow memberId={memberId} selectedDay={occurrenceDay} today={today} token={token} onBack={sourceBack} onClose={closeRecorder} onConfirm={confirmWithDaily} onSaved={onSaved ?? (() => undefined)} />)
  if (screen === 'vaccination-form') return <VaccinationRecordFlow memberId={memberId} selectedDay={occurrenceDay} today={today} token={token} onBack={sourceBack} onClose={closeRecorder} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'visit-form') return <VisitRecordFlow memberId={memberId} selectedDay={occurrenceDay} today={today} token={token} onViewRecord={onViewRecord} onBack={sourceBack} onClose={closeRecorder} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  const dietOptions: readonly { kind: DietRecordKind; title: string; description: string }[] = [
    { kind: 'feeding', title: '喂养', description: '母乳 / 配方奶' },
    { kind: 'complementary', title: '辅食', description: '泥糊 / 颗粒' },
    { kind: 'meal', title: '正餐', description: '早餐 / 午餐 / 晚餐' },
    { kind: 'snack', title: '零食', description: '点心 / 水果 / 饮品' },
    { kind: 'supplement', title: '补剂', description: '维生素 / 矿物质 / 其他' }
  ]
  const isDietTypes = screen === 'diet-types'
  const categoryScreen = (category: JournalCategory) => category === 'care' ? 'topical-form' : category === 'diet' ? 'diet-form' : category === 'sleep' ? 'sleep-form' : category === 'elimination' ? 'bowel-form' : category === 'activity' ? 'activity-form' : category === 'symptom' ? 'symptom-form' : category === 'medication' ? 'medication-form' : category === 'vaccination' ? 'vaccination-form' : category === 'visit' ? 'visit-form' : 'generic'
  const chooseCategory = (category: JournalCategory) => {
    setSelected([category])
    navigateScreen(categoryScreen(category))
  }
  const dailyCategories: readonly { category: JournalCategory; label: string }[] = [
    { category: 'diet', label: '喂养/饮食' },
    { category: 'sleep', label: '睡眠' },
    { category: 'elimination', label: '排便' },
    { category: 'care', label: '身体涂抹' }
  ]
  const hubCategories: readonly { category: JournalCategory; label: string; action?: () => void }[] = [
    { category: 'symptom', label: '记录症状' },
    { category: 'other', label: '记录日常', action: () => navigateScreen('daily-types') },
    { category: 'visit', label: '就诊资料' },
    { category: 'medication', label: '记录用药' }
  ]
  const sheetTitle = screen === 'daily-types' ? '记录日常' : isDietTypes ? '记录喂养/饮食' : screen === 'generic' ? '记录到今天' : '记一下'
  return <div style={{ '--journal-viewport-height': `${viewport.height}px`, '--journal-keyboard-inset': `${viewport.inset}px` } as CSSProperties}><BottomSheetSurface className={`journal-recorder-sheet ${isDietTypes ? 'diet-type-sheet' : screen === 'categories' ? 'journal-category-sheet' : screen === 'daily-types' ? 'journal-daily-sheet' : ''}`} open label={sheetTitle} title={sheetTitle} onClose={() => { if (!saving) closeRecorder() }}
    leading={(screen === 'daily-types' || isDietTypes) ? <button aria-label={screen === 'daily-types' ? '返回记录入口' : '返回记录日常'} className="hoho-bottom-sheet__back" onClick={() => screen === 'daily-types' ? backOneLevel('categories') : initialCategory ? closeRecorder() : backOneLevel('daily-types')} type="button"><ArrowLeft aria-hidden="true" size={20} /></button> : undefined}
    footer={undefined}>
    {screen === 'categories' ? <div className="journal-entry-hub journal-entry-hub--illustrated">{hubCategories.map(({ category, label, action }) => <HohoButton className="journal-entry-hub__item" variant="secondary" key={label} onClick={action ?? (() => chooseCategory(category))}><JournalCategoryIcon category={category} size={32} className="journal-entry-hub__image"/><span className="journal-entry-hub__label">{label}</span></HohoButton>)}</div> : screen === 'daily-types' ? <div className="journal-entry-hub journal-entry-hub--daily journal-entry-hub--illustrated">{dailyCategories.map(({ category, label }) => <HohoButton className="journal-entry-hub__item" variant="secondary" key={category} onClick={() => chooseCategory(category)}><JournalCategoryIcon category={category} size={32} className="journal-entry-hub__image"/><span className="journal-entry-hub__label">{label}</span></HohoButton>)}</div> : isDietTypes ? <div className="diet-type-grid">{dietOptions.map(({ kind, title, description }) => <button className="diet-type-direct-entry" key={kind} onClick={() => navigateScreen('diet-form', kind)} type="button"><JournalDietIcon kind={kind} size={32}/><span><strong>{title}</strong><small>{description}</small></span></button>)}</div> :
      <QuickVoiceRecordFlow open forceManual presentation="nurse-inline" initialInputChannel="text" photoMemberId={memberId} photoToken={token}
        selectedDay={occurrenceDay} today={today}
        onActivityChange={(activity) => setSaving(activity === 'saving')}
        onClose={closeRecorder}
        onConfirm={(text, occurredAt, _candidates, channel, photos) => onConfirm(text, occurredAt, channel, photos, { categories: selected })} />}
  </BottomSheetSurface></div>
}
