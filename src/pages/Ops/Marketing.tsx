import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HohoButton } from '../../components/design-system/HohoButton'
import { MaterialIcon } from '../../components/icons'
import { OPS_PROJECTS, isOpsProject } from '../../../shared/ops-projects.mjs'
import { OpsProjectPicker } from './workspace'
import { HOOOHO_POSITIONING, MARKETING_GROUPS, MARKETING_REVIEW_DATE, marketingCopy, marketingPages } from './marketingCatalog'
import './marketing.css'

type CopyResult = { state: 'pending' | 'success' | 'failed'; label: string; text: string; view: string } | null
export function OpsMarketingPage() {
  const [params, setParams] = useSearchParams()
  const requestedProject = params.get('project')
  const project = requestedProject === 'all' || isOpsProject(requestedProject) ? requestedProject! : 'hoooho'
  const ready = project === 'hoooho' || project === 'all'
  const group = MARKETING_GROUPS.some(item => item.id === params.get('group')) ? params.get('group')! : 'all'
  const query = params.get('q') ?? ''
  const requestedPage = params.get('page')
  const pages = marketingPages()
  const visible = ready ? pages.filter(page => (group === 'all' || page.group === group) && `${page.name} ${page.headline} ${page.copy} ${page.coverage.join(' ')} ${page.scene} ${page.value}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : []
  const selected = requestedPage ? visible.find(page => page.id === requestedPage) : visible[0]
  const view = `${project}|${group}|${query}|${selected?.id ?? ''}`
  const activeView = useRef(view); activeView.current = view
  const copyGeneration = useRef(0)
  const [copy, setCopy] = useState<CopyResult>(null)
  const fallback = useRef<HTMLTextAreaElement>(null)
  const status = copy?.view === view ? copy : null
  useEffect(() => { if (status?.state === 'failed') { fallback.current?.focus(); fallback.current?.select() } }, [status])
  const updateFilter = (key: string, value: string) => setParams(previous => {
    const next = new URLSearchParams(previous)
    if (value && value !== 'all') next.set(key, value); else next.delete(key)
    next.delete('page'); return next
  }, { replace: true })
  const chooseProject = (id: string) => setParams({ project: id })
  const resetFilters = () => setParams({ project }, { replace: true })
  const selectPage = (id: string) => {
    setParams(previous => { const next = new URLSearchParams(previous); next.set('page', id); return next })
    if (window.matchMedia('(max-width: 1100px)').matches) requestAnimationFrame(() => document.getElementById('marketing-detail')?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }))
  }
  const copyText = async (label: string, text: string) => {
    const generation = ++copyGeneration.current
    const owner = view
    setCopy({ state: 'pending', label, text, view: owner })
    try {
      await navigator.clipboard.writeText(text)
      if (activeView.current === owner && generation === copyGeneration.current) setCopy({ state: 'success', label, text, view: owner })
    } catch {
      if (activeView.current === owner && generation === copyGeneration.current) setCopy({ state: 'failed', label, text, view: owner })
    }
  }
  const name = OPS_PROJECTS.find(item => item.id === project)?.name ?? '该项目'
  return <main className="ops-marketing" aria-label="产品运营">
    <header className="ops-overview-heading"><div><h1>产品运营</h1><p>按项目整理产品价值与页面卖点，作为后续宣传文案的起点。</p></div><span className="ops-marketing-draft">运营工作稿</span></header>
    <OpsProjectPicker fallback="hoooho" resetParams={['q', 'group', 'page']}/>
    {!ready ? <section className="ops-inbox-empty"><MaterialIcon name="lightbulb" size={32}/><h2>{name}的运营资料暂未建设</h2><p>本轮先整理护护记录，其他项目后续再补。</p><HohoButton variant="secondary" onClick={() => chooseProject('hoooho')}>查看护护记录</HohoButton></section> : <>
      <section className="ops-marketing-positioning" aria-label="产品定位">
        <div className="ops-marketing-intro"><div><span className="ops-marketing-eyebrow">护护记录 · 当前体验版</span><h2>{HOOOHO_POSITIONING.headline}</h2><p>{HOOOHO_POSITIONING.copy}</p><small>面向：{HOOOHO_POSITIONING.audience}</small></div><HohoButton variant="secondary" onClick={() => void copyText('产品定位', `${HOOOHO_POSITIONING.headline}\n\n${HOOOHO_POSITIONING.copy}`)}><MaterialIcon name="description" size={17}/>复制产品介绍</HohoButton></div>
        <div className="ops-marketing-pillars">{HOOOHO_POSITIONING.pillars.map((item, index) => <article key={item.title}><span>0{index + 1}</span><h3>{item.title}</h3><p>{item.detail}</p></article>)}</div>
      </section>
      <section className="ops-marketing-pages" aria-label="页面卖点资料">
        <div className="ops-marketing-section-heading"><div><h2>页面卖点</h2><p>{pages.length} 个页面与流程条目 · 按当前可见界面整理 · {MARKETING_REVIEW_DATE}</p></div><label className="ops-marketing-search"><MaterialIcon name="search" size={18}/><span className="sr-only">搜索页面卖点</span><input type="search" aria-label="搜索页面卖点" placeholder="搜索页面、场景或关键词" value={query} onChange={event => updateFilter('q', event.target.value)}/></label></div>
        <nav className="ops-marketing-groups" aria-label="卖点分类">{[{ id: 'all', name: '全部页面' }, ...MARKETING_GROUPS].map(item => <button type="button" key={item.id} aria-pressed={group === item.id} onClick={() => updateFilter('group', item.id)}>{item.name}<span>{pages.filter(page => item.id === 'all' || page.group === item.id).length}</span></button>)}</nav>
        {!visible.length ? <div className="ops-inbox-empty"><h3>没有匹配的页面卖点</h3><p>换个关键词，或清除分类与搜索条件。</p><HohoButton variant="secondary" onClick={resetFilters}>查看全部页面</HohoButton></div> : <div className="ops-marketing-workbench">
          <nav className="ops-marketing-list" aria-label="页面卖点目录">{visible.map(page => <button type="button" key={page.id} aria-current={selected?.id === page.id ? 'true' : undefined} aria-controls="marketing-detail" onClick={() => selectPage(page.id)}><span>{MARKETING_GROUPS.find(item => item.id === page.group)?.name}</span><strong>{page.name}</strong><small>{page.headline}</small><MaterialIcon name="chevron_right" size={18}/></button>)}</nav>
          <section className="ops-marketing-detail" id="marketing-detail" aria-label="选中页面卖点" aria-live="polite">{selected ? <>
            <header><div><span className="ops-marketing-eyebrow">护护记录 / {MARKETING_GROUPS.find(item => item.id === selected.group)?.name}</span><h2>{selected.name}</h2></div><a href={selected.path} target="_blank" rel="noopener noreferrer">查看前端<MaterialIcon name="open_in_new" size={16}/></a></header>
            <p className="ops-marketing-coverage">覆盖：{selected.coverage.join(' · ')}</p>
            <dl className="ops-marketing-brief"><div><dt>用户场景</dt><dd>{selected.scene}</dd></div><div><dt>核心卖点</dt><dd>{selected.value}</dd></div></dl>
            <div className="ops-marketing-copy"><div><h3>建议文案</h3><span>工作稿 · 待用于素材时再确认</span></div><h4>{selected.headline}</h4><p>{selected.copy}</p><HohoButton onClick={() => void copyText(selected.name, marketingCopy(selected))}><MaterialIcon name="description" size={17}/>复制这条文案</HohoButton></div>
            <details className="ops-marketing-evidence" open><summary>界面依据与表达边界</summary><dl><div><dt>界面依据</dt><dd>{selected.evidence}</dd></div><div><dt>表达边界</dt><dd>{selected.boundary}</dd></div></dl></details>
          </> : <div className="ops-inbox-empty"><h3>这个条目已不在当前目录中</h3><p>从左侧选择一个页面，或查看全部页面。</p><HohoButton variant="secondary" onClick={resetFilters}>查看全部页面</HohoButton></div>}</section>
        </div>}
      </section>
      <p className="ops-marketing-footnote">这是一份运营资料框架。页面详情、表单和分享等子流程按所属页面归并；素材制作与发布后续再建设。</p>
    </>}
    {status && <div className="ops-marketing-copy-result" role="status">{status.state === 'pending' ? '正在复制…' : status.state === 'success' ? `已复制：${status.label}` : <><p>复制未完成，请选中下方文字手动复制。</p><textarea ref={fallback} aria-label="待手动复制的文案" readOnly value={status.text}/></>}</div>}
  </main>
}
