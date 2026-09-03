import { Check, Copy, FileImage } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import { HohoButton, ListSkeleton, StatusNotice } from '../../components/design-system'
import { createHealthProfilePromptSections } from '../../features/ask-ai'
import { getStoredHealthProfileSectionSnapshots } from '../../features/health-profile/utils/getHealthProfileSectionGroups'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { useAppStore } from '../../store/useAppStore'
import { buildConsultationSummary, type ConsultationSummary, type ConsultationSummarySourceId } from '../HealthEvents/consultationSummary'

type Range = '7d' | '30d' | 'all'

export function VisitPreparationPage() {
  const { eventId = '' } = useParams(); const currentMemberId = useAppStore((s) => s.currentMemberId); const { state, retry } = useHealthEventDetail(eventId)
  const [range, setRange] = useState<Range>('30d'); const [profile, setProfile] = useState(true); const [growth, setGrowth] = useState(true); const [files, setFiles] = useState(true); const [summary, setSummary] = useState<ConsultationSummary | null>(null); const [notice, setNotice] = useState('')
  const profileSections = useMemo(() => state.status === 'success' ? createHealthProfilePromptSections(getStoredHealthProfileSectionSnapshots(state.data.member.id)) : [], [state])
  if (state.status === 'loading') return <main className="app-shell"><WebPageHeader fallback={`/health-tracking/${eventId}`} title="就诊准备" /><ListSkeleton /></main>
  if (state.status !== 'success' || state.data.eventDto.memberId !== currentMemberId) return <main className="app-shell"><WebPageHeader fallback="/health-tracking" title="就诊准备" /><StatusNotice action={<HohoButton onClick={retry}>重试</HohoButton>} title="无法准备摘要" tone="error">请确认当前孩子和健康追踪后重试。</StatusNotice></main>
  const cutoff = range === 'all' ? 0 : Date.now() - (range === '7d' ? 7 : 30) * 86400000
  const filteredRecords = state.data.records.filter((record) => new Date(record.occurredAt).getTime() >= cutoff)
  const generate = () => {
    const context = { attachments: files ? state.data.attachments : [], currentMemberId, event: { ...state.data.viewModel.event, summary: state.data.eventDto.eventSummary?.displayedResult.summary ?? '' }, healthProfile: profile ? profileSections : [], member: state.data.member, organizations: state.data.organizations.filter((org) => filteredRecords.some((record) => record.id === org.recordId)), records: filteredRecords, relatedEvents: state.data.relatedEvents.filter((event) => new Date(event.startTime).getTime() >= cutoff) }
    const sources: ConsultationSummarySourceId[] = ['basic', 'current']
    if (profile && profileSections.length) sources.push('profile')
    if (filteredRecords.length) sources.push('raw')
    if (state.data.relatedEvents.length) sources.push('history')
    setSummary(buildConsultationSummary(context, sources)); setNotice('')
  }
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); setNotice('已复制') } catch { setNotice('复制失败，请长按选择文字') } }
  const saveImage = async () => { if (!summary) return; try { const { saveConsultationSummaryLongImage } = await import('../HealthEvents/consultationSummaryLongImage'); await saveConsultationSummaryLongImage(summary); setNotice('长图已生成') } catch { setNotice('长图生成失败，请重试') } }
  return <main className="app-shell"><WebPageHeader fallback={`/health-tracking/${eventId}`} title="就诊准备" /><div className="child-page-stack"><section className="visit-heading"><span>{state.data.member.name} · {state.data.member.age}</span><h1>生成问诊摘要</h1><p>帮助照护者把事实表达清楚，不生成诊断、处方或儿童用药建议。</p></section>{!summary ? <section className="visit-options"><label>本次需要说明的问题<input readOnly value={state.data.eventDto.title} /></label><fieldset><legend>时间范围</legend><div>{([['7d','最近7天'],['30d','最近30天'],['all','全部记录']] as const).map(([value,label]) => <button aria-pressed={range === value} data-selected={range === value} key={value} onClick={() => setRange(value)} type="button">{label}</button>)}</div></fieldset>{[['包含健康档案', profile, setProfile],['包含生长趋势', growth, setGrowth],['列出照片和检查报告', files, setFiles]].map(([label, value, setter]) => <label className="visit-check" key={String(label)}><input checked={Boolean(value)} onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)} type="checkbox" /><span>{String(label)}</span></label>)}<HohoButton fullWidth onClick={generate}>生成问诊摘要</HohoButton></section> : <section className="visit-result"><p className="visit-created"><Check />已根据当前孩子的记录生成</p><article><header><strong>Hoooho 问诊摘要</strong><span>{summary.memberName}</span></header>{summary.sections.map((section) => <section key={section.id}><h2>{section.title}</h2><ul>{section.lines.map((line) => <li key={line}>{line}</li>)}</ul></section>)}</article><div className="visit-result-actions"><HohoButton onClick={() => void saveImage()} variant="secondary"><FileImage />保存为长图</HohoButton><HohoButton onClick={() => void copy(summary.prompt)} variant="secondary"><Copy />复制提示词</HohoButton><HohoButton fullWidth onClick={() => void copy(summary.text)}>复制纯文字摘要</HohoButton></div><button className="visit-adjust" onClick={() => setSummary(null)} type="button">返回调整范围</button></section>}{growth && <p className="child-supporting-note">生长趋势只引用已有测量事实，不根据单次数据输出诊断。</p>}{notice && <p aria-live="polite" className="child-feedback">{notice}</p>}</div></main>
}
