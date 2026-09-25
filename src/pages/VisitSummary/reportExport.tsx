import { renderToStaticMarkup } from 'react-dom/server'
import type { VisitSheet } from '../../types/visitSheet'
import { ReportChapter, reportTime, SourceText } from './ReportChapter'
import css from './report.css?inline'
import chartCss from '../../components/design-system/FactCharts.css?inline'

export function reportText(report: VisitSheet) {
  return [
    `Hoooho 就诊情况单 · ${report.member.name} · v${report.version}`,
    `资料截至 ${report.dataAsOf}；时区 ${report.timezone}`,
    `主诉：${report.complaint}（${report.focus.mode === 'custom' ? '家长本次陈述' : report.focus.mode === 'auto' ? '最近有效症状预选' : '家长选择'}）`,
    ...report.warnings,
    ...report.chapters.flatMap((c) => [
      `\n## ${c.title}`,
      c.summary,
      ...c.blocks.flatMap((b) => [
        b.title,
        ...b.lines,
        ...(b.distribution ?? []).map((v) => `${v.label}：${v.count}`),
        ...(b.points ?? []).map(
          (p) =>
            `${p.at}：${p.value} ${b.unit}；${p.detail ?? ''} [${p.sourceId}]`,
        ),
        `依据：${b.sourceIds.join('，')}`,
      ]),
      ...(report.notes[c.id] ? [`家长补充：${report.notes[c.id]}`] : []),
    ]),
    `\n本次想问（家长填写）：${report.question || '未填写'}`,
    '\n## 完整原始依据',
    ...report.sources.map(
      (s) =>
        `[${s.id}] ${s.title}\n${s.identity}；发生：${s.occurredAt ?? '未提供'}；录入：${s.createdAt ?? '未提供'}\n${s.text}`,
    ),
    '\n附件仅含索引，未包含原件。',
    '\n## 变更追溯',
    ...report.changes.map(
      (c) => `${c.at} [${c.sourceId}]\n修改前：${c.before}\n修改后：${c.after}`,
    ),
    '资料用于沟通，不替代诊断；缺失不表示没有，记录条数不是发作次数。',
  ].join('\n')
}
export function reportHtml(report: VisitSheet) {
  const body = renderToStaticMarkup(
    <main className="visit-report visit-offline">
      <header>
        <strong>Hoooho / 就诊情况单</strong>
        <p>
          {report.member.name} · v{report.version} · 固定只读快照
        </p>
        <p>
          资料截至 {reportTime(report.dataAsOf, report.timezone)} ·{' '}
          {report.timezone}
        </p>
        <h2>本次主诉</h2>
        <p>{report.complaint}</p>
      </header>
      <details className="visit-offline-nav">
        <summary>章节目录</summary>
        <nav>
          {report.chapters.map((c) => (
            <a href={`#chapter-${c.id}`} key={c.id}>
              {c.title}
            </a>
          ))}
        </nav>
      </details>
      {report.warnings.map((w) => (
        <p key={w}>{w}</p>
      ))}
      {report.chapters.map((c) => (
        <ReportChapter key={c.id} chapter={c} report={report} readOnly />
      ))}
      <section>
        <h2>完整依据</h2>
        <p>附件仅含索引，未包含原件；已包含的正文与数值可离线阅读。</p>
        {report.sources.map((s) => (
          <details id={s.id} key={s.id} open>
            <summary>{s.title}</summary>
            <SourceText source={s} />
          </details>
        ))}
      </section>
      {report.changes.length > 0 && (
        <section>
          <h2>变更追溯</h2>
          {report.changes.map((c, i) => (
            <article key={i}>
              <p>
                {c.at} · {c.sourceId}
              </p>
              <p>修改前：{c.before}</p>
              <p>修改后：{c.after}</p>
            </article>
          ))}
        </section>
      )}
    </main>,
  )
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hoooho 就诊情况单</title><style>:root{--hoho-color-primary:27 122 110;--hoho-color-text-primary:24 49 47;--hoho-color-text-secondary:82 105 102;--hoho-color-border:219 228 224;--hoho-color-surface:255 255 255;--hoho-color-primary-soft:233 246 242;--hoho-color-warning:166 105 34;--hoho-color-info:48 103 152;--hoho-font-family:system-ui,sans-serif;--hoho-font-size-body:15px;--hoho-radius-card:16px}body{margin:0;background:white}*{box-sizing:border-box}${css}${chartCss}</style></head><body>${body}</body></html>`
}
export function downloadReport(report: VisitSheet) {
  const url = URL.createObjectURL(
    new Blob([reportHtml(report)], { type: 'text/html;charset=utf-8' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = `Hoooho-就诊情况单-v${report.version}.html`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
export function printReport(report: VisitSheet) {
  const frame = document.createElement('iframe')
  frame.title = '打印当前情况单'
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;'
  frame.srcdoc = reportHtml(report)
  frame.onload = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 60000)
  }
  document.body.append(frame)
}
