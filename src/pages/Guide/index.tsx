import { ArrowRight, ChevronRight, Search, X } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import {
  getGuideTutorial,
  guideFilters,
  guideSectionLabels,
  guideTips,
  guideTutorials,
  searchGuideTutorials,
  type GuideFilterId,
  type GuideSectionId,
  type GuideTutorial
} from '../../features/guide/tutorials'
import { TutorialDetailSheet } from './TutorialDetailSheet'
import { TutorialMedia } from './TutorialMedia'

const sectionOrder: GuideSectionId[] = ['record', 'observe', 'visit', 'family']

function TutorialActions({ onDetail, tutorial }: { onDetail: () => void; tutorial: GuideTutorial }) {
  return <div className="guide-tutorial-actions">
    <Link to={tutorial.actionTo} state={{ fromGuide: true }}>{tutorial.actionLabel}<ArrowRight size={15} /></Link>
    <button onClick={onDetail} type="button">查看详细步骤<ChevronRight size={15} /></button>
  </div>
}

export function UsageGuidePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const rawFilter = searchParams.get('category') ?? 'all'
  const filter: GuideFilterId = ['first', 'record', 'visit', 'family'].includes(rawFilter) ? rawFilter as GuideFilterId : 'all'
  const selectedTutorial = getGuideTutorial(searchParams.get('tutorial'))
  const results = useMemo(() => searchGuideTutorials(query, filter), [filter, query])
  const searching = Boolean(query.trim()) || filter !== 'all'
  const coreTutorials = guideTutorials.filter((tutorial) => tutorial.core)

  const updateParams = (updates: Record<string, string | null>, replace = true) => {
    const next = new URLSearchParams(searchParams)
    Object.entries(updates).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key))
    setSearchParams(next, { replace })
  }
  const openDetail = (tutorial: GuideTutorial) => updateParams({ tutorial: tutorial.id }, false)

  return <main className="app-shell guide-shell pb-0">
    <WebPageHeader title="使用说明" fallback="/health-events" />
    <div className="guide-content">
      <header className="guide-intro">
        <p className="guide-kicker">真实操作案例</p>
        <h2>你想用 Hoooho 做什么？</h2>
        <p>看一遍真实操作，就能快速开始。</p>
      </header>

      <section className="guide-find" aria-label="搜索和场景筛选">
        <label className="guide-search" htmlFor="guide-query">
          <Search aria-hidden="true" size={19} />
          <span className="sr-only">搜索使用教程</span>
          <input autoComplete="off" id="guide-query" onChange={(event) => updateParams({ q: event.target.value || null })} placeholder="例如：怎么记录体温" type="search" value={query} />
          {query && <button aria-label="清空搜索" onClick={() => updateParams({ q: null })} type="button"><X size={16} /></button>}
        </label>
        <nav className="guide-scenarios" aria-label="使用场景">
          {guideFilters.map((item) => <button aria-pressed={filter === item.id} data-selected={filter === item.id} key={item.id} onClick={() => updateParams({ category: filter === item.id ? null : item.id })} type="button">
            <strong>{item.label}</strong><span>{item.description}</span>
          </button>)}
        </nav>
      </section>

      {searching ? <section className="guide-results" aria-live="polite">
        <div className="guide-section-heading">
          <div><p className="guide-kicker">找到 {results.length} 个教程</p><h2>{query ? `关于“${query}”` : guideFilters.find((item) => item.id === filter)?.label}</h2></div>
          <button onClick={() => updateParams({ q: null, category: null })} type="button">查看全部</button>
        </div>
        {results.length
          ? <div className="guide-result-list">{results.map((tutorial) => <TutorialRow key={tutorial.id} onDetail={() => openDetail(tutorial)} tutorial={tutorial} />)}</div>
          : <div className="guide-empty"><strong>暂时没有对应的已上线教程</strong><p>可以换一个说法，或从下面的真实使用场景开始。</p><button onClick={() => updateParams({ q: null, category: null })} type="button">浏览全部教程</button></div>}
      </section> : <>
        <section className="guide-core" aria-labelledby="guide-core-title">
          <div className="guide-section-heading"><div><p className="guide-kicker">先看这三个</p><h2 id="guide-core-title">三分钟了解 Hoooho</h2></div><p>全部来自手机端真实操作</p></div>
          <div className="guide-core-list">{coreTutorials.map((tutorial, index) => <article className="guide-core-item" key={tutorial.id}>
            <header><span>{index + 1} / {coreTutorials.length}</span><h3>{tutorial.title}</h3><p>{tutorial.context}</p></header>
            {tutorial.media && <TutorialMedia id={tutorial.id} media={tutorial.media} title={tutorial.title} />}
            <ol>{tutorial.steps.map((step) => <li key={step}>{step}</li>)}</ol>
            <section className="guide-result"><span>完成后</span><p>{tutorial.result}</p></section>
            <TutorialActions onDetail={() => openDetail(tutorial)} tutorial={tutorial} />
          </article>)}</div>
        </section>

        <section className="guide-library" aria-labelledby="guide-library-title">
          <div className="guide-section-heading"><div><p className="guide-kicker">按你要做的事查找</p><h2 id="guide-library-title">更多使用案例</h2></div></div>
          {sectionOrder.map((section) => {
            const sectionTutorials = guideTutorials.filter((tutorial) => tutorial.section === section && !tutorial.core)
            const copy = guideSectionLabels[section]
            return <section className="guide-task-section" key={section}>
              <header><h3>{copy.title}</h3><p>{copy.description}</p></header>
              <div className="guide-result-list">{sectionTutorials.map((tutorial) => <TutorialRow key={tutorial.id} onDetail={() => openDetail(tutorial)} tutorial={tutorial} />)}</div>
            </section>
          })}
        </section>

        <section className="guide-tips" aria-labelledby="guide-tips-title">
          <div className="guide-section-heading"><div><p className="guide-kicker">更省事的用法</p><h2 id="guide-tips-title">你可能还不知道</h2></div></div>
          <div>{guideTips.map((tip) => <p key={tip}>{tip}</p>)}</div>
        </section>
      </>}

      <footer className="guide-boundary">Hoooho 用于记录和整理健康信息，不提供医疗诊断。情况紧急时，请及时联系当地急救服务或专业医疗人员。</footer>
    </div>
    <TutorialDetailSheet onClose={() => updateParams({ tutorial: null }, false)} tutorial={selectedTutorial} />
  </main>
}

function TutorialRow({ onDetail, tutorial }: { onDetail: () => void; tutorial: GuideTutorial }) {
  return <article className="guide-tutorial-row">
    <button onClick={onDetail} type="button"><span><strong>{tutorial.title}</strong><small>{tutorial.context}</small></span><ChevronRight size={18} /></button>
    <Link to={tutorial.actionTo} state={{ fromGuide: true }}>{tutorial.actionLabel}</Link>
  </article>
}
