import { ClipboardPlus, HeartPulse, Pill, Stethoscope } from 'lucide-react'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { BottomSheetSurface } from '../../components/design-system'
import type { DietRecordKind, JournalCategory } from '../../types/journal'
import { BowelRecordFlow } from './BowelRecordFlow'
import { DietRecordFlow } from './DietRecordFlow'
import { JournalCategoryIcon, JournalDietIcon } from './JournalCategoryIcon'
import { MedicationRecordFlow } from './MedicationRecordFlow'
import type { RecordBackfillTarget } from './RecordRelationSection'
import type { LinkedBackfillResult, SaveJournalRecord } from './recordFlowTypes'
import { createSleepDraft, SleepRecordFlow, type SleepDraft } from './SleepRecordFlow'
import { SymptomRecordFlow } from './SymptomRecordFlow'
import { VisitRecordFlow } from './VisitRecordFlow'

type Screen = 'entry' | 'daily' | 'diet' | 'sleep' | 'bowel' | 'symptom' | 'medication' | 'visit'
type DailyChoice = { key: string; title: string; description: string; screen: 'diet' | 'sleep' | 'bowel'; kind?: DietRecordKind; feedingMethod?: 'breast' | 'formula' | 'expressed'; icon: ReactNode }

const entryChoices = [
  { category: 'symptom' as const, title: '记录症状', description: '不舒服或身体变化', icon: <HeartPulse /> },
  { category: 'diet' as const, title: '记录日常', description: '吃、睡与排便', icon: <ClipboardPlus /> },
  { category: 'visit' as const, title: '记录就医', description: '病历、报告与处方', icon: <Stethoscope /> },
  { category: 'medication' as const, title: '记录用药', description: '药品与实际用量', icon: <Pill /> },
]

const dailyChoices: DailyChoice[] = [
  { key: 'meal', title: '饮食', description: '正餐、零食或饮品', screen: 'diet', kind: 'meal', icon: <JournalDietIcon kind="meal" /> },
  { key: 'breast', title: '母乳亲喂', description: '左右侧与时长', screen: 'diet', kind: 'feeding', feedingMethod: 'breast', icon: <JournalDietIcon kind="feeding" /> },
  { key: 'formula', title: '配方奶', description: '品牌与实际奶量', screen: 'diet', kind: 'feeding', feedingMethod: 'formula', icon: <JournalDietIcon kind="feeding" /> },
  { key: 'expressed', title: '瓶喂母乳', description: '实际奶量', screen: 'diet', kind: 'feeding', feedingMethod: 'expressed', icon: <JournalDietIcon kind="feeding" /> },
  { key: 'complementary', title: '辅食', description: '吃了什么与实际量', screen: 'diet', kind: 'complementary', icon: <JournalDietIcon kind="complementary" /> },
  { key: 'supplement', title: '营养补剂', description: '名称与实际用量', screen: 'diet', kind: 'supplement', icon: <JournalDietIcon kind="supplement" /> },
  { key: 'sleep', title: '睡眠', description: '开始与结束时间', screen: 'sleep', icon: <JournalCategoryIcon category="sleep" /> },
  { key: 'bowel', title: '排便', description: '形态与实际时间', screen: 'bowel', icon: <JournalCategoryIcon category="elimination" /> },
]

function isDietKind(value: unknown): value is DietRecordKind {
  return ['feeding', 'complementary', 'meal', 'snack', 'supplement'].includes(String(value))
}

function initialScreenFor(category: JournalCategory | undefined, voice: boolean, suggestedDietKind?: unknown): Screen {
  if (voice) return 'symptom'
  if (category === 'symptom' || category === 'medication' || category === 'visit' || category === 'sleep') return category
  if (category === 'diet') return isDietKind(suggestedDietKind) ? 'diet' : 'daily'
  if (category === 'elimination') return 'daily'
  return 'entry'
}

