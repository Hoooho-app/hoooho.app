import { Activity, AlertTriangle, Baby, CalendarDays, ChevronRight, FileHeart, HeartPulse, Moon, Pill, Search, Stethoscope, Syringe, UserRound, UsersRound, Utensils, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { Typography } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'
import { MemberIdentityCard } from '../../components/health'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { healthProfileSections, type HealthProfileSectionConfig } from '../../features/health-profile/config/healthProfileSections'
import { healthProfilePriorities } from '../../features/health-profile/config/healthProfileTemplates'
import { getHealthProfileType } from '../../features/health-profile/utils/getHealthProfileProfile'
import { getStoredHealthProfileSectionSnapshots } from '../../features/health-profile/utils/getHealthProfileSectionGroups'
import { buildPersonalizedHealthDirectory, type HealthProfileViewStatus } from '../../features/health-profile/utils/healthProfileHomeLogic'
import { hasBasicHealthProfileValues } from '../../features/health-profile/utils/healthProfileBasicInfo'
import { useHealthProfileFacts } from '../../features/health-profile/hooks/useHealthProfileFacts'

const icons: Record<HealthProfileSectionConfig['icon'], LucideIcon> = {
  activity: Activity, allergy: AlertTriangle, baby: Baby, calendar: CalendarDays, care: UserRound,
  family: UsersRound, file: FileHeart, heart: HeartPulse, pill: Pill, sleep: Moon,
  stethoscope: Stethoscope, syringe: Syringe, utensils: Utensils,
}
const statusLabels: Record<HealthProfileViewStatus, string> = { all: '全部', filled: '已填写', empty: '未填写' }
const groupLabels: Partial<Record<HealthProfileSectionConfig['category'], string>> = {
  'long-term': '长期健康背景', child: '出生与成长', core: '需要长期保留'
}
const categoryOrder: HealthProfileSectionConfig['category'][] = ['child', 'long-term', 'core']

function getSectionSummary(section: HealthProfileSectionConfig, records: Array<Record<string, unknown>> = []) {
  if (!records.length) return section.description
  const visible = section.fields.flatMap((field) => {
    const value = records[0]?.[field.id]
    if (value == null || value === '' || value === false) return []
    return [`${field.label}：${String(value)}`]
  }).slice(0, 2)
  return visible.join(' · ') || `已记录 ${records.length} 项`
}

function ProfileSectionRows({ recordedIds, sections, summaries }: { recordedIds: ReadonlySet<string>; sections: HealthProfileSectionConfig[]; summaries: ReadonlyMap<string, string> }) {
  const navigate = useNavigate()
  return <div className="profile-directory-group">{sections.map((section) => {
    const Icon = icons[section.icon]
    return <button className="hoho-surface-row" key={section.id} onClick={() => navigate(`/health-profile/${section.id}`)} type="button">
      <span className="profile-directory-icon"><Icon size={19} strokeWidth={1.75} /></span>
      <span className="min-w-0 flex-1 text-left"><Typography className="font-medium text-text-primary" variant="body">{section.title}</Typography><Typography className="mt-0.5 block truncate" variant="caption">{summaries.get(section.id) ?? section.description}</Typography></span>
      <span className="profile-directory-status" data-filled={recordedIds.has(section.id)}>{recordedIds.has(section.id) ? '已填写' : '待补充'}</span>
      <ChevronRight className="shrink-0 text-text-secondary" size={18} />
    </button>
  })}</div>
}

export function HealthProfilePage() {
  const member = useCurrentMember()
  const navigate = useNavigate()
  const longTermFacts = useHealthProfileFacts(member.id)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<HealthProfileViewStatus>('all')
  const profileType = getHealthProfileType(member.birthday, member.gender)
  const hasBasicValues = hasBasicHealthProfileValues(member)
  const stored = useMemo(() => getStoredHealthProfileSectionSnapshots(member.id), [member.id])
  const recordsBySection = useMemo(() => new Map(stored.map(({ id, records }) => [id, records])), [stored])
  const summaries = useMemo(() => new Map(healthProfileSections.map((section) => (
    [section.id, getSectionSummary(section, recordsBySection.get(section.id))]
  ))), [recordsBySection])
  const recordedIds = useMemo(() => {
    const ids = new Set(stored.map(({ id }) => id))
    if (hasBasicValues) ids.add('basic')
    return ids
  }, [hasBasicValues, stored])
  const directory = useMemo(() => buildPersonalizedHealthDirectory(
    healthProfileSections,
    profileType,
    healthProfilePriorities[profileType],
    recordedIds,
    query,
    status
  ), [profileType, query, recordedIds, status])
  const quickSections = useMemo(() => directory.priority.filter((section) => !recordedIds.has(section.id)).slice(0, 3), [directory.priority, recordedIds])
  const directorySections = useMemo(() => {
    const quickIds = new Set(quickSections.map(({ id }) => id))
    return [...directory.priority.filter(({ id }) => !quickIds.has(id)), ...directory.remaining]
  }, [directory.priority, directory.remaining, quickSections])
  const grouped = useMemo(() => categoryOrder.flatMap((category) => {
    const sections = directorySections.filter((section) => section.category === category)
    return sections.length ? [{ category, sections }] : []
  }), [directorySections])
  const filtering = Boolean(query.trim()) || status !== 'all'

  return <main className="app-shell">
    <MainAppHeader title="健康档案" />
    <div className="page-content pb-10">
      <MemberIdentityCard member={member} />
      <p className="child-profile-note">这里维护孩子相对稳定的健康背景。每次症状、饮食、测量和用药变化请记入健康随记。</p>

      <section className="health-profile-search grid grid-cols-[minmax(0,1fr)_104px] items-center gap-2" aria-label="搜索和查看状态">
        <label className="relative min-w-0"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={18} /><span className="sr-only">搜索健康档案</span><input className="hoho-input w-full pl-10" placeholder="搜索健康档案" type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <label className="min-w-0">
          <span className="sr-only">查看状态</span>
          <select
            aria-label="查看状态"
            className="hoho-select h-11 min-h-11 w-full px-3 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as HealthProfileViewStatus)}
          >
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </section>

      <section className="health-fact-home-card mt-5" aria-label="医生确认与待确认信息">
        <button onClick={() => navigate('/health-profile/facts')} type="button">
          <span className="health-fact-home-card__icon"><FileHeart size={21} /></span>
          <span className="min-w-0 flex-1 text-left"><Typography variant="cardTitle">医生确认与待确认信息</Typography><Typography className="mt-1" variant="caption">清楚区分已确认结论和系统整理线索</Typography></span>
          <span className="health-fact-home-card__count">{longTermFacts.status === 'success' ? `${longTermFacts.facts.filter((fact) => fact.status !== 'removed').length} 条` : '—'}</span>
          <ChevronRight size={18} />
        </button>
        {longTermFacts.status === 'success' && longTermFacts.candidates.length > 0 && <button className="health-fact-home-card__inbox" onClick={() => navigate('/health-profile/facts')} type="button"><span>发现 {longTermFacts.candidates.length} 条可长期保留的信息</span><span>需要你确认</span></button>}
        {longTermFacts.status === 'success' && longTermFacts.facts.length === 0 && longTermFacts.candidates.length === 0 && <Typography className="health-fact-home-card__empty" variant="caption">暂无重要健康事实；健康随记中的重要信息确认后会显示在这里</Typography>}
      </section>

      {directory.visible.length === 0 ? <section className="py-16 text-center"><Typography variant="sectionTitle">没有找到对应档案</Typography><Typography className="mt-2" variant="caption">可以更换搜索词或查看状态</Typography></section> : <>
        {quickSections.length > 0 && <section className="mt-5 grid gap-3" aria-label="建议优先补充"><Typography variant="sectionTitle">建议优先补充</Typography><ProfileSectionRows recordedIds={recordedIds} sections={quickSections} summaries={summaries} /></section>}
        {grouped.map(({ category, sections }) => <section className="mt-6 grid gap-3" key={category}><Typography variant="sectionTitle">{groupLabels[category]}</Typography><ProfileSectionRows recordedIds={recordedIds} sections={sections} summaries={summaries} /></section>)}
        {filtering && directory.remaining.length === 0 && directory.priority.length > 0 && <Typography className="mt-4 text-center" variant="caption">已显示全部匹配项目</Typography>}
      </>}
    </div>
  </main>
}
