import { ChevronRight, HeartPulse, Scissors, ShieldPlus, Syringe, Upload, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HealthRecordSubjectHeader } from '../../components/health'
import { MainAppHeader } from '../../components/navigation'
import { readAllergyArchive, allergyGroup } from '../../features/health-profile/utils/allergyProfile'
import { loadProfileSections, readProfileSection } from '../../services/profileSectionStorage'
import { useAppStore } from '../../store/useAppStore'
import './healthProfileHome.css'

const entries = [
  { id: 'allergy', title: '过敏史', icon: ShieldPlus },
  { id: 'chronic', title: '慢性病史', icon: HeartPulse },
  { id: 'family-history', title: '家族史', icon: UsersRound },
  { id: 'surgery', title: '手术史', icon: Scissors },
  { id: 'vaccination', title: '疫苗接种记录', icon: Syringe }
]

export function HealthProfilePage() {
  const navigate = useNavigate()
  const { authToken: token, currentMemberId, members, authUser } = useAppStore()
  const member = members.find(item => item.id === currentMemberId) ?? null
  const [summary, setSummary] = useState({ memberId: '', text: '正在加载…' })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setSummary({ memberId: currentMemberId, text: '正在加载…' })
    if (token && member) void loadProfileSections(token, members, controller.signal).then(() => {
      if (controller.signal.aborted) return
      const archive = readAllergyArchive(readProfileSection(`hoho-health-profile:${currentMemberId}:allergy`), currentMemberId, authUser?.id ?? '')
      const pending = archive.items.filter(item => allergyGroup(item) === 'investigating').length
      const confirmed = archive.items.filter(item => allergyGroup(item) === 'confirmed').length
      setSummary({ memberId: currentMemberId, text: `待排查 ${pending} · 已明确 ${confirmed}` })
    }).catch(() => { if (!controller.signal.aborted) setSummary({ memberId: currentMemberId, text: '数量暂不可用，点击查看' }) })
    return () => controller.abort()
  }, [token, currentMemberId, members, authUser?.id, retry])

  return <main className="app-shell health-profile-overview"><MainAppHeader compact title="健康档案" /><div className="page-content health-profile-home">
    <HealthRecordSubjectHeader className="health-profile-record-subject" member={member} onSummary={() => navigate('/visit-summary')} />
    <nav className="health-profile-entries" aria-label="档案分类">{entries.map(({ id, title, icon: Icon }) => <button className="health-profile-entry" disabled={!member} key={id} onClick={() => navigate(`/health-profile/${id}`)} type="button">
      <span className="health-profile-entry__icon"><Icon aria-hidden="true" size={22} strokeWidth={1.7} /></span>
      <span className="health-profile-entry__text"><strong>{title}</strong><small>{id === 'allergy' ? summary.memberId === currentMemberId ? summary.text : '正在加载…' : '查看与补充'}</small></span><ChevronRight aria-hidden="true" size={19} strokeWidth={1.6} />
    </button>)}</nav>
    {summary.text.startsWith('数量暂不可用') && <button className="health-profile-summary-retry" onClick={() => setRetry(value => value + 1)} type="button">重试加载数量</button>}
    <button className="health-profile-smart-record" disabled={!member || !token} onClick={() => navigate('/health-profile/smart-record')} type="button"><span><strong>智能整理与记录</strong><small>上传报告、病历、体检报告、<br />自动整理到各项档案</small></span><Upload aria-hidden="true" size={24} strokeWidth={1.6} /></button>
  </div></main>
}
