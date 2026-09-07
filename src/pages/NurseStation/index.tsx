import { Bell, ChevronRight, ClipboardCheck, FileText, FolderOpen, HeartHandshake, LogIn, Pause, Play, ShieldCheck, Thermometer, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import logoUrl from '../../assets/logo.svg'
import { Avatar } from '../../components/common'
import { HohoButton } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'
import { getCurrentPath, makeMemberProfileOpenState } from '../../components/navigation/navigationState'
import { useHealthEventsList } from '../../hooks/useHealthEventsList'
import { useAppStore } from '../../store/useAppStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import type { NurseStationItem, NurseStationState } from '../../features/nurse-station/state'
import { readNurseStationState, reconcileNurseStationItems, writeNurseStationState } from '../../features/nurse-station/state'
import { NurseTriageDesk } from '../HealthEvents/NurseTriageDesk'
import { NurseNextAction } from '../HealthEvents/NurseNextAction'
import { getNurseNextActionEventId } from '../HealthEvents/nurseNextActionContext'
import '../HealthEvents/TimeView.css'
import './nurseStation.css'

const genderLabels = { male: '男', female: '女', undisclosed: '未填写', '': '未填写' } as const

export function NurseStationPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const authUser = useAppStore((value) => value.authUser)
  const currentMemberId = useAppStore((value) => value.currentMemberId)
  const cachedMembers = useAppStore((value) => value.members)
  const care = useSettingsStore((value) => value.care)
  const { state: listState } = useHealthEventsList()
  const [systemReducedMotion, setSystemReducedMotion] = useState(false)
  const identityId = authUser?.id ?? 'unknown'
  const [station, setStation] = useState<NurseStationState>(() => readNurseStationState(identityId, currentMemberId))
  const [selected, setSelected] = useState<NurseStationItem | null>(null)
  const [nextActionOpen, setNextActionOpen] = useState(false)
  const [completionOpen, setCompletionOpen] = useState(false)
  const [completionResult, setCompletionResult] = useState('已恢复')

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setSystemReducedMotion(query.matches)
    update(); query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => { setStation(readNurseStationState(identityId, currentMemberId)); setSelected(null); setNextActionOpen(false) }, [identityId, currentMemberId])
  const members = listState.status === 'success' ? listState.data.members : cachedMembers
  const member = members.find((item) => item.id === currentMemberId) ?? members[0] ?? null
  const events = listState.status === 'success' ? listState.data.events.filter((event) => event.memberId === member?.id) : []
  const nextActionEventId = getNurseNextActionEventId(events, currentMemberId)

  useEffect(() => {
    if (!member || listState.status !== 'success') return
    setStation((previous) => reconcileNurseStationItems(previous, events, member.id))
  }, [events, listState.status, member])
  useEffect(() => { if (member) writeNurseStationState(identityId, member.id, station) }, [identityId, member, station])

  const pending = station.items.filter((item) => item.status === 'pending_confirmation')
  const active = station.items.filter((item) => item.status === 'active' || item.status === 'paused')
  const reducedMotion = systemReducedMotion || (care.enabled && care.reduceMotion)
  const shouldInviteTutorial = Boolean(member && events.length === 0 && !station.tutorialSeen)
  const showLoginNotice = Boolean(authUser?.guest && events.length > 0 && (pending.length || active.length) && !station.loginNoticeDismissed)

  const updateItem = (id: string, changes: Partial<NurseStationItem>) => setStation((previous) => ({ ...previous, items: previous.items.map((item) => item.id === id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item) }))
  const closeSheet = () => { setSelected(null); setCompletionOpen(false) }
  const startObservation = (item: NurseStationItem) => { updateItem(item.id, { status: 'active', confirmedAt: new Date().toISOString() }); closeSheet() }
  const finishObservation = () => {
    if (!selected) return
    updateItem(selected.id, { status: 'completed', completedAt: new Date().toISOString(), completionResult })
    closeSheet()
  }

  if (listState.status === 'success' && listState.data.entryState.familyMemberCount === 0) return (
    <main className="app-shell nurse-station-page">
      <MainAppHeader title="前台护士站" />
      <section className="nurse-station-empty-member">
        <div className="nurse-station-empty-member__copy">
          <p className="nurse-station-empty-member__eyebrow">欢迎来到 Hoooho</p>
          <h1>把孩子零散的健康变化，<span>整理成连续记录</span></h1>
          <p className="nurse-station-empty-member__description">记下症状、用药和就医经过，<span>自动整理成时间线和问诊摘要。</span></p>
        </div>
        <div className="nurse-station-empty-member__visual">
          <NurseTriageDesk audioLevel={0} idleActive idleAnimationResetKey="first-member" reducedMotion={reducedMotion} state="idle" />
        </div>
        <ol aria-label="Hoooho 健康记录流程" className="nurse-station-empty-member__steps">
          <li><FileText aria-hidden="true" /><span>随手记录</span></li>
          <ChevronRight aria-hidden="true" className="nurse-station-empty-member__arrow" />
          <li><FolderOpen aria-hidden="true" /><span>自动整理</span></li>
          <ChevronRight aria-hidden="true" className="nurse-station-empty-member__arrow" />
          <li><ClipboardCheck aria-hidden="true" /><span>就医时带走</span></li>
        </ol>
        <HohoButton fullWidth size="large" onClick={() => navigate('/family/new', { state: { firstUseEntry: { continueToRecord: false, returnTo: '/nurse-station' } } })}>添加第一个孩子</HohoButton>
        <p className="nurse-station-empty-member__note"><ShieldCheck aria-hidden="true" />添加后即可开始记录</p>
      </section>
    </main>
  )

  return <main className="app-shell nurse-station-page">
    <MainAppHeader title="前台护士站" action={authUser?.guest ? <span className="nurse-station-auth">未登录</span> : undefined} />
    <div className="nurse-station-scroll">
      {member && <div className="nurse-station-member-row"><button className="nurse-station-member" onClick={() => { const returnTo = getCurrentPath(location.pathname, location.search, location.hash); navigate(returnTo, { replace: true, state: makeMemberProfileOpenState(member.id, returnTo, location.state as Record<string, unknown> | null, window.scrollY) }) }} type="button"><Avatar name={member.name} src={member.avatar} size="sm" /><span className="nurse-station-member-copy"><span className="nurse-station-member-name"><strong>{member.name}</strong></span><em>{genderLabels[member.gender ?? '']} · {member.age}</em></span><ChevronRight size={19} /></button><HohoButton className="journal-subject-summary" disabled={!nextActionEventId} onClick={() => setNextActionOpen(true)}><img alt="" height={20} src={logoUrl} width={20} />摘要生成</HohoButton></div>}
      <div className="nurse-station-visual"><NurseTriageDesk audioLevel={0} idleActive idleAnimationResetKey={currentMemberId} reducedMotion={reducedMotion} state={active.length ? 'reviewing' : 'idle'} /></div>
      {showLoginNotice && <aside className="nurse-station-login"><LogIn size={18} /><span>登录后可同步保存跟进与提醒</span><button onClick={() => navigate('/login')} type="button">登录</button><button onClick={() => setStation((value) => ({ ...value, loginNoticeDismissed: true }))} type="button">稍后</button></aside>}
      {active.length > 0 && <StationSection title="正在跟进" tone="mint">{active.map((item) => <ItemCard item={item} key={item.id} onOpen={() => setSelected(item)} onQuick={() => updateItem(item.id, { status: item.status === 'paused' ? 'active' : 'paused' })} />)}</StationSection>}
      {pending.length > 0 && <StationSection title="等你确认" tone="amber">{pending.map((item) => <ItemCard item={item} key={item.id} onOpen={() => setSelected(item)} onQuick={() => startObservation(item)} />)}</StationSection>}
    </div>
    <NurseNextAction currentMemberId={currentMemberId} eventId={nextActionEventId} key={`${currentMemberId}:${nextActionEventId ?? 'none'}`} onClose={() => setNextActionOpen(false)} open={nextActionOpen} />
    {shouldInviteTutorial && <div className="nurse-station-modal-layer" role="dialog" aria-modal="true" aria-labelledby="tutorial-title"><div className="nurse-station-modal"><button aria-label="关闭教程" className="sheet-close" onClick={() => setStation((value) => ({ ...value, tutorialSeen: true }))} type="button"><X /></button><HeartHandshake className="tutorial-icon" size={46} /><h2 id="tutorial-title">花1分钟认识 Hoooho</h2><p>跟着示例，完成一条喂养记录，马上了解怎么使用。</p><HohoButton fullWidth size="large" onClick={() => { setStation((value) => ({ ...value, tutorialSeen: true })); navigate('/health-events', { state: { nurseTutorial: true } }) }}>开始教程</HohoButton><button className="sheet-secondary" onClick={() => setStation((value) => ({ ...value, tutorialSeen: true }))} type="button">跳过</button></div></div>}
    {selected && <div className="nurse-station-modal-layer" role="dialog" aria-modal="true"><div className="nurse-station-sheet"><button aria-label="关闭" className="sheet-close" onClick={closeSheet} type="button"><X /></button>{completionOpen ? <><h2>结束这次观察？</h2><div className="completion-options">{['已恢复', '已经就医', '不再继续记录', '其他'].map((result) => <label key={result}><input checked={completionResult === result} name="result" onChange={() => setCompletionResult(result)} type="radio" />{result}</label>)}</div><div className="sheet-actions"><HohoButton variant="secondary" onClick={() => setCompletionOpen(false)}>取消</HohoButton><HohoButton onClick={finishObservation}>确定</HohoButton></div></> : <><Thermometer className="sheet-icon" size={24} /><h2>{selected.status === 'pending_confirmation' ? selected.title : '体温观察中'}</h2><p className="sheet-source">来自健康随记：{selected.sourceLabel}</p><div className="sheet-explanation"><strong>开启后护士站会：</strong><span>持续保留这件事</span><span>提醒补充体温变化</span><span>结束后整理观察小结</span></div>{selected.status === 'pending_confirmation' ? <><HohoButton fullWidth size="large" onClick={() => startObservation(selected)}>开始观察</HohoButton><button className="sheet-secondary" onClick={() => { updateItem(selected.id, { status: 'dismissed' }); closeSheet() }} type="button">暂时不用</button><button className="sheet-tertiary" onClick={() => { setStation((value) => ({ ...value, suppressedTypes: [...new Set([...value.suppressedTypes, selected.type])], items: value.items.map((item) => item.id === selected.id ? { ...item, status: 'dismissed' } : item) })); closeSheet() }} type="button">以后不再针对类似记录提醒</button></> : <><div className="station-actions"><button onClick={() => navigate(`/health-events/${selected.sourceEventId}`)} type="button"><Play />补充最新情况</button><button onClick={() => updateItem(selected.id, { reminder: { at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), paused: false } })} type="button"><Bell />设置提醒</button><button onClick={() => updateItem(selected.id, { status: selected.status === 'paused' ? 'active' : 'paused' })} type="button"><Pause />{selected.status === 'paused' ? '恢复提醒' : '暂停提醒'}</button><button onClick={() => setCompletionOpen(true)} type="button"><HeartHandshake />结束观察</button></div><p className="safety-note">如出现紧急情况，请及时联系专业医疗人员。</p></>}</>}</div></div>}
  </main>
}

function StationSection({ children, title, tone }: { children: React.ReactNode; title: string; tone: 'mint' | 'amber' }) { return <section className="station-section" data-tone={tone}><h2>{title}</h2><div>{children}</div></section> }
function ItemCard({ item, onOpen, onQuick }: { item: NurseStationItem; onOpen: () => void; onQuick: () => void }) { return <article className="station-item"><button className="station-item-main" onClick={onOpen} type="button"><Thermometer size={20} /><span><strong>{item.status === 'pending_confirmation' ? item.title : '体温观察中'}</strong><small>{item.status === 'pending_confirmation' ? `来自${item.sourceLabel}` : `最近记录 · ${item.sourceLabel}`}</small></span><ChevronRight size={18} /></button><button className="station-item-quick" onClick={onQuick} type="button">{item.status === 'pending_confirmation' ? '开始观察' : item.status === 'paused' ? '恢复' : '暂停'}</button></article> }