export function JournalRecorder({ mode, memberId, token, initialCategory, onClose, onConfirm, onSaved }: {
  mode: 'manual' | 'voice'; memberId: string; token: string; onClose: () => void
  initialCategory?: JournalCategory; suggestedMode?: 'start' | 'backfill' | 'nap'; onConfirm: SaveJournalRecord; onSaved?: (message: string) => void
}) {
  const suggestion = (() => { try { return JSON.parse(sessionStorage.getItem('hoooho:journal-suggestion') ?? 'null') as { mode?: 'start' | 'backfill' | 'nap'; day?: string; prefill?: Record<string, unknown> } | null } catch { return null } })()
  const location = useLocation()
  const nurseMedicationEntry = Boolean((location.state as { nurseMedicationEntry?: boolean } | null)?.nurseMedicationEntry)
  const suggestedDietKind = suggestion?.prefill?.kind
  const suggestedFeedingMethod = suggestion?.prefill?.feedingMethod
  const [screen, setScreen] = useState<Screen>(() => nurseMedicationEntry ? 'medication' : initialScreenFor(initialCategory, mode === 'voice', suggestedDietKind))
  const [dietKind, setDietKind] = useState<DietRecordKind>(() => isDietKind(suggestedDietKind) ? suggestedDietKind : 'meal')
  const [feedingMethod, setFeedingMethod] = useState<'breast' | 'formula' | 'expressed' | undefined>(() => ['breast', 'formula', 'expressed'].includes(String(suggestedFeedingMethod)) ? suggestedFeedingMethod as 'breast' | 'formula' | 'expressed' : undefined)
  const [nested, setNested] = useState<{ target: RecordBackfillTarget; screen: Screen } | null>(null)
  const [nestedDiet, setNestedDiet] = useState<{ kind: DietRecordKind; feedingMethod?: 'breast' | 'formula' | 'expressed' } | null>(null)
  const [linkedBackfill, setLinkedBackfill] = useState<LinkedBackfillResult>()
  const [sleepDraft, setSleepDraft] = useState<SleepDraft>(() => {
    const draft = createSleepDraft()
    if (!suggestion?.day) return { ...draft, ...(suggestion?.mode === 'nap' ? { kind: 'nap' as const } : {}) }
    const start = new Date(`${suggestion.day}T${suggestion.mode === 'nap' ? '12:30' : '20:00'}:00`)
    const end = new Date(`${suggestion.day}T${suggestion.mode === 'nap' ? '14:00' : '23:00'}:00`)
    return { ...draft, sleepAt: start.toISOString(), wakeAt: end.toISOString(), durationMinutes: Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000)), kind: suggestion.mode === 'nap' ? 'nap' : 'night' }
  })
  const [viewport, setViewport] = useState({ height: window.visualViewport?.height ?? window.innerHeight, inset: 0 })
  useEffect(() => {
    const vv = window.visualViewport
    const update = () => setViewport({ height: vv?.height ?? window.innerHeight, inset: Math.max(0, window.innerHeight - (vv?.height ?? window.innerHeight) - (vv?.offsetTop ?? 0)) })
    update(); vv?.addEventListener('resize', update); vv?.addEventListener('scroll', update)
    return () => { vv?.removeEventListener('resize', update); vv?.removeEventListener('scroll', update) }
  }, [])

  const closeRecorder = () => { sessionStorage.removeItem('hoooho:journal-suggestion'); onClose() }
  const notifySaved = onSaved ?? (() => undefined)
  const openBackfill = (target: RecordBackfillTarget) => setNested({ target, screen: target === 'daily' ? 'daily' : target })
  const closeNested = () => { setNested(null); setNestedDiet(null) }
  const nestedConfirm: SaveJournalRecord = async (content, occurredAt, channel, photos, journal) => {
    const result = await onConfirm(content, occurredAt, channel, photos, journal, { nestedBackfill: true })
    if (nested) setLinkedBackfill({ relation: nested.target, recordId: result.recordId, nonce: Date.now() })
    return result
  }
  const chooseDaily = (choice: DailyChoice, nestedMode = false) => {
    if (nestedMode) { setNestedDiet({ kind: choice.kind ?? 'meal', feedingMethod: choice.feedingMethod }); setNested((current) => current ? { ...current, screen: choice.screen } : current); return }
    setDietKind(choice.kind ?? 'meal'); setFeedingMethod(choice.feedingMethod); setScreen(choice.screen)
  }
  const renderDailyMenu = (nestedMode = false) => <BottomSheetSurface className="journal-recorder-sheet journal-daily-sheet" open label="记录日常" title="记录日常" onClose={nestedMode ? closeNested : closeRecorder}><div className="journal-daily-grid">{dailyChoices.map((choice) => <button key={choice.key} onClick={() => chooseDaily(choice, nestedMode)} type="button"><span>{choice.icon}</span><strong>{choice.title}</strong><small>{choice.description}</small></button>)}</div></BottomSheetSurface>

  const renderFlow = (value: Screen, nestedMode = false) => {
    const confirm = nestedMode ? nestedConfirm : onConfirm
    const close = nestedMode ? closeNested : closeRecorder
    const saved = nestedMode ? notifySaved : (message: string) => { notifySaved(message); closeRecorder() }
    const back = nestedMode ? () => setNested((current) => current ? { ...current, screen: current.target === 'daily' ? 'daily' : current.target } : current) : () => setScreen(value === 'diet' || value === 'sleep' || value === 'bowel' ? 'daily' : 'entry')
    const backfill = nestedMode ? () => undefined : openBackfill
    if (value === 'daily') return renderDailyMenu(nestedMode)
    if (value === 'diet') return <DietRecordFlow kind={nestedMode ? nestedDiet?.kind ?? 'meal' : dietKind} initialFeedingMethod={nestedMode ? nestedDiet?.feedingMethod : feedingMethod} linkedBackfill={nestedMode ? undefined : linkedBackfill} memberId={memberId} token={token} onBackfill={backfill} onBack={back} onClose={close} onConfirm={confirm} onSaved={saved} />
    if (value === 'bowel') return <BowelRecordFlow linkedBackfill={nestedMode ? undefined : linkedBackfill} memberId={memberId} token={token} onBackfill={backfill} onBack={back} onClose={close} onConfirm={confirm} onSaved={saved} />
    if (value === 'sleep') return <SleepRecordFlow draft={sleepDraft} linkedBackfill={nestedMode ? undefined : linkedBackfill} memberId={memberId} mode={suggestion?.mode} token={token} onBackfill={backfill} onDraftChange={setSleepDraft} onBack={back} onClose={close} onConfirm={confirm} onSaved={saved} />
    if (value === 'symptom') return <SymptomRecordFlow linkedBackfill={nestedMode ? undefined : linkedBackfill} navigateAfterSave={!nestedMode} memberId={memberId} token={token} onBackfill={backfill} onBack={back} onClose={close} onConfirm={confirm} onSaved={saved} />
    if (value === 'medication') return <MedicationRecordFlow linkedBackfill={nestedMode ? undefined : linkedBackfill} memberId={memberId} token={token} onBackfill={backfill} onBack={back} onClose={close} onConfirm={confirm} onSaved={saved} />
    if (value === 'visit') return <VisitRecordFlow memberId={memberId} token={token} onBack={back} onClose={close} onConfirm={confirm} onSaved={saved} />
    return null
  }

  if (screen !== 'entry') return <>{renderFlow(screen)}{nested ? renderFlow(nested.screen, true) : null}</>
  return <div style={{ '--journal-viewport-height': `${viewport.height}px`, '--journal-keyboard-inset': `${viewport.inset}px` } as CSSProperties}><BottomSheetSurface className="journal-recorder-sheet journal-record-entry-sheet" open label="记录新情况" title="记录新情况" onClose={closeRecorder}><div className="journal-record-entry-grid">{entryChoices.map((choice) => <button key={choice.category} onClick={() => setScreen(choice.category === 'diet' ? 'daily' : choice.category)} type="button"><span>{choice.icon}</span><strong>{choice.title}</strong><small>{choice.description}</small></button>)}</div></BottomSheetSurface></div>
}
