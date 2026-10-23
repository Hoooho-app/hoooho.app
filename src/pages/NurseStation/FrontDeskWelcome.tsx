import { ArrowRight, ArrowUpRight, ChevronRight, History, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/common'
import { HealthCard, HohoButton } from '../../components/design-system'
import { ReceptionSurface } from '../../components/design-system/ReceptionSurface'
import { useHealthEventsList } from '../../hooks/useHealthEventsList'
import { NurseStationIdleVideo } from '../HealthEvents/NurseStationIdleVideo'
import { useAppStore } from '../../store/useAppStore'
import { useDailyKnowledge } from '../../features/allergy-knowledge/useDailyKnowledge'
import { useSettingsStore } from '../../store/useSettingsStore'

export function FrontDeskWelcome({ empty = false }: { empty?: boolean }) {
  const navigate = useNavigate()
  const memberId = useAppStore(s => s.currentMemberId)
  const member = useAppStore(s => s.members.find(m => m.id === memberId))
  const care = useSettingsStore(s => s.care)
  const accountId = useAppStore(s => s.authUser?.id??'')
  const knowledge = useDailyKnowledge(accountId)
  const { state, retry } = useHealthEventsList()
  const media = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true), [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)'), update = () => setReduced(query.matches)
    update(); query.addEventListener('change', update)
    const element = media.current
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    if (element) observer.observe(element)
    const hidden = () => setVisible(!document.hidden && Boolean(element && element.getBoundingClientRect().bottom > 0))
    document.addEventListener('visibilitychange', hidden)
    return () => { observer.disconnect(); query.removeEventListener('change', update); document.removeEventListener('visibilitychange', hidden) }
  }, [])
  const recent = state.status === 'success' ? state.data.events.filter(e => e.memberId === memberId).sort((a,b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0] : undefined
  return <div className="front-desk-welcome">
    <ReceptionSurface media={<div ref={media} className="front-desk-welcome__video"><NurseStationIdleVideo active={visible} reducedMotion={reduced || (care.enabled && care.reduceMotion)} /></div>} kicker={<>Hi，我是护护 <Sparkles size={14} aria-hidden="true" /></>} title={<>孩子的情况，<br />慢慢说，我来记。</>} description="记清楚，也方便交给需要的人。" />
    {empty ? <HealthCard className="front-desk-recent"><h2>从今天这一句开始</h2><p>添加孩子后，就可以随手记下症状、饮食和日常变化。</p><HohoButton fullWidth onClick={() => navigate('/family/new', { state: { firstUseEntry: { continueToRecord: false, returnTo: '/nurse-station' } } })}>添加第一个孩子</HohoButton></HealthCard> : member && <HealthCard className="front-desk-recent" aria-label={`${member.name}的近况`}>
      <header><Avatar name={member.name} src={member.avatar} size="sm" /><div><h2>{member.name}的近况</h2><p>{member.age}</p></div><HohoButton variant="text" onClick={() => navigate('/health-profile')}>看档案<ChevronRight size={16} aria-hidden="true" /></HohoButton></header>
      {state.status === 'loading' ? <p role="status">正在读取最近的记录…</p> : state.status === 'error' ? <div><p>近况暂时没有加载成功</p><HohoButton variant="text" onClick={retry}>重新加载</HohoButton></div> : recent ? <><div className="front-desk-recent__meta"><span>最近一件事</span><time dateTime={recent.occurredAt}>{new Date(recent.occurredAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</time></div><p className="front-desk-recent__summary">{recent.displayTitle || recent.title}</p><p>来自已保存的记录 · 有新变化可以接着说</p><div className="front-desk-recent__actions"><HohoButton variant="text" onClick={() => navigate(`/health-events/${encodeURIComponent(recent.id)}`)}>查看记录<ArrowUpRight size={16} aria-hidden="true" /></HohoButton><HohoButton variant="text" onClick={() => navigate('/cases')}>症状跟进<ArrowRight size={16} aria-hidden="true" /></HohoButton></div></> : <><p className="front-desk-recent__summary">从今天这一句开始</p><p>症状、喂养、睡眠和用药，都可以慢慢说。</p><HohoButton variant="text" onClick={() => navigate('/cases')}>查看症状跟进<ChevronRight size={16} aria-hidden="true" /></HohoButton></>}
    </HealthCard>}
    {!empty&&knowledge&&<HohoButton variant="text" className="front-desk-history-link" onClick={()=>navigate(`/allergy-knowledge/${knowledge.id}`,{state:{fromNurseStation:true}})}>今日过敏小知 · {knowledge.title}<ArrowUpRight size={14} aria-hidden="true" /></HohoButton>}
    {!empty && <HohoButton className="front-desk-history-link" variant="text" onClick={() => navigate('/conversation-history')}><History size={16} aria-hidden="true" />刚才聊到一半？找回对话</HohoButton>}
  </div>
}
