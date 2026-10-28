import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarPlus, ClipboardCheck, Download, ExternalLink, MapPin } from '../../components/icons'
import { WebPageHeader } from '../../components/common'
import { HohoButton, HohoInput, HohoSection, StatusNotice } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { apiRequest } from '../../services/apiClient'
import { useJournal } from '../../pages/HealthEvents/useJournal'
import { mergeVaccinationSourceRows, vaccinationSourceRows, vaccineChecklistText, vaccinePrograms, vaccineReviewCalendar, vaccineUnknowns, type VaccineProfileRow, type VaccineRegion } from './vaccineProgram'
import './vaccinePlan.css'

function downloadFile(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove()
  // Give mobile browsers time to start the save/open operation.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function VaccinePlanPage() {
  const memberId = useAppStore(state => state.currentMemberId), accountId = useAppStore(state => state.authUser?.id ?? '')
  return <VaccinePlanContent key={`${accountId}:${memberId}`} memberId={memberId}/>
}

function VaccinePlanContent({ memberId }: { memberId: string }) {
  const token = useAppStore(state => state.authToken) ?? '', member = useAppStore(state => state.members.find(item => item.id === memberId))
  const [region, setRegion] = useState<VaccineRegion>('mainland'), [area, setArea] = useState(''), [revision, setRevision] = useState(0)
  const [profile, setProfile] = useState<VaccineProfileRow[] | null>(null), [profileError, setProfileError] = useState('')
  const [confirmed, setConfirmed] = useState(false), [reviewAt, setReviewAt] = useState(''), [status, setStatus] = useState(''), [actionError, setActionError] = useState('')
  const journal = useJournal(memberId, token, revision)
  useEffect(() => {
    const controller = new AbortController(); setProfile(null); setProfileError('')
    if (memberId && token) void apiRequest<{ rows: VaccineProfileRow[] }>(`/api/members/${encodeURIComponent(memberId)}/profile-list/vaccination`, { token, signal: controller.signal }).then(result => { if (!controller.signal.aborted) setProfile(result.rows) }).catch(error => { if (!controller.signal.aborted) setProfileError(error instanceof Error ? error.message : '接种档案读取失败') })
    return () => controller.abort()
  }, [memberId, token, revision])
  const rows = useMemo(() => mergeVaccinationSourceRows(profile ?? [], vaccinationSourceRows(journal.sourceEntries)), [profile, journal.sourceEntries])
  const unknowns = vaccineUnknowns(rows, 0, region)
  const program = region === 'other' ? null : vaccinePrograms[region]
  const loading = profile === null && !profileError || journal.loading
  const failure = profileError || journal.error
  const readyToExport = Boolean(member && token && profile && !loading && !failure)
  const checklist = vaccineChecklistText(member?.name ?? '当前孩子', region, area, rows, unknowns)
  const retry = () => { setRevision(value => value + 1); journal.retry() }
  function exportChecklist() { try { downloadFile(checklist, 'Hoooho-疫苗资料核对清单.txt', 'text/plain;charset=utf-8'); setStatus('核对清单已生成，请在下载或打开的文件中保存。'); setActionError('') } catch { setActionError('文件未能生成，请重试。') } }
  function exportReminder() {
    try {
      if (!confirmed) throw new Error('请先确认这是资料核对待办')
      const content = vaccineReviewCalendar(member?.name ?? '当前孩子', reviewAt, new Date(), crypto.randomUUID())
      downloadFile(content, 'Hoooho-核对疫苗接种资料.ics', 'text/calendar;charset=utf-8'); setStatus('日历文件已生成，导入手机日历后才会建立待办。'); setActionError('')
    } catch (error) { setActionError(error instanceof Error ? error.message : '日历文件未能生成，请重试。') }
  }
  return <main className="app-shell vaccine-plan-page"><WebPageHeader title="地区疫苗资料" fallback="/health-profile/vaccination"/><div className="page-content vaccine-plan-content">
    <div className="vaccine-plan-intro"><ClipboardCheck aria-hidden size={22}/><div><h2 className="hoho-text-section-title">先把接种资料核对清楚</h2><p className="hoho-text-caption">{member?.name ?? '当前孩子'} · 免费核对预览，不消耗树芽</p></div></div>
    <HohoSection title="常住地区" description="按孩子通常居住地查看官方程序参考。">
      <label className="hoho-field"><span className="hoho-text-label">国家或地区</span><select className="hoho-input" value={region} onChange={event => { setRegion(event.target.value as VaccineRegion); setStatus(''); setConfirmed(false) }}><option value="mainland">中国大陆</option><option value="hong-kong">中国香港</option><option value="other">其他地区</option></select></label>
      <HohoInput label={region === 'mainland' ? '省市（选填）' : '居住地区（选填）'} placeholder={region === 'mainland' ? '如：浙江省杭州市' : '填写常住地区'} maxLength={100} value={area} onChange={event => { setArea(event.target.value); setConfirmed(false) }}/>
      <p className="hoho-text-caption">{region === 'other' ? '该地区程序尚未维护，可免费保存原记录核对清单。' : '地方项目、居住/年龄资格与费用尚未逐地维护，不能据此判断免费或自费。'}</p>
    </HohoSection>
    <HohoSection title="已保存的原记录" action={<Link to="/health-profile/vaccination" className="hoho-text-caption">补充记录</Link>}>
      {loading && <p role="status" className="hoho-text-body">正在读取接种档案与原记录…</p>}
      {failure && <StatusNotice tone="error" title="记录读取未完成" action={<HohoButton variant="text" onClick={retry}>重试</HohoButton>}>{failure}。完整读取前不会生成核对文件。</StatusNotice>}
      {!loading && !failure && !rows.length && <p className="hoho-text-body">尚无可逐项核对的记录。这不表示孩子没有接种。</p>}
      {!loading && !failure && rows.map(row => <article className="vaccine-plan-record" key={row.id}><strong className="hoho-text-card-title">{row.name}</strong><p className="hoho-text-body">{row.date || '接种日期待核对'} · {row.dose}</p><p className="hoho-text-caption">来源：{row.source}{row.originals ? ` · ${row.originals}份原件` : ''}</p>{row.unknowns.length > 0 && <p className="hoho-text-caption">{row.unknowns.join('；')}</p>}<Link className="hoho-text-caption" to={`/health-profile/vaccination?memberId=${encodeURIComponent(memberId)}&entryId=${encodeURIComponent(row.id)}`}>查看或核对原记录</Link></article>)}
    </HohoSection>
    <HohoSection title="带到接种单位核对">
      <ul className="vaccine-plan-checklist hoho-text-body">{unknowns.map(item => <li key={item}>{item}</li>)}</ul>
      <HohoButton fullWidth variant="secondary" disabled={!readyToExport} onClick={exportChecklist}><Download aria-hidden size={18}/>保存核对清单</HohoButton>
      <p className="hoho-text-caption">下载为文本文件。不会创建接种记录，也不会自动安排下一针。</p>
    </HohoSection>
    <HohoSection title="官方程序参考" description={program ? `${program.version} · 适龄内容以官方全文为准` : '该地区资料暂未维护'}>
      {program ? <><p className="hoho-text-caption">以下年龄为官方常规程序参考，不是针对当前孩子的漏种判断或补种建议。大陆仅节选0—7岁内容，13岁HPV等见官方全文。</p><div className="vaccine-program-rows">{program.rows.map(row => <details className="vaccine-program-row" key={row.id}><summary><strong className="hoho-text-body">{row.name}</strong><span className="hoho-text-caption">{row.ages}</span></summary>{row.note && <p className="hoho-text-caption">{row.note}</p>}<p className="hoho-text-caption">请带接种记录与接种单位核对。</p></details>)}</div><a className="vaccine-plan-source hoho-text-caption" href={program.sourceUrl} target="_blank" rel="noopener noreferrer">{program.sourceTitle}<ExternalLink aria-hidden size={14}/></a><p className="hoho-text-caption">网页发布/更新：{program.publishedOn} · 本页资料核对：{program.verifiedOn}</p></> : <p className="hoho-text-body">请查阅当地卫生部门的官方程序。当前不会推断该地区的接种安排。</p>}
    </HohoSection>
    <HohoSection title="安排一次资料核对" description="自己选时间，带针卡或原件去核对。">
      <HohoInput label="核对日期和时间" type="datetime-local" value={reviewAt} onChange={event => { setReviewAt(event.target.value); setActionError('') }}/>
      <label className="vaccine-plan-confirm hoho-text-body"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>我确认这是资料核对待办，所选时间不是疫苗接种日期或预约。</span></label>
      <HohoButton fullWidth variant="secondary" disabled={!member || !token || !confirmed || !reviewAt} onClick={exportReminder}><CalendarPlus aria-hidden size={18}/>生成手机日历文件</HohoButton>
      <p className="hoho-text-caption">按当前时区（{Intl.DateTimeFormat().resolvedOptions().timeZone}）生成。需自行导入手机日历，Hoooho内不保存或发送此提醒。</p>
    </HohoSection>
    {status && <p role="status" className="hoho-text-body">{status}</p>}{actionError && <p role="alert" className="hoho-text-body">{actionError}</p>}
    <p className="vaccine-plan-footer hoho-text-caption"><MapPin aria-hidden size={16}/>本页帮助整理资料。是否接种、接种品种、剂次与时间由接种单位核对后确定。</p>
  </div></main>
}
