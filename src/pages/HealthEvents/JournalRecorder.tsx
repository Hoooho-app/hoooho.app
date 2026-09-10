import { Apple, Baby, CookingPot, Pill, Utensils } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { useLocation } from 'react-router-dom'
import { BottomSheetSurface, HohoButton, Typography } from '../../components/design-system'
import type { DietRecordKind, JournalMetadata } from '../../types/journal'
import { QuickVoiceRecordFlow, type QuickRecordInputChannel } from '../HealthEventDetail/components'
import type { QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { DietRecordFlow } from './DietRecordFlow'
import { BowelRecordFlow } from './BowelRecordFlow'
import { OutdoorActivityRecordFlow } from './OutdoorActivityRecordFlow'
import { JournalCategoryIcon } from './JournalCategoryIcon'
import { createSleepDraft, SleepRecordFlow, type SleepDraft } from './SleepRecordFlow'
import { journalCategoryGroups, type JournalCategory } from './timeViewModel'
import { SymptomRecordFlow } from './SymptomRecordFlow'
import { MedicationRecordFlow } from './MedicationRecordFlow'
import { VaccinationRecordFlow } from './VaccinationRecordFlow'
import { VisitRecordFlow } from './VisitRecordFlow'

export function JournalRecorder({ mode, memberId, token, initialCategory, onClose, onConfirm, onSaved }: {
  mode: 'manual' | 'voice'; memberId: string; token: string; onClose: () => void
  initialCategory?: 'medication' | 'symptom'
  onConfirm: (text: string, occurredAt: string, channel: QuickRecordInputChannel, photos: QuickRecordPhotoPayload, journal: JournalMetadata) => Promise<string>
  onSaved?: (message: string) => void
}) {
  const location = useLocation()
  const nurseMedicationEntry = Boolean((location.state as { nurseMedicationEntry?: boolean } | null)?.nurseMedicationEntry)
  const [screen, setScreen] = useState<'categories' | 'diet-types' | 'diet-form' | 'sleep-form' | 'bowel-form' | 'activity-form' | 'symptom-form' | 'medication-form' | 'vaccination-form' | 'visit-form' | 'generic'>(initialCategory === 'symptom' ? 'symptom-form' : initialCategory === 'medication' || nurseMedicationEntry ? 'medication-form' : mode === 'voice' ? 'generic' : 'categories')
  const [selected, setSelected] = useState<JournalCategory[]>([])
  const [dietKind, setDietKind] = useState<DietRecordKind | null>(null)
  const [sleepDraft, setSleepDraft] = useState<SleepDraft>(() => createSleepDraft())
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
  if (screen === 'sleep-form') return <SleepRecordFlow draft={sleepDraft} onDraftChange={setSleepDraft} onBack={() => setScreen('categories')} onClose={onClose} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'activity-form') return <OutdoorActivityRecordFlow memberId={memberId} token={token} onBack={() => setScreen('categories')} onClose={onClose} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'symptom-form') return <SymptomRecordFlow memberId={memberId} token={token} onBack={() => setScreen('categories')} onClose={onClose} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'medication-form') return <MedicationRecordFlow memberId={memberId} token={token} onBack={() => setScreen('categories')} onClose={onClose} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'vaccination-form') return <VaccinationRecordFlow memberId={memberId} token={token} onBack={() => setScreen('categories')} onClose={onClose} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  if (screen === 'visit-form') return <VisitRecordFlow memberId={memberId} token={token} onBack={() => setScreen('categories')} onClose={onClose} onConfirm={onConfirm} onSaved={onSaved ?? (() => undefined)} />
  const dietOptions: readonly { kind: DietRecordKind; title: string; description: string; icon: typeof Baby }[] = [
    { kind: 'feeding', title: '喂养', description: '母乳 / 配方奶', icon: Baby },
    { kind: 'complementary', title: '辅食', description: '泥糊 / 颗粒 / 手指食物', icon: CookingPot },
    { kind: 'meal', title: '正餐', description: '早餐 / 午餐 / 晚餐', icon: Utensils },
    { kind: 'snack', title: '零食', description: '点心 / 水果 / 饮品', icon: Apple },
    { kind: 'supplement', title: '补剂', description: '维生素 / 矿物质 / 其他', icon: Pill }
  ]
  const isDietTypes = screen === 'diet-types'
  const unavailableCategories = new Set<JournalCategory>(['activity', 'vaccination', 'visit'])
  const chooseCategory = (category: JournalCategory) => {
    if (unavailableCategories.has(category)) {
      setSelected([])
      setAvailabilityNotice('即将开放功能')
      window.setTimeout(() => setAvailabilityNotice(''), 1800)
      return
    }
    setAvailabilityNotice('')
    setSelected([category])
    if (category === 'diet') setScreen('diet-types')
  }
  return <div style={{ '--journal-viewport-height': `${viewport.height}px`, '--journal-keyboard-inset': `${viewport.inset}px` } as CSSProperties}><BottomSheetSurface className={`journal-recorder-sheet ${isDietTypes ? 'diet-type-sheet' : screen === 'categories' ? 'journal-category-sheet' : ''}`} open label={isDietTypes ? '记录喂养/饮食' : screen === 'generic' ? '记录内容' : '记录新情况'} title={isDietTypes ? '记录喂养/饮食' : screen === 'generic' ? '记录到今天' : '记录新情况'} onClose={() => { if (!saving) onClose() }}
    footer={screen === 'categories' ? <HohoButton disabled={!selected.length} fullWidth onClick={() => setScreen(selected[0] === 'sleep' ? 'sleep-form' : selected[0] === 'elimination' ? 'bowel-form' : selected[0] === 'activity' ? 'activity-form' : selected[0] === 'symptom' ? 'symptom-form' : selected[0] === 'medication' ? 'medication-form' : selected[0] === 'vaccination' ? 'vaccination-form' : selected[0] === 'visit' ? 'visit-form' : 'generic')}>开始记录</HohoButton> : isDietTypes ? <HohoButton disabled={!dietKind} fullWidth onClick={() => setScreen('diet-form')}>开始记录</HohoButton> : undefined}>
    {screen === 'categories' ? <>{journalCategoryGroups.map((group) => <section className="journal-category-group" key={group.label} aria-label={group.label}><h3 className="hoho-text-label">{group.label}</h3><div>{group.items.map(([category, label]) => { const unavailable = unavailableCategories.has(category); return <HohoButton aria-disabled={unavailable} className={unavailable ? 'journal-category-unavailable' : ''} variant="secondary" key={category} aria-pressed={!unavailable && selected[0] === category} onClick={() => chooseCategory(category)}><JournalCategoryIcon category={category} />{label}</HohoButton> })}</div></section>)}{availabilityNotice && <div aria-live="polite" className="journal-availability-toast" role="status">{availabilityNotice}</div>}</> : isDietTypes ? <><Typography variant="caption">先记下来，之后还可以继续补充</Typography><div className="diet-type-grid">{dietOptions.map(({ kind, title, description, icon: Icon }) => <button aria-pressed={dietKind === kind} key={kind} onClick={() => setDietKind(kind)} type="button"><Icon aria-hidden="true" size={24} strokeWidth={1.7} /><span><strong>{title}</strong><small>{description}</small></span></button>)}</div></> :
      <QuickVoiceRecordFlow open presentation="nurse-inline" initialInputChannel={mode === 'voice' ? 'voice' : 'text'} photoMemberId={memberId} photoToken={token}
        onActivityChange={(activity) => setSaving(activity === 'saving')}
        onClose={onClose}
        onConfirm={(text, occurredAt, _candidates, channel, photos) => onConfirm(text, occurredAt, channel, photos, { categories: selected })} />}
  </BottomSheetSurface></div>
}
