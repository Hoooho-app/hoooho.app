import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'
import type { DietRecordKind, JournalCategory, JournalMetadata } from '../../types/journal'
import { QuickVoiceRecordFlow, type QuickRecordInputChannel } from '../HealthEventDetail/components'
import type { QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { DietRecordFlow } from './DietRecordFlow'
import { BowelRecordFlow } from './BowelRecordFlow'
import { OutdoorActivityRecordFlow } from './OutdoorActivityRecordFlow'
import { JournalCategoryIcon, JournalDietIcon } from './JournalCategoryIcon'
import { createSleepDraft, SleepRecordFlow, type SleepDraft } from './SleepRecordFlow'
import { journalCategoryGroups } from './timeViewModel'
import { SymptomRecordFlow } from './SymptomRecordFlow'
import { MedicationRecordFlow } from './MedicationRecordFlow'
import { VaccinationRecordFlow } from './VaccinationRecordFlow'
import { VisitRecordFlow } from './VisitRecordFlow'

export function JournalRecorder({ mode, memberId, token, initialCategory, onClose, onConfirm, onSaved }: {
  mode: 'manual' | 'voice'; memberId: string; token: string; onClose: () => void
  initialCategory?: JournalCategory
  suggestedMode?: 'start' | 'backfill' | 'nap'
  onConfirm: (text: string, occurredAt: string, channel: QuickRecordInputChannel, photos: QuickRecordPhotoPayload, journal: JournalMetadata) => Promise<string>
  onSaved?: (message: string) => void
}) {
  const suggestion = (() => { try { return JSON.parse(sessionStorage.getItem('hoooho:journal-suggestion') ?? 'null') as { mode?: 'start' | 'backfill' | 'nap'; day?: string } | null } catch { return null } })()
  const closeRecorder = () => { sessionStorage.removeItem('hoooho:journal-suggestion'); onClose() }
  const location = useLocation()
  const nurseMedicationEntry = Boolean((location.state as { nurseMedicationEntry?: boolean } | null)?.nurseMedicationEntry)
  const initialScreen = initialCategory === 'diet' ? 'diet-types' : initialCategory === 'sleep' ? 'sleep-form' : initialCategory === 'activity' ? 'activity-form' : initialCategory === 'symptom' ? 'symptom-form' : initialCategory === 'medication' || nurseMedicationEntry ? 'medication-form' : initialCategory ? 'generic' : mode === 'voice' ? 'generic' : 'categories'
  const [screen, setScreen] = useState<'categories' | 'diet-types' | 'diet-form' | 'sleep-form' | 'bowel-form' | 'activity-form' | 'symptom-form' | 'medication-form' | 'vaccination-form' | 'visit-form' | 'generic'>(initialScreen)
  const [selected, setSelected] = useState<JournalCategory[]>([])
  const [dietKind, setDietKind] = useState<DietRecordKind | null>(null)
  const [sleepDraft, setSleepDraft] = useState<SleepDraft>(() => {
    const draft = createSleepDraft()
    if (!suggestion?.day) return suggestion?.mode === 'nap' ? { ...draft, kind: 'nap' } : draft
    const start = new Date(`${suggestion.day}T${suggestion.mode === 'nap' ? '12:30' : '20:00'}:00`)
    const end = new Date(`${suggestion.day}T${suggestion.mode === 'nap' ? '14:00' : '23:00'}:00`)
    return { ...draft, sleepAt: start.toISOString(), wakeAt: end.toISOString(), durationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000), kind: suggestion.mode === 'nap' ? 'nap' : 'night' }
  })
  const [saving, setSaving] = useState(false)
  const [availabilityNotice, setAvailabilityNotice] = useState('')
  const [viewport, setViewport] = useState({ height: window.visualViewport?.height ?? window.innerHeight, inset: 0 })
  useEffect(() => {
    const vv = window.visualViewport
    const update = () => setViewport({ height: vv?.height ?? window.innerHeight, inset: Math.max(0, window.innerHeight - (vv?.height ?? window.innerHeight) - (vv?.offsetTop ?? 0)) })
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    return () => { vv?.removeEventListener('resize', update); vv?.removeEventListener('scroll', update) }
  }, [])
  if (screen === 'diet-form' && dietKind) return <DietRecordFlow kind={dietKind} memberId={memberId} token={token} onBack={() => setScreen('diet-types')} onClose={onClose} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'bowel-form') return <BowelRecordFlow memberId={memberId} token={token} onBack={() => setScreen('categories')} onClose={onClose} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'sleep-form') return <SleepRecordFlow draft={sleepDraft} mode={suggestion?.mode} memberId={memberId} onDraftChange={setSleepDraft} onBack={() => setScreen('categories')} onClose={closeRecorder} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'activity-form') return <OutdoorActivityRecordFlow memberId={memberId} token={token} onBack={() => setScreen('categories')} onClose={onClose} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'symptom-form') return <SymptomRecordFlow memberId={memberId} token={token} onBack={() => setScreen('categories')} onClose={onClose} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'medication-form') return <MedicationRecordFlow memberId={memberId} token={token} onBack={() => setScreen('categories')} onClose={onClose} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'vaccination-form') return <VaccinationRecordFlow memberId={memberId} token={token} onBack={() => setScreen('categories')} onClose={onClose} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'visit-form') return <VisitRecordFlow memberId={memberId} token={token} onBack={() => setScreen('categories')} onClose={onClose} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  const dietOptions: readonly { kind: DietRecordKind; title: string; description: string; icon: ReactNode }[] = [
    { kind: 'feeding', title: '喂养', description: '母乳 / 配方奶', icon: <JournalDietIcon kind="feeding" size={24} strokeWidth={1.7} /> },
    { kind: 'complementary', title: '辅食', description: '泥糊 / 颗粒', icon: <JournalDietIcon kind="complementary" size={24} strokeWidth={1.7} /> },
    { kind: 'meal', title: '正餐', description: '早餐 / 午餐 / 晚餐', icon: <JournalDietIcon kind="meal" size={24} strokeWidth={1.7} /> },
    { kind: 'snack', title: '零食', description: '点心 / 水果 / 饮品', icon: <JournalDietIcon kind="snack" size={24} strokeWidth={1.7} /> },
    { kind: 'supplement', title: '补剂', description: '维生素 / 矿物质 / 其他', icon: <JournalDietIcon kind="supplement" size={24} strokeWidth={1.7} /> }
  ]
  const isDietTypes = screen === 'diet-types'
  const unavailableCategories = new Set<JournalCategory>(['vaccination', 'visit'])
  const categoryScreen = (category: JournalCategory) => category === 'diet' ? 'diet-types' : category === 'sleep' ? 'sleep-form' : category === 'elimination' ? 'bowel-form' : category === 'activity' ? 'activity-form' : category === 'symptom' ? 'symptom-form' : category === 'medication' ? 'medication-form' : category === 'vaccination' ? 'vaccination-form' : category === 'visit' ? 'visit-form' : 'generic'
  const chooseCategory = (category: JournalCategory) => {
    if (unavailableCategories.has(category)) {
      setSelected([])
      setAvailabilityNotice('即将开放功能')
      window.setTimeout(() => setAvailabilityNotice(''), 1800)
      return
    }
    setAvailabilityNotice('')
    setSelected([category])
    setScreen(categoryScreen(category))
  }
  return <div style={{ '--journal-viewport-height': `${viewport.height}px`, '--journal-keyboard-inset': `${viewport.inset}px` } as CSSProperties}><BottomSheetSurface className={`journal-recorder-sheet ${isDietTypes ? 'diet-type-sheet' : screen === 'categories' ? 'journal-category-sheet' : ''}`} open label={isDietTypes ? '记录喂养/饮食' : screen === 'generic' ? '记录内容' : '记一下'} title={isDietTypes ? '记录喂养/饮食' : screen === 'generic' ? '记录到今天' : '记一下'} onClose={() => { if (!saving) closeRecorder() }}
    footer={undefined}>
    {screen === 'categories' ? <>{journalCategoryGroups.map((group) => <section className="journal-category-group" key={group.label} aria-label={group.label}><h3 className="hoho-text-label">{group.label}</h3><div>{group.items.map(([category, label]) => { const unavailable = unavailableCategories.has(category); return <HohoButton aria-disabled={unavailable} className={`journal-category-direct-entry${unavailable ? ' journal-category-unavailable' : ''}`} variant="secondary" key={category} onClick={() => chooseCategory(category)}><JournalCategoryIcon category={category} />{label}</HohoButton> })}</div></section>)}{availabilityNotice && <div aria-live="polite" className="journal-availability-toast" role="status">{availabilityNotice}</div>}</> : isDietTypes ? <div className="diet-type-grid">{dietOptions.map(({ kind, title, description, icon }) => <button className="diet-type-direct-entry" key={kind} onClick={() => { setDietKind(kind); setScreen('diet-form') }} type="button">{icon}<span><strong>{title}</strong><small>{description}</small></span></button>)}</div> :
      <QuickVoiceRecordFlow open presentation="nurse-inline" initialInputChannel={mode === 'voice' ? 'voice' : 'text'} photoMemberId={memberId} photoToken={token}
        onActivityChange={(activity) => setSaving(activity === 'saving')}
        onClose={onClose}
        onConfirm={(text, occurredAt, _candidates, channel, photos) => onConfirm(text, occurredAt, channel, photos, { categories: selected })} />}
  </BottomSheetSurface></div>
}
