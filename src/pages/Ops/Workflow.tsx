import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MaterialIcon } from '../../components/icons'
import { HohoButton } from '../../components/design-system/HohoButton'
import { useResource } from './Modules'
import './workflow.css'

const labels = {
  running: '进程已响应', recorded: '有登记回执', retained: '旧链路保留', pending: '待核验', planned: '尚未接入',
  history: '历史节点', config: '按功能查看配置', implemented: '代码已接入', configured: '已配置 · 未探活', invalid: '配置异常', off: '未配置 / 未启用', local: '本地能力',
}
type State = keyof typeof labels
type Node = { title: string; term: string; state: State; detail: string; evidence: string; next: string[]; link?: [string, string] }
type Lane = { title: string; note: string; tone: 'history' | 'traffic' | 'pending' | 'business' | 'observe'; steps: { node: string; via?: string }[] }
type View = { id: string; title: string; detail: string; stages: { title: string; nodes: string[] }[]; lanes?: Lane[] }
type Workflow = {
  checkedAt: string
  runtime: { context: 'production' | 'development'; site: string | null; revision: string | null }
  views: View[]
  nodes: Record<string, Node>
  ai: { id: string; title: string; usage: string; state: State; provider: string | null; models: string[] }[]
  aiEvaluation: string
}

const stamp = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Shanghai' })
const statusTone = (state: State) => state === 'running' ? 'online' : state === 'invalid' ? 'critical' : state === 'pending' || state === 'off' ? 'notice' : 'unknown'
const Status = ({ state }: { state: State }) => <span className="ops-module-status" data-state={statusTone(state)}>{labels[state]}</span>
const contains = (view: View, node: string) => view.stages.some(stage => stage.nodes.includes(node))

