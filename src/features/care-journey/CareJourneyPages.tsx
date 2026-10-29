import type { ComponentType, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Award, Check, ChevronRight, LockKeyhole } from '../../components/icons'
import { WebPageHeader } from '../../components/common/WebPageHeader'
import { HohoButton, HohoProgress, HohoSection, HohoSurfaceRow, StatusNotice } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import sproutArt from '../../assets/care-journey/two-leaf-sprout-20261030.webp'
import { careApi, type CareDashboard } from './api'
import { useCareJourney } from './useCareJourney'
import { CareMedalArt } from './CareIllustrations'
import './careJourney.css'

type CareState = ReturnType<typeof useCareJourney>
function Frame({ title, children, state }: { title: string; children: ReactNode; state: CareState }) {
  const navigate = useNavigate()
  return <main className="app-shell care-journey-page">
    <WebPageHeader title={title} onBack={() => navigate(title === '呵护之旅' ? '/nurse-station' : '/care-journey')}/>
    <div className="care-journey-content">
      {state.loading && !state.data && <StatusNotice title="正在读取"/>}
      {state.error && <StatusNotice tone="error" title={state.error} action={<HohoButton size="small" variant="text" disabled={Boolean(state.busy)} onClick={() => void state.refresh()}>重试</HohoButton>}/>}
      {state.data && children}
    </div>
  </main>
}
function Growth({ data, link = true }: { data: CareDashboard; link?: boolean }) {
  const navigate = useNavigate()
  return <section className="care-journey-growth" aria-label="树芽成长">
    <div className="care-journey-garden">
      <div className="care-journey-stack">
        <span className="hoho-text-caption">累计树芽</span>
        <strong className="hoho-text-display">{data.lifetime}</strong>
        {link ? <button type="button" className="care-journey-level" onClick={() => navigate('/care-journey/growth')}><span className="hoho-text-card-title">Lv.{data.level.value} {data.level.name}</span><ChevronRight size={16}/></button> : <span className="hoho-text-card-title">Lv.{data.level.value} {data.level.name}</span>}
      </div>
      <img className="care-journey-garden-art" src={sproutArt} width={124} height={124} alt="两片嫩叶的3D小树芽"/>
    </div>
    {data.level.nextThreshold ? <><HohoProgress value={data.lifetime - data.level.threshold} max={data.level.nextThreshold - data.level.threshold} label="成长进度"/><p className="hoho-text-caption">{data.lifetime} / {data.level.nextThreshold} 树芽</p></> : <p className="hoho-text-caption">Lv.{data.level.value} · 已满级</p>}
  </section>
}
function CareJourneySession() {
  const state = useCareJourney(), navigate = useNavigate(), data = state.data
  return <Frame title="呵护之旅" state={state}>{data && <>
    <Growth data={data}/>
    <section className="care-journey-check-in" aria-label="今日签到">
      <div><h2 className="hoho-text-section-title">今日领取</h2><p className="hoho-text-caption">{data.today.date} · +1 树芽</p></div>
      <HohoButton size="small" disabled={data.today.checkedIn || Boolean(state.busy)} loading={state.busy === 'check-in'} onClick={() => void state.mutate('check-in', careApi.checkIn)}>{data.today.checkedIn ? '今日已领取' : state.error ? '重试领取' : '领取树芽'}</HohoButton>
    </section>
    <div className="settings-list"><HohoSurfaceRow leading={<Award size={22}/>} title="我的成就" value={`${data.achievements.filter(item => item.achievedAt).length} / ${data.achievements.length}`} onActivate={() => navigate('/care-journey/achievements')}/></div>
  </>}</Frame>
}
const levels = [{ value: 1, name: '相伴', threshold: 0 }, { value: 2, name: '同行', threshold: 20 }, { value: 3, name: '累积', threshold: 60 }, { value: 4, name: '增长', threshold: 150 }, { value: 5, name: '守望', threshold: 300 }]
function CareGrowthSession() {
  const state = useCareJourney(), data = state.data
  return <Frame title="成长等级" state={state}>{data && <>
    <Growth data={data} link={false}/>
    <HohoSection title="等级"><div className="settings-list">{levels.map(level => <HohoSurfaceRow key={level.value} leading={level.value <= data.level.value ? <Check size={20}/> : <LockKeyhole size={19}/>} title={`Lv.${level.value} ${level.name}`} value={`${level.threshold} 树芽`}/>)}</div></HohoSection>
  </>}</Frame>
}
function CareAchievementsSession() {
  const state = useCareJourney(), data = state.data
  return <Frame title="我的成就" state={state}>{data && <div className="care-journey-medals">{data.achievements.map((item, index) => <article className="care-journey-medal" key={item.id}>
    <CareMedalArt kind={index % 4} active={Boolean(item.achievedAt)}/>
    <h2 className="hoho-text-card-title">{item.title}</h2>
    <p className="hoho-text-caption">{item.description}</p>
    <span className="hoho-text-caption">{item.achievedAt ? '已点亮' : `${Math.min(item.progress, item.target)} / ${item.target}`}</span>
    {!item.achievedAt && <HohoProgress value={item.progress} max={item.target} label={`${item.title}达成进度`}/>}
  </article>)}</div>}</Frame>
}
function ScopedCare({ component: Page }: { component: ComponentType }) {
  const key = useAppStore(state => `${state.authUser?.id ?? ''}:${state.currentMemberId}`)
  return <Page key={key}/>
}
export function CareJourneyPage() { return <ScopedCare component={CareJourneySession}/> }
export function CareGrowthPage() { return <ScopedCare component={CareGrowthSession}/> }
export function CareAchievementsPage() { return <ScopedCare component={CareAchievementsSession}/> }
