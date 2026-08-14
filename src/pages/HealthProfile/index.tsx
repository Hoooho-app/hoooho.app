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

const icons: Record<HealthProfileSectionConfig['icon'], LucideIcon> = {
  activity: Activity, allergy: AlertTriangle, baby: Baby, calendar: CalendarDays, care: UserRound,
  family: UsersRound, file: FileHeart, heart: HeartPulse, pill: Pill, sleep: Moon,
  stethoscope: Stethoscope, syringe: Syringe, utensils: Utensils,
}
const statusLabels: Record<HealthProfileViewStatus, string> = { all: '全部', filled: '已填写', empty: '未填写' }
const groupLabels: Partial<Record<HealthProfileSectionConfig['category'], string>> = {
  lifestyle: '生活方式', 'long-term': '健康维护', child: '儿童与成长', female: '女性健康', elder: '老年健康', core: '其他健康档案'
}
const categoryOrder: HealthProfileSectionConfig['category'][] = ['lifestyle', 'long-term', 'child', 'female', 'elder', 'core']

function getSectionSummary(section: HealthProfileSectionConfig, records: Array<Record<string, unknown>> = []) {
  if (!records.length) return section.description
  const visible = section.fields.flatMap((field) => {
    const value = records[0]?.[field.id]
    if (value == null || value === '' || value === false) return []
    return [`${field.label}：${String(value)}`]
  }).slice(0, 2)
  return visible.join(' · ') || `已记录 ${records.length} 项`
}

function ProfileSectionRows({ sections, summaries }: { sections: HealthProfileSectionConfig[]; summaries: ReadonlyMap<string, string> }) {
  const navigate = useNavigate()
  return <div className="overflow-hidden rounded-card border bg-surface">{sections.map((section) => {
    const Icon = icons[section.icon]
    return <button className="hoho-surface-row" key={section.id} onClick={() => navigate(`/health-profile/${section.id}`)} type="button">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Icon size={19} strokeWidth={1.75} /></span>
      <span className="min-w-0 flex-1 text-left"><Typography className="font-medium text-text-primary" variant="body">{section.title}</Typography><Typography className="mt-0.5 block truncate" variant="caption">{summaries.get(section.id) ?? section.description}</Typography></span>
      <ChevronRight className="shrink-0 text-text-secondary" size={18} />
    </button>
  })}</div>
}

export function HealthProfilePage() {
  const member = useCurrentMember()
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
  const grouped = useMemo(() => categoryOrder.flatMap((category) => {
    const sections = directory.remaining.filter((section) => section.category === category)
    return sections.length ? [{ category, sections }] : []
  }), [directory.remaining])
  const filtering = Boolean(query.trim()) || status !== 'all'

  return <main className="app-shell">
    <MainAppHeader title="健康档案" />
    <div className="page-content pb-10">
      <MemberIdentityCard member={member} />

      <section className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" aria-label="搜索和查看状态">
        <label className="relative min-w-0"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={18} /><span className="sr-only">搜索健康档案</span><input className="hoho-input w-full pl-10" placeholder="搜索健康档案" type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <fieldset className="grid min-w-0 grid-cols-3 gap-2 md:w-[248px]">
          <legend className="sr-only">查看状态</legend>
          {Object.entries(statusLabels).map(([value, label]) => <button
            aria-pressed={status === value}
            className="min-h-11 min-w-0 rounded-control border bg-surface px-2 text-sm text-text-secondary transition-colors aria-pressed:border-primary/40 aria-pressed:bg-primary-soft aria-pressed:font-medium aria-pressed:text-primary"
            key={value}
            onClick={() => setStatus(value as HealthProfileViewStatus)}
            type="button"
          >{label}</button>)}
        </fieldset>
      </section>

      {directory.visible.length === 0 ? <section className="py-16 text-center"><Typography variant="sectionTitle">没有找到对应档案</Typography><Typography className="mt-2" variant="caption">可以更换搜索词或查看状态</Typography></section> : <>
        {directory.priority.length > 0 && <section className="mt-5"><ProfileSectionRows sections={directory.priority} summaries={summaries} /></section>}
        {grouped.map(({ category, sections }) => <section className="mt-6 grid gap-3" key={category}><Typography variant="sectionTitle">{groupLabels[category]}</Typography><ProfileSectionRows sections={sections} summaries={summaries} /></section>)}
        {filtering && directory.remaining.length === 0 && directory.priority.length > 0 && <Typography className="mt-4 text-center" variant="caption">已显示全部匹配项目</Typography>}
      </>}
    </div>
  </main>
}