export function OpsWorkflowPage() {
  const { data, error, loading, reload } = useResource<Workflow>('/api/ops/workflow')
  const [params, setParams] = useSearchParams()
  const view = data?.views.find(item => item.id === params.get('view')) ?? data?.views[0]
  const requested = params.get('node')
  const selected = view && requested && contains(view, requested) ? requested : null
  const detail = selected && data ? data.nodes[selected] : null
  const heading = useRef<HTMLHeadingElement>(null)
  const jump = useRef(false)
  useEffect(() => {
    if (!jump.current || !detail) return
    jump.current = false
    heading.current?.focus({ preventScroll: true })
    heading.current?.scrollIntoView({ block: 'nearest' })
  }, [selected, view?.id, detail])
  function choose(next: View, target?: string) {
    jump.current = Boolean(target)
    if (target && target === selected && view?.id === next.id) {
      jump.current = false
      heading.current?.focus()
      return
    }
    setParams(previous => {
      const updated = new URLSearchParams(previous)
      updated.set('view', next.id)
      if (target) updated.set('node', target)
      else updated.delete('node')
      return updated
    }, { preventScrollReset: true })
  }
  return <main className="ops-module-page ops-flow" aria-label="工作流">
    <header className="ops-overview-heading ops-flow-heading">
      <div><p className="ops-flow-eyebrow">护护记录 · 生产架构</p><h1>工作流</h1><p>点节点看职责和配置；沿带说明的箭头追踪请求、数据或观测结果。</p></div>
      <HohoButton variant="secondary" loading={loading} onClick={reload}>重新读取</HohoButton>
    </header>
    {error && <div className="ops-error" role="alert">读取失败。{data ? '下方是上次成功读取的快照。' : '暂时无法显示生产配置。'}<button type="button" onClick={reload}>重试</button></div>}
    {!data && !error && <p role="status">正在读取当前工作流…</p>}
    {data && view && <>
      <dl className="ops-flow-runtime">
        <div><dt>当前应答</dt><dd>{data.runtime.context === 'production' ? '生产模式' : '非生产模式'}</dd></div>
        <div><dt>实例所在</dt><dd>{data.runtime.site ?? '当前实例未提供地域标记'}</dd></div>
        <div><dt>部署版本</dt><dd>{data.runtime.revision ? <a href={`https://github.com/Hoooho-app/hoooho.app/commit/${data.runtime.revision}`} target="_blank" rel="noreferrer">{data.runtime.revision.slice(0, 9)}</a> : '无运行提交回执'}</dd></div>
        <div><dt>{error ? '上次成功读取' : '读取时间（北京）'}</dt><dd><time dateTime={data.checkedAt}>{stamp.format(new Date(data.checkedAt))}</time></dd></div>
      </dl>
      <nav className="ops-flow-views" aria-label="查看生产链路">
        {data.views.map(item => <HohoButton key={item.id} variant={view.id === item.id ? 'primary' : 'secondary'} aria-pressed={view.id === item.id} onClick={() => choose(item)}>{item.title}</HohoButton>)}
      </nav>
      <p className="ops-flow-scope">{view.detail}</p>
      {!!view.lanes?.length && <section className="ops-flow-routes" aria-label={`${view.title}流程图`}>
        <header><h2>链路图</h2><p>虚线表示历史关系、待核验路径或只读观测；不会把它们当成正式请求。</p></header>
        {view.lanes.map(lane => <section key={lane.title} className="ops-flow-lane" data-tone={lane.tone} aria-label={lane.title}>
          <header><h3>{lane.title}</h3><p>{lane.note}</p></header>
          <ol className="ops-flow-steps">
            {lane.steps.map((step, index) => <li key={step.node}>
              {index > 0 && <span className="ops-flow-edge"><span>{step.via}</span><i aria-hidden="true" /></span>}
              <button type="button" aria-label={`查看链路节点：${data.nodes[step.node].title}`} aria-pressed={step.node === selected} onClick={() => choose(view, step.node)}>{data.nodes[step.node].title}</button>
            </li>)}
          </ol>
        </section>)}
      </section>}
      <h2 className="ops-flow-index-heading">模块索引</h2>
      <ul className="ops-flow-map" aria-label={`${view.title}模块索引`}>
        {view.stages.map(stage => <li key={stage.title} className="ops-flow-stage"><h3>{stage.title}</h3><ul>
          {stage.nodes.map(id => {
            const node = data.nodes[id]
            return <li key={id}><button type="button" className="ops-flow-node" aria-pressed={id === selected} onClick={() => choose(view, id)}>
              <strong>{node.title}<MaterialIcon name="chevron_right" aria-hidden="true" size={17} /></strong>
              <small>{node.term}</small><Status state={node.state} />
            </button></li>
          })}
        </ul></li>)}
      </ul>
      <section className="ops-module-card ops-flow-detail" aria-label="节点详情">
        {detail ? <>
          <header><div><small>节点详情 · {detail.term}</small><h2 tabIndex={-1} ref={heading}>{detail.title}</h2></div><Status state={detail.state} /></header>
          <p>{detail.detail}</p><p className="ops-flow-evidence">依据：{detail.evidence}</p>
          {selected === 'agent' && <ul className="ops-flow-models" aria-label="Agent AI 所用能力">{data.ai.map(row => <li key={row.id}>
            <div><strong>{row.title}</strong><p>{row.usage}</p></div>
            <div><span>{row.provider ?? '—'}{row.models.length ? ` · ${row.models.join(' / ')}` : ''}</span><Status state={row.state} /></div>
          </li>)}</ul>}
          {selected === 'agent' && <p className="ops-flow-evidence">{data.aiEvaluation}</p>}
          {detail.next.length > 0 && <nav className="ops-flow-links" aria-label="继续查看关联环节"><span>下一环 / 相关节点</span>{detail.next.map(id => {
            const next = contains(view, id) ? view : data.views.find(item => contains(item, id))
            return next && <HohoButton key={id} variant="secondary" onClick={() => choose(next, id)}>{data.nodes[id].title} →</HohoButton>
          })}</nav>}
          {detail.link && (detail.link[1].startsWith('/') ? <Link to={detail.link[1]}>{detail.link[0]} ↗</Link> : <a href={detail.link[1]} target="_blank" rel="noreferrer">{detail.link[0]} ↗</a>)}
        </> : <p className="ops-module-muted">选择上方任一节点，查看它的职责、状态依据和下一环。这里不改配置，也不发起发布或模型调用。</p>}
      </section>
    </>}
  </main>
}
