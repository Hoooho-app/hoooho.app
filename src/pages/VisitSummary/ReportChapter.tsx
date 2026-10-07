import { MapPin } from 'lucide-react'
import { ReadOnlyMedicationReminderCard } from '../NurseStation/MedicationReminderCard'
import type { ReactNode } from 'react'
import { healthProfileSections } from '../../features/health-profile/config/healthProfileSections'
import {
  FactDistribution,
  FactLineChart,
} from '../../components/design-system/FactCharts'
import type {
  VisitChapter,
  VisitSheet,
  VisitSource,
} from '../../types/visitSheet'

export const reportTime = (value: string | null, timeZone = 'Asia/Shanghai') =>
  !value || Number.isNaN(Date.parse(value))
    ? '未提供'
    : new Intl.DateTimeFormat('zh-CN', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        ...(value.length > 10 ? { hour: '2-digit', minute: '2-digit' } : {}),
      }).format(new Date(value))
const profileCategoryLabels=Object.fromEntries(healthProfileSections.map(s=>[s.id,s.title]))
export const sourceCategoryLabel=(category:string)=>({record:'健康记录',course:'症状记录',temperature:'体温',allergy:'过敏资料',history:'既往',visits:'就诊检查',attachment:'附件原件',profile:'健康档案',fact:'健康事实',growth:'成长测量',daily:'日常记录',basic:'基本资料',diet:'饮食档案',sleep:'睡眠档案',exercise:'运动档案',sources:'待核对资料',medication:'用药执行','medication-plan':'用药计划','observation-plan':'观察计划',observation:'饮食观察',birth:'出生史',chronic:'长期问题',surgery:'手术史','family-history':'家族史',feeding:'喂养',examination:'检查',hospitalization:'住院',vaccination:'接种',legacy:'历史情况单'}[category]||profileCategoryLabels[category]||'补充健康资料')
export function Emphasized({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\d+(?:\.\d+)?)/g).map((part, i) =>
        /^\d/.test(part) ? (
          <strong className="visit-number" key={i}>
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  )
}
export function SourceText({ source }: { source: VisitSource }) {
  return (
    <>
      <h3>{source.title}</h3>
      <p className="visit-muted">
        {source.identity} · 发生：{reportTime(source.timePrecision==='unknown'?null:source.timePrecision==='day'||source.timePrecision==='period'?source.occurredAt?.slice(0,10)??null:source.occurredAt)}{source.timePrecision && source.timePrecision!=='exact' ? `（原记录精度：${source.timePrecision==='day'?'日期':source.timePrecision==='period'?'时段，详见原文':'未知'}）` : ''}
        <br />
        录入：{reportTime(source.createdAt)}
      </p>
      <p className="visit-original">{source.text}</p>
      {source.nurseConversation?.length ? <details><summary>智能记录对话原文（只读）</summary>{source.nurseConversation.map(turn => <p key={turn.id}><strong>{turn.role === 'user' ? '家长' : 'AI 护士'}{turn.status === 'interrupted' ? '（已打断）' : ''}：</strong>{turn.text}</p>)}</details> : null}
      <small>来源编号：{source.code ?? '原始记录'}</small>
    </>
  )
}
export function ReportChapter({
  chapter,
  report,
  onEvidence,
  readOnly = false,
  leading,
  trailing,
  action,
}: {
  chapter: VisitChapter
  report: VisitSheet
  onEvidence?: (ids: string[]) => void
  readOnly?: boolean
  leading?: ReactNode
  trailing?: ReactNode
  action?: ReactNode
}) {
  return (
    <section
      id={chapter.title ? `chapter-${chapter.id}` : undefined}
      className={`visit-chapter visit-chapter--${chapter.id}`}
    >
      {chapter.title && <div className="visit-section-actions"><h2 className="visit-chapter-title"><span aria-hidden="true" className="visit-chapter-ordinal">
        {String(
          report.chapters.findIndex((s) => s.id === chapter.id) + 1,
        ).padStart(2, '0')}{' '}
        / </span>{chapter.title}</h2>{action}</div>}
      {leading}
      {chapter.id!=='overview'&&<div className={`visit-chapter-overview${chapter.id==='course'?' visit-course-nodes':''}`} data-chapter-overview={chapter.id}>{chapter.overview?.items.map((item,i)=><article key={i}><h3>{item.title}</h3><p>{item.detail}</p>{item.sourceIds.length>0&&(readOnly?item.sourceIds.map(id=><a key={id} href={`#${id}`}>[{report.sources.find(s=>s.id===id)?.code}]</a>):<button className="visit-text-action" onClick={()=>onEvidence?.(item.sourceIds)}>查看依据</button>)}</article>)}</div>}
      {chapter.overview?.lines.map((line,i)=><p className="visit-muted" key={i}>{line}</p>)}
      {chapter.id==='medication'&&!!report.medicationReminders?.length&&<details className="visit-chapter-details" open={readOnly}><summary>展开用药计划与完整周历 · {report.medicationReminders.length} 项</summary><p className="visit-muted">计划与实际使用分开。未来、未确认和已归档计划只在这里核对。</p>{report.medicationReminders.map(r=><ReadOnlyMedicationReminderCard key={r.id} reminder={r} now={new Date(report.generatedAt)} onEvidence={onEvidence} expanded={readOnly}/>)}</details>}
      {!!chapter.blocks.length&&<details className="visit-chapter-details" open={readOnly}><summary>{{overview:'展开病情数据与依据',course:'展开经过与依据',medication:'查看完整用药经过',allergy:'展开过敏资料与观察过程',history:'展开既往与其他背景',temperature:'展开体温曲线与测量记录',growth:'展开成长曲线与日常记录',visits:'展开就诊与检查依据',sources:'展开资料说明'}[chapter.id]}</summary>
      {chapter.summary && <p className="visit-intro">{chapter.summary}</p>}
      {chapter.blocks.map((block, index) => {
        const content = <>
          <h3>{block.title}</h3>
          {typeof block.related==='boolean'&&<p className="visit-muted" data-copy-related>{block.related?'与本次有明确记录关联':'与本次关系尚未建立，保留供核对'}</p>}
          {block.lines.map((line, i) => (
            <p key={i}>
              <Emphasized text={line} />
            </p>
          ))}
          {block.entries?.map((entry,i)=><article className="visit-observation-entry" key={i}><h3>{entry.title}</h3>{entry.lines.map((line,j)=><p key={j}>{line}</p>)}{readOnly ? entry.sourceIds.map(id=><a key={id} href={`#${id}`}>{report.sources.find(s=>s.id===id)?.code} 查看依据</a>) : <button className="visit-text-action" onClick={()=>onEvidence?.(entry.sourceIds)}>查看当次依据</button>}</article>)}
          {block.distribution && <details open={readOnly} className="visit-statistics"><summary>展开记录构成明细</summary><FactDistribution values={block.distribution}/>{block.distributionNote&&<p>{block.distributionNote}</p>}</details>}
          {block.locations?.length ? (
            <ul className="visit-locations">
              {block.locations.map((l) => (
                <li key={l}>
                  <MapPin size={16} />
                  {l}
                </li>
              ))}
            </ul>
          ) : null}
          {block.points && (
            <>
              <FactLineChart
                points={block.points}
                unit={block.unit ?? ''}
                label={block.title}
                onPoint={onEvidence ? (id) => onEvidence([id]) : undefined}
                scatter={block.chartMode === 'scatter'}
                domain={block.unit === '℃' ? [36,40] : undefined}
              />
              <ul className="visit-point-list">
                {[...block.points].reverse().map((p, i) => (
                  <li key={`${p.sourceId}:${i}`}>
                    {readOnly ? (
                      <a href={`#${p.sourceId}`}>
                        <strong>
                          {p.value} {block.unit}
                        </strong>{' '}
                        · {reportTime(p.at, report.timezone)}
                      </a>
                    ) : (
                      <button onClick={() => onEvidence?.([p.sourceId])}>
                        <strong>
                          {p.value} {block.unit}
                        </strong>
                        <span>{reportTime(p.at, report.timezone)}</span>
                      </button>
                    )}
                    {p.detail && <small>{p.detail}</small>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {block.sourceIds.length > 0 &&
            (readOnly ? (
              <p className="visit-source-links">
                依据：
                {block.sourceIds.map((id) => (
                  <a key={id} href={`#${id}`}>
                    [{report.sources.find(s=>s.id===id)?.code ?? '来源'}]{' '}
                  </a>
                ))}
              </p>
            ) : (
              <button
                className="visit-text-action"
                onClick={() => onEvidence?.(block.sourceIds)}
              >
                查看依据 · {block.sourceIds.length} 项
              </button>
            ))}
        </>
        return block.secondary && !readOnly ? <details className="visit-fact-block" key={index}><summary>{block.title} · 展开明细</summary>{content}</details> : <section className="visit-fact-block" data-report-source-ids={readOnly?JSON.stringify(block.sourceIds):undefined} key={index}>{content}</section>
      })}
      </details>}
      {trailing}
      {chapter.id==='sources'&&Object.values(report.notes).some(Boolean)&&<details className="visit-parent-note" open={readOnly}><summary>历史家长补充 · 报告说明</summary>{Object.entries(report.notes).filter(([,v])=>v).map(([id,note])=><section key={id}><h3>{report.chapters.find(c=>c.id===id)?.title}</h3><p>{note}</p></section>)}<small>保留已有说明，不替代原始记录。</small></details>}
    </section>
  )
}
