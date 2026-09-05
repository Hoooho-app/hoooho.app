import { Apple, Baby, CookingPot, Utensils } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { BottomSheetSurface, HohoButton, Typography } from '../../components/design-system'
import type { DietRecordKind, JournalMetadata } from '../../types/journal'
import { QuickVoiceRecordFlow, type QuickRecordInputChannel } from '../HealthEventDetail/components'
import type { QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { DietRecordFlow } from './DietRecordFlow'
import { JournalCategoryIcon } from './JournalCategoryIcon'
import { journalCategoryGroups, type JournalCategory } from './timeViewModel'

export function JournalRecorder({ mode, memberId, token, onClose, onConfirm, onSaved }: {
  mode: 'manual' | 'voice'; memberId: string; token: string; onClose: () => void
  onConfirm: (text: string, occurredAt: string, channel: QuickRecordInputChannel, photos: QuickRecordPhotoPayload, journal: JournalMetadata) => Promise<string>
  onSaved?: (message: string) => void
}) {
  const [screen, setScreen] = useState<'categories' | 'diet-types' | 'diet-form' | 'generic'>(mode === 'voice' ? 'generic' : 'categories')
  const [selected, setSelected] = useState<JournalCategory[]>([])
  const [dietKind, setDietKind] = useState<DietRecordKind | null>(null)
  const [saving, setSaving] = useState(false)
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
  const dietOptions: readonly { kind: DietRecordKind; title: string; description: string; icon: typeof Baby }[] = [
    { kind: 'feeding', title: '喂养', description: '母乳 / 配方奶', icon: Baby },
    { kind: 'complementary', title: '辅食', description: '泥糊 / 颗粒 / 手指食物', icon: CookingPot },
    { kind: 'meal', title: '正餐', description: '早餐 / 午餐 / 晚餐', icon: Utensils },
    { kind: 'snack', title: '零食', description: '点心 / 水果 / 饮品', icon: Apple }
  ]
  const isDietTypes = screen === 'diet-types'
  return <div style={{ '--journal-viewport-height': `${viewport.height}px`, '--journal-keyboard-inset': `${viewport.inset}px` } as CSSProperties}><BottomSheetSurface className={`journal-recorder-sheet ${isDietTypes ? 'diet-type-sheet' : ''}`} open label={isDietTypes ? '记录喂养/饮食' : screen === 'generic' ? '记录内容' : '分类提醒板'} title={isDietTypes ? '记录喂养/饮食' : screen === 'generic' ? '记录到今天' : '记下新情况'} onClose={() => { if (!saving) onClose() }}
    footer={screen === 'categories' ? <HohoButton fullWidth onClick={() => setScreen('generic')}>开始记录</HohoButton> : isDietTypes ? <HohoButton disabled={!dietKind} fullWidth onClick={() => setScreen('diet-form')}>开始记录</HohoButton> : undefined}>
    {screen === 'categories' ? <><Typography variant="caption">先记下来，不用一次性记完，想到时继续补充</Typography>{journalCategoryGroups.map((group) => <section className="journal-category-group" key={group.label} aria-label={group.label}><h3 className="hoho-text-label">{group.label}</h3><div>{group.items.map(([category, label]) => <HohoButton variant="secondary" key={category} aria-pressed={selected[0] === category} onClick={() => { setSelected([category]); if (category === 'diet') setScreen('diet-types') }}><JournalCategoryIcon category={category} />{label}</HohoButton>)}</div></section>)}</> : isDietTypes ? <><Typography variant="caption">先记下来，之后还可以继续补充</Typography><div className="diet-type-grid">{dietOptions.map(({ kind, title, description, icon: Icon }) => <button aria-pressed={dietKind === kind} key={kind} onClick={() => setDietKind(kind)} type="button"><Icon aria-hidden="true" size={24} strokeWidth={1.7} /><span><strong>{title}</strong><small>{description}</small></span></button>)}</div></> :
      <QuickVoiceRecordFlow open presentation="nurse-inline" initialInputChannel={mode === 'voice' ? 'voice' : 'text'} photoMemberId={memberId} photoToken={token}
        onActivityChange={(activity) => setSaving(activity === 'saving')}
        onClose={onClose}
        onConfirm={(text, occurredAt, _candidates, channel, photos) => onConfirm(text, occurredAt, channel, photos, { categories: selected })} />}
  </BottomSheetSurface></div>
}
